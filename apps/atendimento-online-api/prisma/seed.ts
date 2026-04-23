import {
  AuditEventType,
  ChannelType,
  ConversationStatus,
  MessageDirection,
  MessageStatus,
  MessageType,
  Prisma,
  PrismaClient
} from "@prisma/client";

const prisma = new PrismaClient();
const DEFAULT_SEED_TENANT_SLUGS = ["demo-core"];

type CoreTenantRow = {
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
};

type CoreTenantUserRow = {
  userId: string;
  email: string;
  name: string;
  accessLevel: string | null;
  isOwner: boolean;
};

function parseSeedTenantSlugs() {
  const normalized = String(process.env.ATENDIMENTO_SEED_TENANT_SLUGS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  return normalized.length > 0 ? normalized : DEFAULT_SEED_TENANT_SLUGS;
}

function buildInstanceName(tenantSlug: string) {
  const baseSlug = tenantSlug.replace(/-core$/i, "").trim() || tenantSlug.trim() || "tenant";
  return `${baseSlug}-instance`.slice(0, 80);
}

function buildContactPhone(seedIndex: number) {
  return `551199900${String(seedIndex + 1000).padStart(4, "0")}`;
}

function normalizeAccessLevel(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase();
}

async function listAvailableAtendimentoTenants() {
  return prisma.$queryRaw<CoreTenantRow[]>(Prisma.sql`
    SELECT
      t.id::text AS "tenantId",
      t.slug AS "tenantSlug",
      t.name AS "tenantName"
    FROM platform_core.tenants t
    JOIN platform_core.tenant_modules tm
      ON tm.tenant_id = t.id
     AND tm.status = 'active'
    JOIN platform_core.modules m
      ON m.id = tm.module_id
     AND m.code = 'atendimento'
    ORDER BY t.slug ASC
  `);
}

async function resolveSeedTenants(requestedSlugs: string[]) {
  const available = await listAvailableAtendimentoTenants();
  const bySlug = new Map(
    available.map((entry) => [entry.tenantSlug.trim().toLowerCase(), entry])
  );

  const resolved = requestedSlugs
    .map((slug) => bySlug.get(slug.trim().toLowerCase()) ?? null)
    .filter((entry): entry is CoreTenantRow => Boolean(entry));

  if (resolved.length > 0) {
    return resolved;
  }

  const availableSlugs = available.map((entry) => entry.tenantSlug).join(", ") || "nenhum";
  throw new Error(
    `Nenhum tenant solicitado para seed foi encontrado com módulo atendimento ativo no platform_core. ` +
    `Solicitados: ${requestedSlugs.join(", ")}. Disponíveis: ${availableSlugs}.`
  );
}

async function listCoreTenantUsers(tenantId: string) {
  return prisma.$queryRaw<CoreTenantUserRow[]>(Prisma.sql`
    SELECT
      tu.user_id::text AS "userId",
      u.email AS "email",
      COALESCE(NULLIF(u.display_name, ''), NULLIF(u.name, ''), split_part(u.email, '@', 1)) AS "name",
      tu.access_level::text AS "accessLevel",
      tu.is_owner AS "isOwner"
    FROM platform_core.tenant_users tu
    JOIN platform_core.users u
      ON u.id = tu.user_id
    WHERE tu.tenant_id = ${tenantId}::uuid
      AND tu.status = 'active'
      AND COALESCE(u.deleted_at IS NULL, true)
    ORDER BY
      tu.is_owner DESC,
      CASE
        WHEN tu.access_level::text = 'admin' THEN 0
        WHEN tu.access_level::text = 'manager' THEN 1
        WHEN tu.access_level::text = 'viewer' THEN 2
        ELSE 3
      END,
      u.email ASC
  `);
}

function pickOperationalUsers(users: CoreTenantUserRow[]) {
  if (users.length < 1) {
    throw new Error("Seed operacional requer pelo menos um usuário ativo no tenant do core.");
  }

  const adminLike =
    users.find((entry) => entry.isOwner)
    ?? users.find((entry) => ["admin", "manager"].includes(normalizeAccessLevel(entry.accessLevel)))
    ?? users[0];
  const assignee =
    users.find((entry) => entry.userId !== adminLike.userId)
    ?? adminLike;

  return {
    adminLike,
    assignee
  };
}

async function seedTenantRuntime(tenant: CoreTenantRow, seedIndex: number) {
  const coreUsers = await listCoreTenantUsers(tenant.tenantId);
  const { adminLike, assignee } = pickOperationalUsers(coreUsers);
  const hiddenForUserId = assignee.userId !== adminLike.userId ? adminLike.userId : assignee.userId;
  const instanceName = buildInstanceName(tenant.tenantSlug);
  const contactPhone = buildContactPhone(seedIndex);
  const externalId = `${contactPhone}@s.whatsapp.net`;
  const now = new Date();
  const inboundCreatedAt = new Date(now.getTime() - 10 * 60_000);
  const outboundCreatedAt = new Date(now.getTime() - 7 * 60_000);

  await prisma.atendimentoTenantConfig.upsert({
    where: {
      tenantId: tenant.tenantId
    },
    update: {
      retentionDays: 15,
      maxUploadMb: 500
    },
    create: {
      tenantId: tenant.tenantId,
      retentionDays: 15,
      maxUploadMb: 500
    }
  });

  const instance = await prisma.whatsAppInstance.upsert({
    where: {
      tenantId_instanceName: {
        tenantId: tenant.tenantId,
        instanceName
      }
    },
    update: {
      displayName: `WhatsApp ${tenant.tenantName}`,
      isDefault: true,
      isActive: true,
      createdByUserId: adminLike.userId,
      responsibleUserId: assignee.userId
    },
    create: {
      tenantId: tenant.tenantId,
      instanceName,
      displayName: `WhatsApp ${tenant.tenantName}`,
      isDefault: true,
      isActive: true,
      createdByUserId: adminLike.userId,
      responsibleUserId: assignee.userId
    }
  });

  await prisma.whatsAppInstance.updateMany({
    where: {
      tenantId: tenant.tenantId,
      id: {
        not: instance.id
      },
      isDefault: true
    },
    data: {
      isDefault: false
    }
  });

  const existingSticker = await prisma.savedSticker.findFirst({
    where: {
      tenantId: tenant.tenantId,
      name: "Boas-vindas seed core"
    },
    select: {
      id: true
    }
  });

  if (existingSticker) {
    await prisma.savedSticker.update({
      where: {
        id: existingSticker.id
      },
      data: {
        createdByUserId: adminLike.userId,
        mimeType: "image/webp",
        sizeBytes: 128,
        dataUrl: "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoEAAQAAVAfCWkA",
        updatedAt: now
      }
    });
  } else {
    await prisma.savedSticker.create({
      data: {
        tenantId: tenant.tenantId,
        createdByUserId: adminLike.userId,
        name: "Boas-vindas seed core",
        mimeType: "image/webp",
        sizeBytes: 128,
        dataUrl: "data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoEAAQAAVAfCWkA"
      }
    });
  }

  const contact = await prisma.contact.upsert({
    where: {
      tenantId_phone: {
        tenantId: tenant.tenantId,
        phone: contactPhone
      }
    },
    update: {
      name: `Cliente ${tenant.tenantName}`,
      source: "SEED_CORE_RUNTIME"
    },
    create: {
      tenantId: tenant.tenantId,
      name: `Cliente ${tenant.tenantName}`,
      phone: contactPhone,
      source: "SEED_CORE_RUNTIME"
    }
  });

  const conversation = await prisma.conversation.upsert({
    where: {
      tenantId_externalId_channel_instanceScopeKey: {
        tenantId: tenant.tenantId,
        externalId,
        channel: ChannelType.WHATSAPP,
        instanceScopeKey: instance.instanceName
      }
    },
    update: {
      instanceId: instance.id,
      assignedToId: assignee.userId,
      contactId: contact.id,
      contactName: contact.name,
      contactPhone: contact.phone,
      status: ConversationStatus.OPEN,
      lastMessageAt: outboundCreatedAt
    },
    create: {
      tenantId: tenant.tenantId,
      instanceId: instance.id,
      instanceScopeKey: instance.instanceName,
      assignedToId: assignee.userId,
      contactId: contact.id,
      channel: ChannelType.WHATSAPP,
      externalId,
      contactName: contact.name,
      contactPhone: contact.phone,
      status: ConversationStatus.OPEN,
      lastMessageAt: outboundCreatedAt
    }
  });

  const existingMessages = await prisma.message.findMany({
    where: {
      tenantId: tenant.tenantId,
      conversationId: conversation.id
    },
    orderBy: {
      createdAt: "asc"
    },
    select: {
      id: true
    }
  });

  if (existingMessages.length < 2) {
    await prisma.message.createMany({
      data: [
        {
          tenantId: tenant.tenantId,
          conversationId: conversation.id,
          instanceId: instance.id,
          instanceScopeKey: instance.instanceName,
          direction: MessageDirection.INBOUND,
          messageType: MessageType.TEXT,
          content: `Oi, quero atendimento no tenant ${tenant.tenantSlug}.`,
          senderName: contact.name,
          status: MessageStatus.SENT,
          createdAt: inboundCreatedAt
        },
        {
          tenantId: tenant.tenantId,
          conversationId: conversation.id,
          instanceId: instance.id,
          instanceScopeKey: instance.instanceName,
          senderUserId: assignee.userId,
          direction: MessageDirection.OUTBOUND,
          messageType: MessageType.TEXT,
          content: `Perfeito! Aqui o runtime operacional já está vinculado ao core do tenant ${tenant.tenantSlug}.`,
          senderName: assignee.name,
          status: MessageStatus.SENT,
          createdAt: outboundCreatedAt
        }
      ]
    });
  }

  const latestMessages = await prisma.message.findMany({
    where: {
      tenantId: tenant.tenantId,
      conversationId: conversation.id
    },
    orderBy: {
      createdAt: "asc"
    },
    take: 2,
    select: {
      id: true,
      createdAt: true
    }
  });

  const latestMessage = latestMessages[latestMessages.length - 1] ?? null;
  if (latestMessage) {
    await prisma.conversation.update({
      where: {
        id: conversation.id
      },
      data: {
        lastMessageAt: latestMessage.createdAt
      }
    });
  }

  const auditCount = await prisma.auditEvent.count({
    where: {
      tenantId: tenant.tenantId,
      conversationId: conversation.id
    }
  });

  if (auditCount < 1) {
    await prisma.auditEvent.create({
      data: {
        tenantId: tenant.tenantId,
        actorUserId: assignee.userId,
        conversationId: conversation.id,
        messageId: latestMessage?.id ?? null,
        eventType: AuditEventType.CONVERSATION_ASSIGNED,
        payloadJson: {
          seededFrom: "platform_core",
          assignedToUserId: assignee.userId,
          assignedToEmail: assignee.email
        }
      }
    });
  }

  const firstMessage = latestMessages[0] ?? latestMessage;
  if (firstMessage) {
    await prisma.hiddenMessageForUser.createMany({
      data: [
        {
          tenantId: tenant.tenantId,
          userId: hiddenForUserId,
          messageId: firstMessage.id
        }
      ],
      skipDuplicates: true
    });
  }

  console.log(
    `[seed] tenant=${tenant.tenantSlug} users=${coreUsers.length} instance=${instance.instanceName} conversation=${conversation.id}`
  );
}

async function seed() {
  const requestedSlugs = parseSeedTenantSlugs();
  const tenants = await resolveSeedTenants(requestedSlugs);

  for (const [index, tenant] of tenants.entries()) {
    await seedTenantRuntime(tenant, index);
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
