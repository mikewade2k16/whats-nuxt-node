import type { FastifyInstance } from "fastify";
import { MessageStatus, Prisma } from "@prisma/client";
import { prisma } from "../../db.js";
import { requireAdminOrSupervisor } from "../../lib/guards.js";
import { getHttpEndpointMetricsSnapshot } from "../../services/http-metrics.js";
import { toUtcDayKey } from "./helpers.js";
import {
  failuresDashboardQuerySchema,
  httpEndpointMetricsQuerySchema,
  listAuditEventsQuerySchema
} from "./schemas.js";

export function registerTenantAuditRoutes(protectedApp: FastifyInstance) {
  protectedApp.get("/tenant/audit-events", async (request, reply) => {
    if (!requireAdminOrSupervisor(request, reply)) {
      return;
    }

    const query = listAuditEventsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        message: "Query invalida",
        errors: query.error.flatten()
      });
    }

    const where: Prisma.AuditEventWhereInput = {
      tenantId: request.authUser.tenantId
    };

    if (query.data.before) {
      where.createdAt = { lt: query.data.before };
    }

    if (query.data.eventType) {
      where.eventType = query.data.eventType;
    }

    if (query.data.conversationId) {
      where.conversationId = query.data.conversationId;
    }

    if (query.data.messageId) {
      where.messageId = query.data.messageId;
    }

    if (query.data.actorUserId) {
      where.actorUserId = query.data.actorUserId;
    }

    const rows = await prisma.auditEvent.findMany({
      where,
      take: query.data.limit + 1,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: {
        actorUser: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true
          }
        },
        conversation: {
          select: {
            id: true,
            channel: true,
            externalId: true,
            contactName: true
          }
        },
        message: {
          select: {
            id: true,
            direction: true,
            messageType: true,
            status: true
          }
        }
      }
    });

    const hasMore = rows.length > query.data.limit;
    const events = hasMore ? rows.slice(0, query.data.limit) : rows;
    const nextBefore =
      hasMore && events.length > 0 ? events[events.length - 1]?.createdAt.toISOString() : null;

    return {
      events,
      hasMore,
      nextBefore
    };
  });

  protectedApp.get("/tenant/metrics/failures", async (request, reply) => {
    if (!requireAdminOrSupervisor(request, reply)) {
      return;
    }

    const query = failuresDashboardQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        message: "Query invalida",
        errors: query.error.flatten()
      });
    }

    const now = new Date();
    const since = new Date(now.getTime() - query.data.days * 24 * 60 * 60 * 1000);
    const where: Prisma.MessageWhereInput = {
      tenantId: request.authUser.tenantId,
      status: MessageStatus.FAILED,
      createdAt: {
        gte: since
      }
    };

    type DailyFailureRow = {
      day: Date;
      messageType: string;
      total: number;
    };

    const [failedByTypeRaw, failedTotal, recentFailures, dailyRowsRaw] = await prisma.$transaction([
      prisma.message.groupBy({
        by: ["messageType"],
        where,
        _count: {
          messageType: true
        },
        orderBy: {
          _count: {
            messageType: "desc"
          }
        }
      }),
      prisma.message.count({
        where
      }),
      prisma.message.findMany({
        where,
        orderBy: {
          createdAt: "desc"
        },
        take: 20,
        select: {
          id: true,
          conversationId: true,
          messageType: true,
          content: true,
          createdAt: true,
          status: true,
          conversation: {
            select: {
              contactName: true,
              externalId: true
            }
          }
        }
      }),
      prisma.$queryRaw<DailyFailureRow[]>(Prisma.sql`
        select
          date_trunc('day', "createdAt") as day,
          "messageType"::text as "messageType",
          count(*)::int as total
        from "Message"
        where "tenantId" = ${request.authUser.tenantId}
          and "status" = 'FAILED'::"MessageStatus"
          and "createdAt" >= ${since}
        group by 1, 2
        order by 1 asc
      `)
    ]);

    const messageTypes = ["TEXT", "IMAGE", "AUDIO", "VIDEO", "DOCUMENT"] as const;
    const failedByType = failedByTypeRaw
      .map((entry) => {
        const total =
          typeof entry._count === "object" &&
          entry._count !== null &&
          "messageType" in entry._count
            ? Number((entry._count as { messageType?: number }).messageType ?? 0)
            : 0;

        return {
          messageType: entry.messageType,
          total
        };
      })
      .sort((left, right) => right.total - left.total);

    const dayMap = new Map<
      string,
      {
        day: string;
        total: number;
        byType: Record<string, number>;
      }
    >();

    for (let offset = query.data.days; offset >= 0; offset -= 1) {
      const dayDate = new Date(now.getTime() - offset * 24 * 60 * 60 * 1000);
      const day = toUtcDayKey(dayDate);
      dayMap.set(day, {
        day,
        total: 0,
        byType: Object.fromEntries(messageTypes.map((type) => [type, 0]))
      });
    }

    for (const row of dailyRowsRaw) {
      const dayKey = toUtcDayKey(new Date(row.day));
      if (!dayMap.has(dayKey)) {
        dayMap.set(dayKey, {
          day: dayKey,
          total: 0,
          byType: Object.fromEntries(messageTypes.map((type) => [type, 0]))
        });
      }

      const current = dayMap.get(dayKey);
      if (!current) {
        continue;
      }

      const messageType = row.messageType.toUpperCase();
      const nextValue = Number(row.total) || 0;
      current.byType[messageType] = (current.byType[messageType] ?? 0) + nextValue;
      current.total += nextValue;
    }

    const dailySeries = [...dayMap.values()].sort((left, right) => left.day.localeCompare(right.day));

    return {
      generatedAt: now.toISOString(),
      windowDays: query.data.days,
      since: since.toISOString(),
      failedTotal,
      failedByType,
      dailySeries,
      recentFailures: recentFailures.map((entry) => ({
        id: entry.id,
        conversationId: entry.conversationId,
        messageType: entry.messageType,
        status: entry.status,
        createdAt: entry.createdAt,
        content: entry.content,
        contactName: entry.conversation.contactName,
        externalId: entry.conversation.externalId
      }))
    };
  });

  protectedApp.get("/tenant/metrics/http-endpoints", async (request, reply) => {
    if (!requireAdminOrSupervisor(request, reply)) {
      return;
    }

    const query = httpEndpointMetricsQuerySchema.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({
        message: "Query invalida",
        errors: query.error.flatten()
      });
    }

    return getHttpEndpointMetricsSnapshot({
      limit: query.data.limit,
      sortBy: query.data.sortBy,
      order: query.data.order,
      routeContains: query.data.routeContains
    });
  });
}
