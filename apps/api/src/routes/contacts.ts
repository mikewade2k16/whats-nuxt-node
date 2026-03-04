import { ChannelType, ConversationStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { publishEvent } from "../event-bus.js";
import { requireConversationWrite } from "../lib/guards.js";
import { mapConversation } from "./conversations.js";

const createContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  avatarUrl: z.string().trim().url().optional(),
  source: z.string().trim().min(1).max(64).default("MANUAL"),
  conversationId: z.string().trim().min(1).optional()
});

const updateContactSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().min(3).max(40).optional(),
  avatarUrl: z.string().trim().url().nullable().optional()
});

const contactIdParamSchema = z.object({
  contactId: z.string().trim().min(1)
});

const openConversationSchema = z.object({
  channel: z.nativeEnum(ChannelType).default(ChannelType.WHATSAPP)
});

function normalizePhoneDigits(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  return value.replace(/\D/g, "");
}

function normalizeAvatarUrl(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  return trimmed;
}

function normalizeContactName(value: string | null | undefined, fallbackPhone: string) {
  const trimmed = value?.trim();
  if (trimmed) {
    return trimmed;
  }

  return fallbackPhone;
}

function buildWhatsAppDirectExternalId(phone: string) {
  return `${phone}@s.whatsapp.net`;
}

function mapContact(contact: {
  id: string;
  tenantId: string;
  name: string;
  phone: string;
  avatarUrl: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  conversations?: Array<{
    id: string;
    channel: ChannelType;
    status: ConversationStatus;
    lastMessageAt: Date;
  }>;
}) {
  const lastConversation = contact.conversations?.[0] ?? null;

  return {
    id: contact.id,
    tenantId: contact.tenantId,
    name: contact.name,
    phone: contact.phone,
    avatarUrl: contact.avatarUrl,
    source: contact.source,
    createdAt: contact.createdAt,
    updatedAt: contact.updatedAt,
    lastConversationId: lastConversation?.id ?? null,
    lastConversationAt: lastConversation?.lastMessageAt ?? null,
    lastConversationChannel: lastConversation?.channel ?? null,
    lastConversationStatus: lastConversation?.status ?? null
  };
}

async function findContactWithSummary(contactId: string, tenantId: string) {
  const contact = await prisma.contact.findFirst({
    where: {
      id: contactId,
      tenantId
    },
    include: {
      conversations: {
        take: 1,
        orderBy: { lastMessageAt: "desc" },
        select: {
          id: true,
          channel: true,
          status: true,
          lastMessageAt: true
        }
      }
    }
  });

  if (!contact) {
    return null;
  }

  return mapContact(contact);
}

