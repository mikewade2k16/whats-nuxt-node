import { prisma } from "../db.js";

type CountRow = {
  total: bigint | number | string;
};

function toNumber(value: bigint | number | string) {
  if (typeof value === "bigint") {
    return Number(value);
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function main() {
  const apply = process.argv.includes("--apply");

  const [candidateCountRow] = await prisma.$queryRaw<CountRow[]>`
    SELECT COUNT(*) AS total
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE
      m.direction = 'INBOUND'
      AND c.channel = 'WHATSAPP'
      AND c."externalId" NOT LIKE '%@g.us'
      AND c."contactName" IS NOT NULL
      AND BTRIM(c."contactName") <> ''
      AND NOT (
        LOWER(BTRIM(c."contactName")) LIKE '%@s.whatsapp.net'
        OR LOWER(BTRIM(c."contactName")) LIKE '%@g.us'
        OR LOWER(BTRIM(c."contactName")) LIKE '%@lid'
        OR REGEXP_REPLACE(c."contactName", '[^0-9]', '', 'g') ~ '^[0-9]{7,20}$'
      )
      AND (
        m."senderName" IS NULL
        OR BTRIM(m."senderName") = ''
        OR LOWER(BTRIM(m."senderName")) LIKE '%@s.whatsapp.net'
        OR LOWER(BTRIM(m."senderName")) LIKE '%@g.us'
        OR LOWER(BTRIM(m."senderName")) LIKE '%@lid'
        OR REGEXP_REPLACE(m."senderName", '[^0-9]', '', 'g') ~ '^[0-9]{7,20}$'
      )
  `;

  const candidateCount = toNumber(candidateCountRow?.total ?? 0);
  console.log(`[normalize-direct-sender-names] candidatos: ${candidateCount}`);

  if (!apply) {
    console.log("[normalize-direct-sender-names] modo dry-run. Use --apply para atualizar.");
    return;
  }

  const updatedCount = await prisma.$executeRaw`
    UPDATE "Message" m
    SET "senderName" = c."contactName"
    FROM "Conversation" c
    WHERE
      c.id = m."conversationId"
      AND m.direction = 'INBOUND'
      AND c.channel = 'WHATSAPP'
      AND c."externalId" NOT LIKE '%@g.us'
      AND c."contactName" IS NOT NULL
      AND BTRIM(c."contactName") <> ''
      AND NOT (
        LOWER(BTRIM(c."contactName")) LIKE '%@s.whatsapp.net'
        OR LOWER(BTRIM(c."contactName")) LIKE '%@g.us'
        OR LOWER(BTRIM(c."contactName")) LIKE '%@lid'
        OR REGEXP_REPLACE(c."contactName", '[^0-9]', '', 'g') ~ '^[0-9]{7,20}$'
      )
      AND (
        m."senderName" IS NULL
        OR BTRIM(m."senderName") = ''
        OR LOWER(BTRIM(m."senderName")) LIKE '%@s.whatsapp.net'
        OR LOWER(BTRIM(m."senderName")) LIKE '%@g.us'
        OR LOWER(BTRIM(m."senderName")) LIKE '%@lid'
        OR REGEXP_REPLACE(m."senderName", '[^0-9]', '', 'g') ~ '^[0-9]{7,20}$'
      )
  `;

  console.log(`[normalize-direct-sender-names] atualizadas: ${updatedCount}`);
}

main()
  .catch((error) => {
    console.error("[normalize-direct-sender-names] erro:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
