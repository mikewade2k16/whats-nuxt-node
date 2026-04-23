import { prisma } from "../db.js";
import { DEFAULT_RETENTION_DAYS, listTenantRuntimeConfigs } from "./tenant-runtime.js";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface TenantRetentionSweepResult {
  tenantId: string;
  retentionDays: number;
  cutoffIso: string;
  deletedMessages: number;
  deletedConversations: number;
}

export interface RetentionSweepResult {
  startedAt: string;
  finishedAt: string;
  tenantsScanned: number;
  deletedMessages: number;
  deletedConversations: number;
  perTenant: TenantRetentionSweepResult[];
}

function buildCutoff(now: Date, retentionDays: number) {
  return new Date(now.getTime() - retentionDays * DAY_IN_MS);
}

async function listTenantIdsForSweep() {
  const [configs, conversationTenants, messageTenants] = await Promise.all([
    listTenantRuntimeConfigs(),
    prisma.conversation.findMany({
      select: {
        tenantId: true
      },
      distinct: ["tenantId"]
    }),
    prisma.message.findMany({
      select: {
        tenantId: true
      },
      distinct: ["tenantId"]
    })
  ]);

  const retentionByTenantId = new Map<string, number>(
    configs.map((entry) => [entry.tenantId, entry.retentionDays] as const)
  );
  const tenantIds = new Set<string>(configs.map((entry) => entry.tenantId));

  for (const entry of [...conversationTenants, ...messageTenants]) {
    tenantIds.add(entry.tenantId);
  }

  return [...tenantIds].map((tenantId) => ({
    tenantId,
    retentionDays: retentionByTenantId.get(tenantId) ?? DEFAULT_RETENTION_DAYS
  }));
}

export async function runRetentionSweep(referenceDate = new Date()): Promise<RetentionSweepResult> {
  const startedAt = new Date();
  const tenants = await listTenantIdsForSweep();

  const perTenant: TenantRetentionSweepResult[] = [];
  let deletedMessagesTotal = 0;
  let deletedConversationsTotal = 0;

  for (const tenant of tenants) {
    const cutoff = buildCutoff(referenceDate, tenant.retentionDays);

    const deletedMessages = await prisma.message.deleteMany({
      where: {
        tenantId: tenant.tenantId,
        createdAt: {
          lt: cutoff
        }
      }
    });

    const deletedConversations = await prisma.conversation.deleteMany({
      where: {
        tenantId: tenant.tenantId,
        lastMessageAt: {
          lt: cutoff
        },
        messages: {
          none: {}
        }
      }
    });

    deletedMessagesTotal += deletedMessages.count;
    deletedConversationsTotal += deletedConversations.count;

    perTenant.push({
      tenantId: tenant.tenantId,
      retentionDays: tenant.retentionDays,
      cutoffIso: cutoff.toISOString(),
      deletedMessages: deletedMessages.count,
      deletedConversations: deletedConversations.count
    });
  }

  return {
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
    tenantsScanned: tenants.length,
    deletedMessages: deletedMessagesTotal,
    deletedConversations: deletedConversationsTotal,
    perTenant
  };
}