export async function contactsRoutes(app: FastifyInstance) {
  app.register(async (protectedApp) => {
    protectedApp.addHook("preHandler", protectedApp.authenticate);

    protectedApp.get("/contacts", async (request) => {
      const contacts = await prisma.contact.findMany({
        where: {
          tenantId: request.authUser.tenantId
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
        include: {
          conversations: {
            take: 1,
            orderBy: { lastMessageAt: "desc" },
            select: {
              id: true,
              channel: true,
              status: true,
              lastMessageAt: true
            }
          }
        }
      });

      return contacts.map(mapContact);
    });

    protectedApp.post("/contacts", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const parsed = createContactSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.code(400).send({
          message: "Payload invalido",
          errors: parsed.error.flatten()
        });
      }

      const tenantId = request.authUser.tenantId;
      let conversation = null;

      if (parsed.data.conversationId) {
        conversation = await prisma.conversation.findFirst({
          where: {
            id: parsed.data.conversationId,
            tenantId
          },
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                content: true,
                messageType: true,
                mediaUrl: true,
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
      }

      const resolvedPhone = normalizePhoneDigits(parsed.data.phone ?? conversation?.contactPhone ?? conversation?.externalId);
      if (!resolvedPhone) {
        return reply.code(400).send({ message: "Telefone invalido para salvar contato" });
      }

      const resolvedName = normalizeContactName(
        parsed.data.name ?? conversation?.contactName,
        resolvedPhone
      );
      const resolvedAvatarUrl = normalizeAvatarUrl(parsed.data.avatarUrl ?? conversation?.contactAvatarUrl);

      const persistedContact = await prisma.contact.upsert({
        where: {
          tenantId_phone: {
            tenantId,
            phone: resolvedPhone
          }
        },
        update: {
          name: resolvedName,
          avatarUrl: resolvedAvatarUrl,
          source: parsed.data.source
        },
        create: {
          tenantId,
          name: resolvedName,
          phone: resolvedPhone,
          avatarUrl: resolvedAvatarUrl,
          source: parsed.data.source
        }
      });

      await prisma.conversation.updateMany({
        where: {
          tenantId,
          contactPhone: resolvedPhone
        },
        data: {
          contactId: persistedContact.id
        }
      });

      let updatedConversationPayload = null;

      if (conversation) {
        const updatedConversation = await prisma.conversation.update({
          where: { id: conversation.id },
          data: {
            contactId: persistedContact.id,
            contactName: resolvedName,
            contactPhone: resolvedPhone,
            contactAvatarUrl: resolvedAvatarUrl
          },
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                content: true,
                messageType: true,
                mediaUrl: true,
                direction: true,
                status: true,
                createdAt: true
              }
            }
          }
        });

        updatedConversationPayload = mapConversation(updatedConversation);
        await publishEvent({
          type: "conversation.updated",
          tenantId,
          payload: updatedConversationPayload
        });
      }

      const contactPayload = await findContactWithSummary(persistedContact.id, tenantId);
      return reply.code(201).send({
        contact: contactPayload,
        conversation: updatedConversationPayload
      });
    });

    protectedApp.patch("/contacts/:contactId", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = contactIdParamSchema.safeParse(request.params);
      const body = updateContactSchema.safeParse(request.body);

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const existing = await prisma.contact.findFirst({
        where: {
          id: params.data.contactId,
          tenantId: request.authUser.tenantId
        }
      });

      if (!existing) {
        return reply.code(404).send({ message: "Contato nao encontrado" });
      }

      const nextPhone = body.data.phone ? normalizePhoneDigits(body.data.phone) : existing.phone;
      if (!nextPhone) {
        return reply.code(400).send({ message: "Telefone invalido para contato" });
      }

      const updated = await prisma.contact.update({
        where: { id: existing.id },
        data: {
          name: normalizeContactName(body.data.name ?? existing.name, nextPhone),
          phone: nextPhone,
          avatarUrl:
            body.data.avatarUrl === undefined ? existing.avatarUrl : normalizeAvatarUrl(body.data.avatarUrl)
        }
      });

      if (nextPhone !== existing.phone) {
        await prisma.conversation.updateMany({
          where: {
            tenantId: request.authUser.tenantId,
            contactId: updated.id
          },
          data: {
            contactPhone: nextPhone
          }
        });
      }

      const payload = await findContactWithSummary(updated.id, request.authUser.tenantId);
      return payload;
    });

    protectedApp.post("/contacts/:contactId/open-conversation", async (request, reply) => {
      if (!requireConversationWrite(request, reply)) {
        return;
      }

      const params = contactIdParamSchema.safeParse(request.params);
      const body = openConversationSchema.safeParse(request.body ?? {});

      if (!params.success || !body.success) {
        return reply.code(400).send({ message: "Payload invalido" });
      }

      const tenantId = request.authUser.tenantId;
      const contact = await prisma.contact.findFirst({
        where: {
          id: params.data.contactId,
          tenantId
        }
      });

      if (!contact) {
        return reply.code(404).send({ message: "Contato nao encontrado" });
      }

      const channel = body.data.channel;
      const directExternalId =
        channel === ChannelType.WHATSAPP ? buildWhatsAppDirectExternalId(contact.phone) : `contact:${contact.phone}`;

      let conversation = await prisma.conversation.findFirst({
        where: {
          tenantId,
          channel,
          OR: [{ contactId: contact.id }, { externalId: directExternalId }]
        },
        orderBy: { lastMessageAt: "desc" },
        include: {
          messages: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              content: true,
              messageType: true,
              mediaUrl: true,
              direction: true,
              status: true,
              createdAt: true
            }
          }
        }
      });

      if (conversation) {
        if (
          conversation.contactId !== contact.id ||
          conversation.contactName !== contact.name ||
          conversation.contactPhone !== contact.phone ||
          conversation.contactAvatarUrl !== contact.avatarUrl
        ) {
          conversation = await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              contactId: contact.id,
              contactName: contact.name,
              contactPhone: contact.phone,
              contactAvatarUrl: contact.avatarUrl
            },
            include: {
              messages: {
                take: 1,
                orderBy: { createdAt: "desc" },
                select: {
                  id: true,
                  content: true,
                  messageType: true,
                  mediaUrl: true,
                  direction: true,
                  status: true,
                  createdAt: true
                }
              }
            }
          });
        }
      } else {
        conversation = await prisma.conversation.create({
          data: {
            tenantId,
            channel,
            status: ConversationStatus.OPEN,
            externalId: directExternalId,
            contactId: contact.id,
            contactName: contact.name,
            contactPhone: contact.phone,
            contactAvatarUrl: contact.avatarUrl
          },
          include: {
            messages: {
              take: 1,
              orderBy: { createdAt: "desc" },
              select: {
                id: true,
                content: true,
                messageType: true,
                mediaUrl: true,
                direction: true,
                status: true,
                createdAt: true
              }
            }
          }
        });
      }

      const payload = mapConversation(conversation);
      await publishEvent({
        type: "conversation.updated",
        tenantId,
        payload
      });

      return payload;
    });
  });
}
