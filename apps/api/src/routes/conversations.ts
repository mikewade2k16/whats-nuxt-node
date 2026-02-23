import {
  ChannelType,
  ConversationStatus,
  MessageDirection,
  MessageStatus
} from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import { outboundQueue } from "../queue.js";

const createConversationSchema = z.object({
  channel: z.nativeEnum(ChannelType).default(ChannelType.WHATSAPP),
  externalId: z.string().min(3),
  contactName: z.string().optional(),
  contactAvatarUrl: z.string().url().optional(),
  contactPhone: z.string().optional()
});

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000)
});

const assignConversationSchema = z.object({
  assignedToId: z.string().nullable()
});

const updateStatusSchema = z.object({
  status: z.nativeEnum(ConversationStatus)
});

function mapConversation(conversation: {
  id: string;
  channel: ChannelType;
  status: ConversationStatus;
  externalId: string;
  contactName: string | null;
  contactAvatarUrl: string | null;
  contactPhone: string | null;
  assignedToId: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date;
  messages: Array<{
    id: string;
    content: string;
    direction: MessageDirection;
    createdAt: Date;
    status: MessageStatus;
  }>;
}) {
  const lastMessage = conversation.messages[0];
  return {
    id: conversation.id,
    channel: conversation.channel,
    status: conversation.status,
    externalId: conversation.externalId,
    contactName: conversation.contactName,
    contactAvatarUrl: conversation.contactAvatarUrl,
    contactPhone: conversation.contactPhone,
    assignedToId: conversation.assignedToId,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    lastMessageAt: conversation.lastMessageAt,
    lastMessage: lastMessage
      ? {
          id: lastMessage.id,
          content: lastMessage.content,
          direction: lastMessage.direction,
          status: lastMessage.status,
          createdAt: lastMessage.createdAt
        }
      : null
  };
}

export async function conversationRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    protectedApp.get("/conversations", async (request) => {
      const conversations = await prisma.conversation.findMany({
        where: { tenantId: request.authUser.tenantId },
        orderBy: { lastMessageAt: "desc" },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      return conversations.map(mapConversation);
    });

    protectedApp.post("/conversations", async (request, reply) => {
      const parsed = createConversationSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const { externalId, channel, contactName, contactAvatarUrl, contactPhone } = parsed.data;

      const conversation = await prisma.conversation.upsert({
        where: {
          tenantId_externalId_channel: {
            tenantId: request.authUser.tenantId,
            externalId,
            channel
          }
        },
        update: {
          contactName,
          contactAvatarUrl,
          contactPhone,
          updatedAt: new Date()
        },
        create: {
          tenantId: request.authUser.tenantId,
          channel,
          externalId,
          contactName,
          contactAvatarUrl,
          contactPhone
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

    protectedApp.get("/conversations/:conversationId/messages", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const query = z
        .object({
          limit: z.coerce.number().min(1).max(200).default(100),
          beforeId: z.string().min(1).optional()
        })
        .safeParse(request.query);

      const limit = query.success ? query.data.limit : 100;
      const beforeId = query.success ? query.data.beforeId : undefined;

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      let beforeMessageCreatedAt: Date | null = null;
      if (beforeId) {
        const beforeMessage = await prisma.message.findFirst({
          where: {
            id: beforeId,
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id
          },
          select: {
            createdAt: true
          }
        });
        beforeMessageCreatedAt = beforeMessage?.createdAt ?? null;
      }

      const messagesDesc = await prisma.message.findMany({
        where: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          ...(beforeMessageCreatedAt
            ? {
                createdAt: {
                  lt: beforeMessageCreatedAt
                }
              }
            : {})
        },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      const messages = [...messagesDesc].reverse();

      let hasMore = false;
      if (messages.length > 0) {
        const oldest = messages[0];
        const older = await prisma.message.findFirst({
          where: {
            tenantId: request.authUser.tenantId,
            conversationId: conversation.id,
            createdAt: {
              lt: oldest.createdAt
            }
          },
          select: { id: true }
        });
        hasMore = Boolean(older);
      }

      return {
        conversationId: conversation.id,
        messages,
        hasMore
      };
    });

    protectedApp.post("/conversations/:conversationId/messages", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);

      if (!params.success) {
        return reply.code(400).send({ message: "Parametros invalidos" });
      }

      const body = sendMessageSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: body.error.flatten()
        });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const message = await prisma.message.create({
        data: {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          senderName: request.authUser.name,
          senderAvatarUrl: null,
          content: body.data.content,
          status: MessageStatus.PENDING
        }
      });

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: message.createdAt,
          status: ConversationStatus.OPEN
        }
      });

      await outboundQueue.add(
        "send-message",
        {
          tenantId: request.authUser.tenantId,
          conversationId: conversation.id,
          messageId: message.id
        },
        {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000
          }
        }
      );

      await publishEvent({
        type: "message.created",
        tenantId: request.authUser.tenantId,
        payload: message as unknown as Record<string, unknown>
      });

      return message;
    });

    protectedApp.patch("/conversations/:conversationId/assign", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = assignConversationSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      if (body.data.assignedToId) {
        const user = await prisma.user.findFirst({
          where: {
            id: body.data.assignedToId,
            tenantId: request.authUser.tenantId
          }
        });
        if (!user) {
          return reply.code(404).send({ message: "Usuario nao encontrado no tenant" });
        }
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { assignedToId: body.data.assignedToId },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });

    protectedApp.patch("/conversations/:conversationId/status", async (request, reply) => {
      const params = z
        .object({
          conversationId: z.string().min(1)
        })
        .safeParse(request.params);
      const body = updateStatusSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const conversation = await prisma.conversation.findFirst({
        where: {
          id: params.data.conversationId,
          tenantId: request.authUser.tenantId
        },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (!conversation) {
        return reply.code(404).send({ message: "Conversa nao encontrada" });
      }

      const updated = await prisma.conversation.update({
        where: { id: conversation.id },
        data: { status: body.data.status },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      const payload = mapConversation(updated);
      await publishEvent({
        type: "conversation.updated",
        tenantId: request.authUser.tenantId,
        payload
      });

      return payload;
    });
  });
}
