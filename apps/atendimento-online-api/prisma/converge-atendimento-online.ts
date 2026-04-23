import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const statements = [
  `CREATE SCHEMA IF NOT EXISTS atendimento_online`,
  `DROP TABLE IF EXISTS public."WhatsAppInstanceUserAccess" CASCADE`,
  `DROP TABLE IF EXISTS atendimento_online."WhatsAppInstanceUserAccess" CASCADE`,
  `ALTER TABLE IF EXISTS public."AtendimentoTenantConfig" DROP COLUMN IF EXISTS "evolutionApiKey"`,
  `ALTER TABLE IF EXISTS public."WhatsAppInstance" DROP COLUMN IF EXISTS "evolutionApiKey"`,
  `ALTER TABLE IF EXISTS public."WhatsAppInstance" DROP COLUMN IF EXISTS "userScopePolicy"`,
  `ALTER TABLE IF EXISTS atendimento_online."AtendimentoTenantConfig" DROP COLUMN IF EXISTS "evolutionApiKey"`,
  `ALTER TABLE IF EXISTS atendimento_online."WhatsAppInstance" DROP COLUMN IF EXISTS "evolutionApiKey"`,
  `ALTER TABLE IF EXISTS atendimento_online."WhatsAppInstance" DROP COLUMN IF EXISTS "userScopePolicy"`,
  `DROP TYPE IF EXISTS public."UserRole" CASCADE`,
  `DROP TYPE IF EXISTS atendimento_online."UserRole" CASCADE`,
  `DROP TYPE IF EXISTS public."WhatsAppInstanceUserScopePolicy" CASCADE`,
  `DROP TYPE IF EXISTS atendimento_online."WhatsAppInstanceUserScopePolicy" CASCADE`,
  `DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ChannelType'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'atendimento_online' AND t.typname = 'ChannelType'
  ) THEN
    ALTER TYPE public."ChannelType" SET SCHEMA atendimento_online;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'ConversationStatus'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'atendimento_online' AND t.typname = 'ConversationStatus'
  ) THEN
    ALTER TYPE public."ConversationStatus" SET SCHEMA atendimento_online;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'MessageDirection'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'atendimento_online' AND t.typname = 'MessageDirection'
  ) THEN
    ALTER TYPE public."MessageDirection" SET SCHEMA atendimento_online;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'MessageStatus'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'atendimento_online' AND t.typname = 'MessageStatus'
  ) THEN
    ALTER TYPE public."MessageStatus" SET SCHEMA atendimento_online;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'MessageType'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'atendimento_online' AND t.typname = 'MessageType'
  ) THEN
    ALTER TYPE public."MessageType" SET SCHEMA atendimento_online;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'AuditEventType'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'atendimento_online' AND t.typname = 'AuditEventType'
  ) THEN
    ALTER TYPE public."AuditEventType" SET SCHEMA atendimento_online;
  END IF;
END $$`,
  `ALTER TABLE IF EXISTS public."AtendimentoTenantConfig" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."WhatsAppInstance" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."SavedSticker" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."Conversation" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."Message" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."AuditEvent" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."Contact" SET SCHEMA atendimento_online`,
  `ALTER TABLE IF EXISTS public."HiddenMessageForUser" SET SCHEMA atendimento_online`
];

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }

  console.log("Schema do atendimento-online convergido para atendimento_online.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
