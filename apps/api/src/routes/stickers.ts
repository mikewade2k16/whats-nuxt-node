import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { requireConversationWrite } from "../lib/guards.js";

const MAX_STICKERS_PER_TENANT = 200;
const MAX_STICKER_MB_HARD_CAP = 20;
const ALLOWED_STICKER_MIME_TYPES = new Set([
  "image/webp",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif"
]);

const listStickersQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_STICKERS_PER_TENANT).default(36)
});

const createStickerSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  dataUrl: z.string().min(32).max(20_000_000),
  mimeType: z.string().max(100).optional(),
  sizeBytes: z.coerce.number().int().min(1).max(50_000_000).optional()
});

const stickerIdParamsSchema = z.object({
  stickerId: z.string().min(1)
});

function sanitizeStickerName(name: string | undefined, mimeType: string) {
  const normalized = (name ?? "").trim().slice(0, 255);
  if (normalized.length > 0) {
    return normalized;
  }

  const extension = mimeType === "image/webp"
    ? "webp"
    : mimeType === "image/png"
      ? "png"
      : mimeType === "image/gif"
        ? "gif"
        : "jpg";

  return `figurinha-${Date.now()}.${extension}`;
}

function normalizeMimeType(value: string) {
  return value.trim().toLowerCase();
}

function parseImageDataUrl(value: string) {
  const match = value.trim().match(/^data:([^;,]+);base64,([a-z0-9+/=]+)$/i);
  if (!match) {
    return null;
  }

  return {
    mimeType: normalizeMimeType(match[1]),
    base64: match[2]
  };
}

function estimateBase64Bytes(base64Value: string) {
  const normalized = base64Value.trim();
  const padding = normalized.endsWith("==")
    ? 2
    : normalized.endsWith("=")
      ? 1
      : 0;

  return Math.max(0, Math.floor((normalized.length * 3) / 4) - padding);
}

function resolveStickerUploadLimitBytes(tenantMaxUploadMb: number) {
  const boundedMb = Math.max(1, Math.min(MAX_STICKER_MB_HARD_CAP, Math.trunc(tenantMaxUploadMb)));
  return boundedMb * 1024 * 1024;
}

export async function stickerRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    protectedApp.get("/stickers", async (request, reply) => {
      const query = listStickersQuerySchema.safeParse(request.query);
      if (!query.success) {
        return reply.code(400).send({
          message: "Query invalida",
          errors: query.error.flatten()
        });
      }

      const stickers = await prisma.savedSticker.findMany({
        where: {
          tenantId: request.authUser.tenantId
        },
        orderBy: {
          createdAt: "desc"
        },
        take: query.data.limit,
        select: {
          id: true,
          name: true,
          dataUrl: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          updatedAt: true,
          createdByUserId: true
        }
      });

      return stickers;
    });

    protectedApp.post("/stickers", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const body = createStickerSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: body.error.flatten()
        });
      }

      const parsedDataUrl = parseImageDataUrl(body.data.dataUrl);
      if (!parsedDataUrl) {
        return reply.code(400).send({
          message: "Formato de figurinha invalido. Use data URL base64 de imagem."
        });
      }

      const mimeType = body.data.mimeType
        ? normalizeMimeType(body.data.mimeType)
        : parsedDataUrl.mimeType;

      if (!ALLOWED_STICKER_MIME_TYPES.has(mimeType)) {
        return reply.code(415).send({
          message: "Tipo de figurinha nao suportado.",
          details: {
            allowedMimeTypes: [...ALLOWED_STICKER_MIME_TYPES]
          }
        });
      }

      const tenant = await prisma.tenant.findUnique({
        where: {
          id: request.authUser.tenantId
        },
        select: {
          maxUploadMb: true
        }
      });

      if (!tenant) {
        return reply.code(404).send({ message: "Tenant nao encontrado" });
      }

      const estimatedSizeBytes = estimateBase64Bytes(parsedDataUrl.base64);
      const uploadLimitBytes = resolveStickerUploadLimitBytes(tenant.maxUploadMb);
      if (estimatedSizeBytes > uploadLimitBytes) {
        return reply.code(413).send({
          message: "Figurinha acima do limite permitido para salvar na biblioteca.",
          details: {
            maxBytes: uploadLimitBytes,
            maxUploadMb: Math.round(uploadLimitBytes / (1024 * 1024)),
            actualBytes: estimatedSizeBytes
          }
        });
      }

      const declaredSizeBytes = body.data.sizeBytes ?? estimatedSizeBytes;
      const sticker = await prisma.savedSticker.create({
        data: {
          tenantId: request.authUser.tenantId,
          createdByUserId: request.authUser.sub,
          name: sanitizeStickerName(body.data.name, mimeType),
          dataUrl: body.data.dataUrl,
          mimeType,
          sizeBytes: declaredSizeBytes
        },
        select: {
          id: true,
          name: true,
          dataUrl: true,
          mimeType: true,
          sizeBytes: true,
          createdAt: true,
          updatedAt: true,
          createdByUserId: true
        }
      });

      const total = await prisma.savedSticker.count({
        where: {
          tenantId: request.authUser.tenantId
        }
      });

      const overflowCount = Math.max(0, total - MAX_STICKERS_PER_TENANT);
      if (overflowCount > 0) {
        const staleRows = await prisma.savedSticker.findMany({
          where: {
            tenantId: request.authUser.tenantId
          },
          orderBy: {
            createdAt: "asc"
          },
          take: overflowCount,
          select: {
            id: true
          }
        });

        if (staleRows.length > 0) {
          await prisma.savedSticker.deleteMany({
            where: {
              id: {
                in: staleRows.map((entry) => entry.id)
              }
            }
          });
        }
      }

      return reply.code(201).send(sticker);
    });

    protectedApp.delete("/stickers/:stickerId", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = stickerIdParamsSchema.safeParse(request.params);
      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const existing = await prisma.savedSticker.findFirst({
        where: {
          id: params.data.stickerId,
          tenantId: request.authUser.tenantId
        },
        select: {
          id: true
        }
      });

      if (!existing) {
        return reply.code(404).send({ message: "Figurinha nao encontrada" });
      }

      await prisma.savedSticker.delete({
        where: {
          id: existing.id
        }
      });

      return reply.code(204).send();
    });
  });
}

