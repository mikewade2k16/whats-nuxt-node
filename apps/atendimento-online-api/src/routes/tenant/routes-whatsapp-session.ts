import type { FastifyInstance } from "fastify";
import { prisma } from "../../db.js";
import { requireAdmin } from "../../lib/guards.js";
import { EvolutionApiError } from "../../services/evolution-client.js";
import {
  buildWebhookHeaders,
  buildWebhookUrl,
  createEvolutionClientOrThrow,
  getTenantOrFail,
  isInstanceAlreadyInUseError,
  normalizeConnectionState,
  normalizeEvolutionApiKey,
  resolveConfiguredChannelCount
} from "./helpers.js";
import { bootstrapWhatsAppSchema, connectWhatsAppSchema } from "./schemas.js";
import {
  buildAutomaticWhatsAppInstanceName,
  ensureTenantWhatsAppRegistry,
  resolveTenantInstanceById
} from "../../services/whatsapp-instances.js";
import { deleteLatestQrCode } from "../../services/whatsapp-qr-cache.js";
import {
  resolveAdminClientByCoreTenantId,
  resolveAtendimentoSnapshot,
  resolveCurrentCoreTenant
} from "./atendimento-snapshot.js";

const CONNECT_REQUEST_COOLDOWN_MS = 30_000;
const HARD_RESET_RECREATE_RETRY_DELAY_MS = 1_500;
const lastConnectRequestAtByInstance = new Map<string, number>();

function buildConnectRequestKey(tenantId: string, instanceName: string) {
  return `${tenantId}:${instanceName}`;
}

function canIgnoreQrSessionResetError(error: EvolutionApiError) {
  return error.statusCode === 400 || error.statusCode === 404;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractFetchInstancesItems(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) {
    return payload.filter((entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null
    );
  }

  if (!payload || typeof payload !== "object") {
    return [];
  }

  const root = payload as Record<string, unknown>;
  for (const key of ["instances", "data", "response"]) {
    const candidate = root[key];
    if (Array.isArray(candidate)) {
      return candidate.filter((entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null
      );
    }
  }

  return [];
}

function findFetchInstanceSummary(payload: unknown, instanceName: string) {
  return extractFetchInstancesItems(payload).find((entry) => {
    const candidateName = String(entry.instanceName ?? entry.name ?? "").trim();
    return candidateName === instanceName;
  }) ?? null;
}

function parseOptionalNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const normalized = Number(String(value ?? "").trim());
  return Number.isFinite(normalized) ? normalized : null;
}

function resolveHardResetReason(params: {
  stateBefore: string;
  instanceSummary: Record<string, unknown> | null;
  missingInEvolution: boolean;
}) {
  if (params.missingInEvolution) {
    return "missing_instance" as const;
  }

  if (params.stateBefore === "refused") {
    return "state_refused" as const;
  }

  const disconnectionReasonCode = parseOptionalNumber(params.instanceSummary?.disconnectionReasonCode);
  const disconnectionText = JSON.stringify(params.instanceSummary?.disconnectionObject ?? "").toLowerCase();

  if (
    disconnectionReasonCode === 401 &&
    params.stateBefore !== "open" &&
    params.stateBefore !== "connected"
  ) {
    return "disconnection_401" as const;
  }

  if (
    params.stateBefore === "close" &&
    /unauthorized|log out instance|logged out/.test(disconnectionText)
  ) {
    return "close_after_logout" as const;
  }

  return null;
}

async function hardResetEvolutionInstance(params: {
  client: ReturnType<typeof createEvolutionClientOrThrow>;
  tenantId: string;
  tenantSlug: string;
  instanceName: string;
  connectKey: string;
  number?: string;
}) {
  const webhookUrl = buildWebhookUrl(params.tenantSlug);
  const webhookHeaders = buildWebhookHeaders();

  try {
    await params.client.logoutInstance(params.instanceName);
  } catch (error) {
    if (!(error instanceof EvolutionApiError) || !canIgnoreQrSessionResetError(error)) {
      throw error;
    }
  }

  try {
    await params.client.deleteInstance(params.instanceName);
  } catch (error) {
    if (!(error instanceof EvolutionApiError) || error.statusCode !== 404) {
      throw error;
    }
  }

  await deleteLatestQrCode(params.tenantId, params.instanceName);
  lastConnectRequestAtByInstance.delete(params.connectKey);
  await sleep(HARD_RESET_RECREATE_RETRY_DELAY_MS);

  let createResult: Record<string, unknown> | null = null;
  let recreated = false;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      createResult = await params.client.createInstance({
        instanceName: params.instanceName,
        webhookUrl,
        number: params.number,
        webhookHeaders
      });
      recreated = true;
      break;
    } catch (error) {
      const isRetriableConflict =
        error instanceof EvolutionApiError &&
        isInstanceAlreadyInUseError(error) &&
        attempt < 2;

      if (!isRetriableConflict) {
        if (error instanceof EvolutionApiError && isInstanceAlreadyInUseError(error)) {
          break;
        }

        throw error;
      }

      await sleep(HARD_RESET_RECREATE_RETRY_DELAY_MS);
    }
  }

  const webhookResult = await params.client.setWebhook({
    instanceName: params.instanceName,
    webhookUrl,
    webhookHeaders
  });

  return {
    webhookUrl,
    createResult,
    webhookResult,
    recreated
  };
}

