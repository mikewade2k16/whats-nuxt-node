import bcrypt from "bcryptjs";
import { PrismaClient, ChannelType, MessageDirection, MessageStatus, UserRole } from "@prisma/client";

const prisma = new PrismaClient();

async function seed() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {
      name: "Empresa Demo",
      whatsappInstance: "demo-instance",
      maxChannels: 1,
      maxUsers: 3,
      retentionDays: 15,
      maxUploadMb: 500
    },
    create: {
      slug: "demo",
      name: "Empresa Demo",
      whatsappInstance: "demo-instance",
      maxChannels: 1,
      maxUsers: 3,
      retentionDays: 15,
      maxUploadMb: 500
    }
  });

  const demoInstance = await prisma.whatsAppInstance.upsert({
    where: {
      tenantId_instanceName: {
        tenantId: tenant.id,
        instanceName: "demo-instance"
      }
    },
    update: {
      displayName: "WhatsApp Demo",
      isDefault: true,
      isActive: true,
      evolutionApiKey: tenant.evolutionApiKey
    },
    create: {
      tenantId: tenant.id,
      instanceName: "demo-instance",
      displayName: "WhatsApp Demo",
      isDefault: true,
      isActive: true,
      evolutionApiKey: tenant.evolutionApiKey
    }
  });

  const adminPasswordHash = await bcrypt.hash("123456", 10);
  const agentPasswordHash = await bcrypt.hash("123456", 10);
  const supervisorPasswordHash = await bcrypt.hash("123456", 10);
  const viewerPasswordHash = await bcrypt.hash("123456", 10);

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
        email: "supervisor@demo.local"
      }
    },
    update: {
      name: "Supervisor Demo",
      role: UserRole.SUPERVISOR,
      passwordHash: supervisorPasswordHash
    },
    create: {
      tenantId: tenant.id,
      email: "supervisor@demo.local",
      name: "Supervisor Demo",
      role: UserRole.SUPERVISOR,
      passwordHash: supervisorPasswordHash
    }
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenant.id,
        email: "viewer@demo.local"
      }
    },
    update: {
      name: "Viewer Demo",
      role: UserRole.VIEWER,
      passwordHash: viewerPasswordHash
    },
    create: {
      tenantId: tenant.id,
      email: "viewer@demo.local",
      name: "Viewer Demo",
      role: UserRole.VIEWER,
      passwordHash: viewerPasswordHash
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
      tenantId_externalId_channel_instanceScopeKey: {
        tenantId: tenant.id,
        externalId: "5511999999999@s.whatsapp.net",
        channel: ChannelType.WHATSAPP,
        instanceScopeKey: demoInstance.instanceName
      }
    },
    update: {
      instanceId: demoInstance.id,
      instanceScopeKey: demoInstance.instanceName,
      contactName: "Cliente Demo",
      contactPhone: "5511999999999",
      lastMessageAt: new Date()
    },
    create: {
      tenantId: tenant.id,
      instanceId: demoInstance.id,
      instanceScopeKey: demoInstance.instanceName,
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
          instanceId: demoInstance.id,
          instanceScopeKey: demoInstance.instanceName,
          direction: MessageDirection.INBOUND,
          content: "Oi, tudo bem? Quero saber mais sobre o plano.",
          senderName: "Cliente Demo",
          status: MessageStatus.SENT
        },
        {
          tenantId: tenant.id,
          conversationId: conversation.id,
          instanceId: demoInstance.id,
          instanceScopeKey: demoInstance.instanceName,
          direction: MessageDirection.OUTBOUND,
          content: "Claro! Posso te explicar as opcoes disponiveis.",
          senderName: "Admin Demo",
          status: MessageStatus.SENT
        }
      ]
    });
  }

  const tenantAcme = await prisma.tenant.upsert({
    where: { slug: "acme" },
    update: {
      name: "Empresa ACME",
      whatsappInstance: "acme-instance",
      maxChannels: 1,
      maxUsers: 3,
      retentionDays: 15,
      maxUploadMb: 500
    },
    create: {
      slug: "acme",
      name: "Empresa ACME",
      whatsappInstance: "acme-instance",
      maxChannels: 1,
      maxUsers: 3,
      retentionDays: 15,
      maxUploadMb: 500
    }
  });

  const acmeInstance = await prisma.whatsAppInstance.upsert({
    where: {
      tenantId_instanceName: {
        tenantId: tenantAcme.id,
        instanceName: "acme-instance"
      }
    },
    update: {
      displayName: "WhatsApp ACME",
      isDefault: true,
      isActive: true,
      evolutionApiKey: tenantAcme.evolutionApiKey
    },
    create: {
      tenantId: tenantAcme.id,
      instanceName: "acme-instance",
      displayName: "WhatsApp ACME",
      isDefault: true,
      isActive: true,
      evolutionApiKey: tenantAcme.evolutionApiKey
    }
  });

  const acmeAdminPasswordHash = await bcrypt.hash("123456", 10);
  const acmeAgentPasswordHash = await bcrypt.hash("123456", 10);
  const acmeSupervisorPasswordHash = await bcrypt.hash("123456", 10);
  const acmeViewerPasswordHash = await bcrypt.hash("123456", 10);

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantAcme.id,
        email: "admin@acme.local"
      }
    },
    update: {
      name: "Admin ACME",
      role: UserRole.ADMIN,
      passwordHash: acmeAdminPasswordHash
    },
    create: {
      tenantId: tenantAcme.id,
      email: "admin@acme.local",
      name: "Admin ACME",
      role: UserRole.ADMIN,
      passwordHash: acmeAdminPasswordHash
    }
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantAcme.id,
        email: "supervisor@acme.local"
      }
    },
    update: {
      name: "Supervisor ACME",
      role: UserRole.SUPERVISOR,
      passwordHash: acmeSupervisorPasswordHash
    },
    create: {
      tenantId: tenantAcme.id,
      email: "supervisor@acme.local",
      name: "Supervisor ACME",
      role: UserRole.SUPERVISOR,
      passwordHash: acmeSupervisorPasswordHash
    }
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantAcme.id,
        email: "viewer@acme.local"
      }
    },
    update: {
      name: "Viewer ACME",
      role: UserRole.VIEWER,
      passwordHash: acmeViewerPasswordHash
    },
    create: {
      tenantId: tenantAcme.id,
      email: "viewer@acme.local",
      name: "Viewer ACME",
      role: UserRole.VIEWER,
      passwordHash: acmeViewerPasswordHash
    }
  });

  await prisma.user.upsert({
    where: {
      tenantId_email: {
        tenantId: tenantAcme.id,
        email: "agente@acme.local"
      }
    },
    update: {
      name: "Agente ACME",
      role: UserRole.AGENT,
      passwordHash: acmeAgentPasswordHash
    },
    create: {
      tenantId: tenantAcme.id,
      email: "agente@acme.local",
      name: "Agente ACME",
      role: UserRole.AGENT,
      passwordHash: acmeAgentPasswordHash
    }
  });

  const acmeConversation = await prisma.conversation.upsert({
    where: {
      tenantId_externalId_channel_instanceScopeKey: {
        tenantId: tenantAcme.id,
        externalId: "5511888888888@s.whatsapp.net",
        channel: ChannelType.WHATSAPP,
        instanceScopeKey: acmeInstance.instanceName
      }
    },
    update: {
      instanceId: acmeInstance.id,
      instanceScopeKey: acmeInstance.instanceName,
      contactName: "Cliente ACME",
      contactPhone: "5511888888888",
      lastMessageAt: new Date()
    },
    create: {
      tenantId: tenantAcme.id,
      instanceId: acmeInstance.id,
      instanceScopeKey: acmeInstance.instanceName,
      channel: ChannelType.WHATSAPP,
      externalId: "5511888888888@s.whatsapp.net",
      contactName: "Cliente ACME",
      contactPhone: "5511888888888"
    }
  });

  const acmeMessageCount = await prisma.message.count({
    where: { conversationId: acmeConversation.id }
  });

  if (acmeMessageCount === 0) {
    await prisma.message.createMany({
      data: [
        {
          tenantId: tenantAcme.id,
          conversationId: acmeConversation.id,
          instanceId: acmeInstance.id,
          instanceScopeKey: acmeInstance.instanceName,
          direction: MessageDirection.INBOUND,
          content: "Oi, sou cliente ACME.",
          senderName: "Cliente ACME",
          status: MessageStatus.SENT
        },
        {
          tenantId: tenantAcme.id,
          conversationId: acmeConversation.id,
          instanceId: acmeInstance.id,
          instanceScopeKey: acmeInstance.instanceName,
          direction: MessageDirection.OUTBOUND,
          content: "Recebido, suporte ACME aqui.",
          senderName: "Admin ACME",
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
