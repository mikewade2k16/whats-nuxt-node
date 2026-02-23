import bcrypt from "bcryptjs";
import { PrismaClient, ChannelType, MessageDirection, MessageStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {
      name: "Empresa Demo",
      whatsappInstance: "demo-instance"
    },
    create: {
      slug: "demo",
      name: "Empresa Demo",
      whatsappInstance: "demo-instance"
    }
  });

  const adminPasswordHash = await bcrypt.hash("123456", 10);
  const agentPasswordHash = await bcrypt.hash("123456", 10);

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: "admin@demo.local"
      }
    },
    update: {
      name: "Admin Demo",
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash
    },
    create: {
      tenantId: tenant.id,
      email: "admin@demo.local",
      name: "Admin Demo",
      role: UserRole.ADMIN,
      passwordHash: adminPasswordHash
    }
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: "agente@demo.local"
      }
    },
    update: {
      name: "Agente Demo",
      role: UserRole.AGENT,
      passwordHash: agentPasswordHash
    },
    create: {
      tenantId: tenant.id,
      email: "agente@demo.local",
      name: "Agente Demo",
      role: UserRole.AGENT,
      passwordHash: agentPasswordHash
    }
  });

  const conversation = await prisma.conversation.upsert({
    where: {
      tenantId_externalId_channel: {
        tenantId: tenant.id,
        externalId: "5511999999999@s.whatsapp.net",
        channel: ChannelType.WHATSAPP
      }
    },
    update: {
      contactName: "Cliente Demo",
      contactPhone: "5511999999999",
      lastMessageAt: new Date()
    },
    create: {
      tenantId: tenant.id,
      channel: ChannelType.WHATSAPP,
      externalId: "5511999999999@s.whatsapp.net",
      contactName: "Cliente Demo",
      contactPhone: "5511999999999"
    }
  });

  const messageCount = await prisma.message.count({
    where: { conversationId: conversation.id }
  });

  if (messageCount === 0) {
    await prisma.message.createMany({
      data: [
        {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.INBOUND,
          content: "Oi, tudo bem? Quero saber mais sobre o plano.",
          senderName: "Cliente Demo",
          status: MessageStatus.SENT
        },
        {
          tenantId: tenant.id,
          conversationId: conversation.id,
          direction: MessageDirection.OUTBOUND,
          content: "Claro! Posso te explicar as opcoes disponiveis.",
          senderName: "Admin Demo",
          status: MessageStatus.SENT
        }
      ]
    });
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Seed concluido.");
  })
  .catch(async (error) => {
    console.error("Erro no seed:", error);
    await prisma.$disconnect();
    process.exit(1);
  });

