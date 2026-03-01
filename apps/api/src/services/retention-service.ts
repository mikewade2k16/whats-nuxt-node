import { prisma } from "../db.js";

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

export async function runRetentionSweep(referenceDate = new Date()): Promise<RetentionSweepResult> {
  const startedAt = new Date();
  const tenants = await prisma.tenant.findMany({
    select: {
      id: true,
      retentionDays: true
    }
  });

  const perTenant: TenantRetentionSweepResult[] = [];
  let deletedMessagesTotal = 0;
  let deletedConversationsTotal = 0;

  for (const tenant of tenants) {
    const cutoff = buildCutoff(referenceDate, tenant.retentionDays);

    const deletedMessages = await prisma.message.deleteMany({
      where: {
        tenantId: tenant.id,
        createdAt: {
          lt: cutoff
        }
      }
    });

    const deletedConversations = await prisma.conversation.deleteMany({
      where: {
        tenantId: tenant.id,
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
      tenantId: tenant.id,
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