async function findInstanceNameConflict(params: {
  instanceName: string;
  excludeInstanceId?: string | null;
}) {
  return prisma.whatsAppInstance.findFirst({
    where: {
      instanceName: params.instanceName,
      ...(params.excludeInstanceId
        ? {
            id: {
              not: params.excludeInstanceId
            }
          }
        : {})
    },
    select: { id: true, tenantId: true, instanceName: true }
  });
}

async function resolveNextTenantInstanceName(params: {
  tenantName: string;
  tenantSlug: string;
  excludeInstanceId?: string | null;
}) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = buildAutomaticWhatsAppInstanceName({
      tenantName: params.tenantName,
      tenantSlug: params.tenantSlug
    });

    if (!(await findInstanceNameConflict({
      instanceName: candidate,
      excludeInstanceId: params.excludeInstanceId
    }))) {
      return candidate;
    }
  }

  return buildAutomaticWhatsAppInstanceName({
    tenantName: params.tenantName,
    tenantSlug: params.tenantSlug,
    uniqueSuffix: Date.now()
  });
}

export function registerTenantWhatsAppSessionRoutes(protectedApp: FastifyInstance) {
  protectedApp.post("/tenant/whatsapp/bootstrap", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = bootstrapWhatsAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const existingInstances = await ensureTenantWhatsAppRegistry(tenant);
    const coreTenant = await resolveCurrentCoreTenant({
      coreTenantId: tenant.coreTenantId,
      slug: tenant.slug,
      name: tenant.name
    }, {
      accessToken: request.coreAccessToken
    });
    const adminClient = coreTenant
      ? await resolveAdminClientByCoreTenantId(coreTenant.id, {
          accessToken: request.coreAccessToken
        })
      : null;
    const atendimentoSnapshot = coreTenant
      ? await resolveAtendimentoSnapshot({
          coreTenantId: coreTenant.id,
          adminClient,
          fallbackMaxUsers: tenant.maxUsers,
          fallbackMaxChannels: tenant.maxChannels,
          fallbackCurrentUsers: 0,
          accessToken: request.coreAccessToken
        })
      : {
          maxChannels: tenant.maxChannels
        };
    const selectedInstance = parsed.data.instanceId
      ? await resolveTenantInstanceById({
          tenantId: tenant.id,
          instanceId: parsed.data.instanceId,
          includeInactive: true
        })
      : null;
    let instanceName = selectedInstance?.instanceName?.trim() || "";

    if (!instanceName) {
      instanceName = await resolveNextTenantInstanceName({
        tenantName: tenant.name,
        tenantSlug: tenant.slug
      });
    }

    const originalInstanceName = instanceName;
    let existingInstanceInOtherTenant = await findInstanceNameConflict({
      excludeInstanceId: selectedInstance?.id ?? null,
      instanceName
    });

    const isReusingCurrentInstance = Boolean(selectedInstance);

    if (existingInstanceInOtherTenant && isReusingCurrentInstance) {
      instanceName = await resolveNextTenantInstanceName({
        tenantName: tenant.name,
        tenantSlug: tenant.slug,
        excludeInstanceId: selectedInstance?.id ?? null
      });
      existingInstanceInOtherTenant = await findInstanceNameConflict({
        excludeInstanceId: selectedInstance?.id ?? null,
        instanceName
      });
      request.log.warn(
        {
          tenantId: tenant.id,
          originalInstanceName,
          adjustedInstanceName: instanceName
        },
        "Nome de instancia em conflito durante bootstrap; ajustando automaticamente para nome unico do tenant"
      );
    }

    if (existingInstanceInOtherTenant) {
      return reply.code(409).send({
        message: "Nao foi possivel reservar um identificador interno unico para a instancia WhatsApp.",
        details: {
          tenantId: tenant.id
        }
      });
    }

    const currentChannels = existingInstances.filter((entry) => entry.isActive).length;

    if (!isReusingCurrentInstance && currentChannels >= atendimentoSnapshot.maxChannels) {
      return reply.code(409).send({
        message: "Limite de canais do plano atingido para este tenant.",
        details: {
          maxChannels: atendimentoSnapshot.maxChannels,
          currentChannels
        }
      });
    }

    const tenantApiKey = normalizeEvolutionApiKey(parsed.data.evolutionApiKey);

    const updatedTenant = await prisma.tenant.update({
      where: { id: tenant.id },
      data: {
        whatsappInstance: instanceName,
        evolutionApiKey: tenantApiKey !== undefined ? tenantApiKey : undefined
      }
    });

    if (!selectedInstance) {
      await prisma.whatsAppInstance.create({
        data: {
          tenantId: tenant.id,
          instanceName,
          displayName: parsed.data.displayName?.trim() || tenant.name,
          evolutionApiKey: tenantApiKey ?? tenant.evolutionApiKey,
          isDefault: existingInstances.length < 1,
          isActive: true,
          createdByUserId: request.authUser.sub
        }
      });
    } else {
      await prisma.whatsAppInstance.update({
        where: { id: selectedInstance.id },
        data: {
          instanceName,
          displayName: parsed.data.displayName === undefined
            ? undefined
            : parsed.data.displayName.trim() || null,
          evolutionApiKey: tenantApiKey !== undefined ? tenantApiKey : undefined,
          isActive: true
        }
      });
    }

    const resolvedInstance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceName,
      includeInactive: true
    });

    if (!resolvedInstance) {
      return reply.code(500).send({ message: "Falha ao resolver a instancia WhatsApp apos o bootstrap." });
    }

    await prisma.$transaction([
      prisma.whatsAppInstance.updateMany({
        where: {
          tenantId: tenant.id,
          id: {
            not: resolvedInstance.id
          },
          isDefault: true
        },
        data: {
          isDefault: false
        }
      }),
      prisma.whatsAppInstance.update({
        where: {
          id: resolvedInstance.id
        },
        data: {
          isDefault: true
        }
      }),
      prisma.conversation.updateMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { instanceId: resolvedInstance.id },
            { instanceScopeKey: "default" }
          ]
        },
        data: {
          instanceId: resolvedInstance.id,
          instanceScopeKey: instanceName
        }
      }),
      prisma.message.updateMany({
        where: {
          tenantId: tenant.id,
          OR: [
            { instanceId: resolvedInstance.id },
            { instanceScopeKey: "default" }
          ]
        },
        data: {
          instanceId: resolvedInstance.id,
          instanceScopeKey: instanceName
        }
      })
    ]);

      const webhookUrl = buildWebhookUrl(updatedTenant.slug);
    const webhookHeaders = buildWebhookHeaders();

    try {
      const client = createEvolutionClientOrThrow(updatedTenant.evolutionApiKey);
      let created = true;
      let createResult: Record<string, unknown> | null = null;

      try {
        createResult = await client.createInstance({
          instanceName,
          webhookUrl,
          number: parsed.data.number,
          webhookHeaders
        });
      } catch (error) {
        if (error instanceof EvolutionApiError && isInstanceAlreadyInUseError(error)) {
          created = false;
        } else {
          throw error;
        }
      }

      const webhookResult = await client.setWebhook({
        instanceName,
        webhookUrl,
        webhookHeaders
      });
      const connectResult = await client.connectInstance({
        instanceName,
        number: parsed.data.number
      });
      const connectionState = await client.getConnectionState(instanceName);

      return {
        success: true,
        instanceId: resolvedInstance.id,
        instanceName,
        webhookUrl,
        created,
        createResult,
        webhookResult,
        connectResult,
        connectionState
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });

  protectedApp.post("/tenant/whatsapp/connect", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = connectWhatsAppSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: parsed.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(400).send({
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const instanceName = instance.instanceName;
      const mode = parsed.data.number ? "PAIRING_CODE" : "QRCODE";
      const connectKey = buildConnectRequestKey(tenant.id, instanceName);
      const now = Date.now();
      let missingInEvolution = false;
      let connectionStateBefore: Record<string, unknown>;
      try {
        connectionStateBefore = await client.getConnectionState(instanceName);
      } catch (error) {
        if (error instanceof EvolutionApiError && error.statusCode === 404) {
          missingInEvolution = true;
          connectionStateBefore = {
            instance: {
              instanceName,
              state: "missing"
            }
          };
        } else {
          throw error;
        }
      }

      let stateBefore = normalizeConnectionState(connectionStateBefore);
      let instanceSummary: Record<string, unknown> | null = null;
      try {
        instanceSummary = findFetchInstanceSummary(await client.fetchInstances(), instanceName);
      } catch (error) {
        if (!(error instanceof EvolutionApiError)) {
          throw error;
        }
      }

      const hardResetReason = resolveHardResetReason({
        stateBefore,
        instanceSummary,
        missingInEvolution
      });

      let hardResetResult: Awaited<ReturnType<typeof hardResetEvolutionInstance>> | null = null;
      if (hardResetReason) {
        hardResetResult = await hardResetEvolutionInstance({
          client,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          instanceName,
          connectKey,
          number: parsed.data.number
        });

        missingInEvolution = false;
        try {
          connectionStateBefore = await client.getConnectionState(instanceName);
        } catch (error) {
          if (error instanceof EvolutionApiError && error.statusCode === 404) {
            connectionStateBefore = {
              instance: {
                instanceName,
                state: "missing"
              }
            };
          } else {
            throw error;
          }
        }
        stateBefore = normalizeConnectionState(connectionStateBefore);
      }

      const lastConnectAt = lastConnectRequestAtByInstance.get(connectKey) ?? 0;

      if (stateBefore === "open" || stateBefore === "connected") {
        return {
          success: true,
          instanceName,
          connectResult: null,
          mode,
          connectionState: connectionStateBefore,
          skippedConnect: true,
          skippedReason: "already_connected"
        };
      }

      if (stateBefore === "connecting" && now - lastConnectAt < CONNECT_REQUEST_COOLDOWN_MS) {
        return {
          success: true,
          instanceName,
          connectResult: null,
          mode,
          connectionState: connectionStateBefore,
          skippedConnect: true,
          skippedReason: "already_connecting"
        };
      }

      if (now - lastConnectAt < CONNECT_REQUEST_COOLDOWN_MS) {
        return {
          success: true,
          instanceName,
          connectResult: null,
          mode,
          connectionState: connectionStateBefore,
          skippedConnect: true,
          skippedReason: "cooldown"
        };
      }

      lastConnectRequestAtByInstance.set(connectKey, now);

      const connectResult = await client.connectInstance({
        instanceName,
        number: parsed.data.number
      });
      const connectionState = await client.getConnectionState(instanceName);

      return {
        success: true,
        instanceName,
        connectResult,
        mode,
        connectionState,
        hardResetApplied: Boolean(hardResetResult),
        hardResetReason,
        hardResetResult
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });

  protectedApp.post("/tenant/whatsapp/logout", async (request, reply) => {
    if (!requireAdmin(request, reply)) {
      return;
    }

    const parsed = connectWhatsAppSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        message: "Payload invalido",
        errors: parsed.error.flatten()
      });
    }

    const tenant = await getTenantOrFail(request.authUser.tenantId);
    const instance = await resolveTenantInstanceById({
      tenantId: tenant.id,
      instanceId: parsed.data.instanceId,
      includeInactive: true
    });

    if (!instance) {
      return reply.code(400).send({
        message: "Defina a instancia primeiro em /tenant ou /tenant/whatsapp/bootstrap"
      });
    }

    try {
      const client = createEvolutionClientOrThrow(tenant.evolutionApiKey);
      const logoutResult = await client.logoutInstance(instance.instanceName);
      await deleteLatestQrCode(tenant.id, instance.instanceName);
      const connectionState = await client.getConnectionState(instance.instanceName);

      return {
        success: true,
        instanceId: instance.id,
        instanceName: instance.instanceName,
        logoutResult,
        connectionState
      };
    } catch (error) {
      if (error instanceof EvolutionApiError) {
        return reply.code(error.statusCode).send({
          message: error.message,
          details: error.details
        });
      }
      throw error;
    }
  });
}
