import { prisma } from "../db.js";

type CountRow = {
  total: bigint | number | string;
};

type DuplicateGroupRow = {
  tenantId: string;
  phoneKey: string;
  total: bigint | number | string;
  conversationIds: string[];
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

async function countDuplicateGroups() {
  const [row] = await prisma.$queryRaw<CountRow[]>`
    WITH direct_conversations AS (
      SELECT
        c.id,
        c."tenantId",
        c."externalId",
        c."contactPhone",
        CASE
          WHEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g') ~ '^[0-9]{10,20}$'
          THEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g')
          ELSE NULL
        END AS phone_key
      FROM "Conversation" c
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
    )
    SELECT COUNT(*) AS total
    FROM (
      SELECT dc."tenantId", dc.phone_key
      FROM direct_conversations dc
      WHERE dc.phone_key IS NOT NULL
      GROUP BY dc."tenantId", dc.phone_key
      HAVING COUNT(*) > 1
    ) duplicate_groups
  `;

  return toNumber(row?.total ?? 0);
}

async function countShadowDuplicateGroups() {
  const [row] = await prisma.$queryRaw<CountRow[]>`
    WITH convo AS (
      SELECT
        c.id,
        c."tenantId",
        COALESCE(NULLIF(BTRIM(c."contactName"), ''), '') AS name_key,
        COALESCE(NULLIF(SPLIT_PART(BTRIM(c."contactAvatarUrl"), '?', 1), ''), '') AS avatar_key,
        COUNT(m.id)::bigint AS message_count
      FROM "Conversation" c
      LEFT JOIN "Message" m ON m."conversationId" = c.id
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
      GROUP BY c.id
    )
    SELECT COUNT(*) AS total
    FROM (
      SELECT "tenantId", name_key, avatar_key
      FROM convo
      WHERE name_key <> '' AND avatar_key <> ''
      GROUP BY "tenantId", name_key, avatar_key
      HAVING
        COUNT(*) > 1
        AND SUM(CASE WHEN message_count > 0 THEN 1 ELSE 0 END) > 0
        AND SUM(CASE WHEN message_count = 0 THEN 1 ELSE 0 END) > 0
    ) shadow_groups
  `;

  return toNumber(row?.total ?? 0);
}

async function listDuplicateGroups(limit = 30) {
  const rows = await prisma.$queryRaw<DuplicateGroupRow[]>`
    WITH direct_conversations AS (
      SELECT
        c.id,
        c."tenantId",
        c."externalId",
        c."contactPhone",
        c."lastMessageAt",
        CASE
          WHEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g') ~ '^[0-9]{10,20}$'
          THEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g')
          ELSE NULL
        END AS phone_key
      FROM "Conversation" c
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
    ),
    message_counts AS (
      SELECT m."conversationId", COUNT(*)::bigint AS message_count
      FROM "Message" m
      GROUP BY m."conversationId"
    ),
    ranked AS (
      SELECT
        dc.id,
        dc."tenantId",
        dc.phone_key,
        dc."externalId",
        dc."lastMessageAt",
        COALESCE(mc.message_count, 0) AS message_count,
        ROW_NUMBER() OVER (
          PARTITION BY dc."tenantId", dc.phone_key
          ORDER BY
            CASE WHEN dc."externalId" LIKE '%@s.whatsapp.net' THEN 1 ELSE 0 END DESC,
            COALESCE(mc.message_count, 0) DESC,
            dc."lastMessageAt" DESC,
            dc.id ASC
        ) AS rn
      FROM direct_conversations dc
      LEFT JOIN message_counts mc ON mc."conversationId" = dc.id
      WHERE dc.phone_key IS NOT NULL
    )
    SELECT
      r."tenantId" AS "tenantId",
      r.phone_key AS "phoneKey",
      COUNT(*)::bigint AS total,
      ARRAY_AGG(r.id ORDER BY r.rn ASC) AS "conversationIds"
    FROM ranked r
    GROUP BY r."tenantId", r.phone_key
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC, MAX(r."lastMessageAt") DESC
    LIMIT ${limit}
  `;

  return rows.map((entry) => ({
    ...entry,
    total: toNumber(entry.total)
  }));
}

async function applyDeduplication() {
  const movedMessages = await prisma.$executeRaw`
    WITH direct_conversations AS (
      SELECT
        c.id,
        c."tenantId",
        c."externalId",
        c."contactPhone",
        c."lastMessageAt",
        c."createdAt",
        CASE
          WHEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g') ~ '^[0-9]{10,20}$'
          THEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g')
          ELSE NULL
        END AS phone_key
      FROM "Conversation" c
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
    ),
    message_counts AS (
      SELECT m."conversationId", COUNT(*)::bigint AS message_count
      FROM "Message" m
      GROUP BY m."conversationId"
    ),
    ranked AS (
      SELECT
        dc.id,
        dc."tenantId",
        dc.phone_key,
        dc."externalId",
        dc."lastMessageAt",
        dc."createdAt",
        COALESCE(mc.message_count, 0) AS message_count,
        ROW_NUMBER() OVER (
          PARTITION BY dc."tenantId", dc.phone_key
          ORDER BY
            CASE WHEN dc."externalId" LIKE '%@s.whatsapp.net' THEN 1 ELSE 0 END DESC,
            COALESCE(mc.message_count, 0) DESC,
            dc."lastMessageAt" DESC,
            dc."createdAt" ASC,
            dc.id ASC
        ) AS rn
      FROM direct_conversations dc
      LEFT JOIN message_counts mc ON mc."conversationId" = dc.id
      WHERE dc.phone_key IS NOT NULL
    ),
    mapping AS (
      SELECT keep.id AS keep_id, lose.id AS lose_id
      FROM ranked keep
      JOIN ranked lose
        ON lose."tenantId" = keep."tenantId"
       AND lose.phone_key = keep.phone_key
      WHERE keep.rn = 1
        AND lose.rn > 1
    )
    UPDATE "Message" m
    SET "conversationId" = mapping.keep_id
    FROM mapping
    WHERE m."conversationId" = mapping.lose_id
  `;

  const movedAuditEvents = await prisma.$executeRaw`
    WITH direct_conversations AS (
      SELECT
        c.id,
        c."tenantId",
        c."externalId",
        c."contactPhone",
        c."lastMessageAt",
        c."createdAt",
        CASE
          WHEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g') ~ '^[0-9]{10,20}$'
          THEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g')
          ELSE NULL
        END AS phone_key
      FROM "Conversation" c
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
    ),
    message_counts AS (
      SELECT m."conversationId", COUNT(*)::bigint AS message_count
      FROM "Message" m
      GROUP BY m."conversationId"
    ),
    ranked AS (
      SELECT
        dc.id,
        dc."tenantId",
        dc.phone_key,
        dc."externalId",
        dc."lastMessageAt",
        dc."createdAt",
        COALESCE(mc.message_count, 0) AS message_count,
        ROW_NUMBER() OVER (
          PARTITION BY dc."tenantId", dc.phone_key
          ORDER BY
            CASE WHEN dc."externalId" LIKE '%@s.whatsapp.net' THEN 1 ELSE 0 END DESC,
            COALESCE(mc.message_count, 0) DESC,
            dc."lastMessageAt" DESC,
            dc."createdAt" ASC,
            dc.id ASC
        ) AS rn
      FROM direct_conversations dc
      LEFT JOIN message_counts mc ON mc."conversationId" = dc.id
      WHERE dc.phone_key IS NOT NULL
    ),
    mapping AS (
      SELECT keep.id AS keep_id, lose.id AS lose_id
      FROM ranked keep
      JOIN ranked lose
        ON lose."tenantId" = keep."tenantId"
       AND lose.phone_key = keep.phone_key
      WHERE keep.rn = 1
        AND lose.rn > 1
    )
    UPDATE "AuditEvent" a
    SET "conversationId" = mapping.keep_id
    FROM mapping
    WHERE a."conversationId" = mapping.lose_id
  `;

  const deletedConversations = await prisma.$executeRaw`
    WITH direct_conversations AS (
      SELECT
        c.id,
        c."tenantId",
        c."externalId",
        c."contactPhone",
        c."lastMessageAt",
        c."createdAt",
        CASE
          WHEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g') ~ '^[0-9]{10,20}$'
          THEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g')
          ELSE NULL
        END AS phone_key
      FROM "Conversation" c
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
    ),
    message_counts AS (
      SELECT m."conversationId", COUNT(*)::bigint AS message_count
      FROM "Message" m
      GROUP BY m."conversationId"
    ),
    ranked AS (
      SELECT
        dc.id,
        dc."tenantId",
        dc.phone_key,
        dc."externalId",
        dc."lastMessageAt",
        dc."createdAt",
        COALESCE(mc.message_count, 0) AS message_count,
        ROW_NUMBER() OVER (
          PARTITION BY dc."tenantId", dc.phone_key
          ORDER BY
            CASE WHEN dc."externalId" LIKE '%@s.whatsapp.net' THEN 1 ELSE 0 END DESC,
            COALESCE(mc.message_count, 0) DESC,
            dc."lastMessageAt" DESC,
            dc."createdAt" ASC,
            dc.id ASC
        ) AS rn
      FROM direct_conversations dc
      LEFT JOIN message_counts mc ON mc."conversationId" = dc.id
      WHERE dc.phone_key IS NOT NULL
    ),
    mapping AS (
      SELECT keep.id AS keep_id, lose.id AS lose_id
      FROM ranked keep
      JOIN ranked lose
        ON lose."tenantId" = keep."tenantId"
       AND lose.phone_key = keep.phone_key
      WHERE keep.rn = 1
        AND lose.rn > 1
    )
    DELETE FROM "Conversation" c
    USING mapping
    WHERE c.id = mapping.lose_id
  `;

  const canonicalizedExternalIds = await prisma.$executeRaw`
    WITH direct_conversations AS (
      SELECT
        c.id,
        c."tenantId",
        c."externalId",
        CASE
          WHEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g') ~ '^[0-9]{10,20}$'
          THEN REGEXP_REPLACE(COALESCE(NULLIF(c."contactPhone", ''), c."externalId"), '[^0-9]', '', 'g')
          ELSE NULL
        END AS phone_key
      FROM "Conversation" c
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
    )
    UPDATE "Conversation" c
    SET "externalId" = direct_conversations.phone_key || '@s.whatsapp.net'
    FROM direct_conversations
    WHERE c.id = direct_conversations.id
      AND direct_conversations.phone_key IS NOT NULL
      AND c."externalId" <> direct_conversations.phone_key || '@s.whatsapp.net'
      AND NOT EXISTS (
        SELECT 1
        FROM "Conversation" canonical
        WHERE canonical."tenantId" = c."tenantId"
          AND canonical.channel = c.channel
          AND canonical."externalId" = direct_conversations.phone_key || '@s.whatsapp.net'
          AND canonical.id <> c.id
      )
  `;

  const movedShadowMessages = await prisma.$executeRaw`
    WITH convo AS (
      SELECT
        c.id,
        c."tenantId",
        COALESCE(NULLIF(BTRIM(c."contactName"), ''), '') AS name_key,
        COALESCE(NULLIF(SPLIT_PART(BTRIM(c."contactAvatarUrl"), '?', 1), ''), '') AS avatar_key,
        c."lastMessageAt",
        c."createdAt",
        COUNT(m.id)::bigint AS message_count
      FROM "Conversation" c
      LEFT JOIN "Message" m ON m."conversationId" = c.id
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
      GROUP BY c.id
    ),
    ranked AS (
      SELECT
        convo.*,
        ROW_NUMBER() OVER (
          PARTITION BY convo."tenantId", convo.name_key, convo.avatar_key
          ORDER BY convo.message_count DESC, convo."lastMessageAt" DESC, convo."createdAt" ASC, convo.id ASC
        ) AS rn,
        COUNT(*) OVER (
          PARTITION BY convo."tenantId", convo.name_key, convo.avatar_key
        ) AS total_in_group
      FROM convo
      WHERE convo.name_key <> '' AND convo.avatar_key <> ''
    ),
    mapping AS (
      SELECT keep.id AS keep_id, lose.id AS lose_id
      FROM ranked keep
      JOIN ranked lose
        ON lose."tenantId" = keep."tenantId"
       AND lose.name_key = keep.name_key
       AND lose.avatar_key = keep.avatar_key
      WHERE keep.rn = 1
        AND keep.message_count > 0
        AND keep.total_in_group > 1
        AND lose.rn > 1
        AND lose.message_count = 0
    )
    UPDATE "Message" m
    SET "conversationId" = mapping.keep_id
    FROM mapping
    WHERE m."conversationId" = mapping.lose_id
  `;

  const movedShadowAuditEvents = await prisma.$executeRaw`
    WITH convo AS (
      SELECT
        c.id,
        c."tenantId",
        COALESCE(NULLIF(BTRIM(c."contactName"), ''), '') AS name_key,
        COALESCE(NULLIF(SPLIT_PART(BTRIM(c."contactAvatarUrl"), '?', 1), ''), '') AS avatar_key,
        c."lastMessageAt",
        c."createdAt",
        COUNT(m.id)::bigint AS message_count
      FROM "Conversation" c
      LEFT JOIN "Message" m ON m."conversationId" = c.id
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
      GROUP BY c.id
    ),
    ranked AS (
      SELECT
        convo.*,
        ROW_NUMBER() OVER (
          PARTITION BY convo."tenantId", convo.name_key, convo.avatar_key
          ORDER BY convo.message_count DESC, convo."lastMessageAt" DESC, convo."createdAt" ASC, convo.id ASC
        ) AS rn,
        COUNT(*) OVER (
          PARTITION BY convo."tenantId", convo.name_key, convo.avatar_key
        ) AS total_in_group
      FROM convo
      WHERE convo.name_key <> '' AND convo.avatar_key <> ''
    ),
    mapping AS (
      SELECT keep.id AS keep_id, lose.id AS lose_id
      FROM ranked keep
      JOIN ranked lose
        ON lose."tenantId" = keep."tenantId"
       AND lose.name_key = keep.name_key
       AND lose.avatar_key = keep.avatar_key
      WHERE keep.rn = 1
        AND keep.message_count > 0
        AND keep.total_in_group > 1
        AND lose.rn > 1
        AND lose.message_count = 0
    )
    UPDATE "AuditEvent" a
    SET "conversationId" = mapping.keep_id
    FROM mapping
    WHERE a."conversationId" = mapping.lose_id
  `;

  const deletedShadowConversations = await prisma.$executeRaw`
    WITH convo AS (
      SELECT
        c.id,
        c."tenantId",
        COALESCE(NULLIF(BTRIM(c."contactName"), ''), '') AS name_key,
        COALESCE(NULLIF(SPLIT_PART(BTRIM(c."contactAvatarUrl"), '?', 1), ''), '') AS avatar_key,
        c."lastMessageAt",
        c."createdAt",
        COUNT(m.id)::bigint AS message_count
      FROM "Conversation" c
      LEFT JOIN "Message" m ON m."conversationId" = c.id
      WHERE c.channel = 'WHATSAPP'
        AND c."externalId" NOT LIKE '%@g.us'
      GROUP BY c.id
    ),
    ranked AS (
      SELECT
        convo.*,
        ROW_NUMBER() OVER (
          PARTITION BY convo."tenantId", convo.name_key, convo.avatar_key
          ORDER BY convo.message_count DESC, convo."lastMessageAt" DESC, convo."createdAt" ASC, convo.id ASC
        ) AS rn,
        COUNT(*) OVER (
          PARTITION BY convo."tenantId", convo.name_key, convo.avatar_key
        ) AS total_in_group
      FROM convo
      WHERE convo.name_key <> '' AND convo.avatar_key <> ''
    ),
    mapping AS (
      SELECT keep.id AS keep_id, lose.id AS lose_id
      FROM ranked keep
      JOIN ranked lose
        ON lose."tenantId" = keep."tenantId"
       AND lose.name_key = keep.name_key
       AND lose.avatar_key = keep.avatar_key
      WHERE keep.rn = 1
        AND keep.message_count > 0
        AND keep.total_in_group > 1
        AND lose.rn > 1
        AND lose.message_count = 0
    )
    DELETE FROM "Conversation" c
    USING mapping
    WHERE c.id = mapping.lose_id
  `;

  return {
    movedMessages,
    movedAuditEvents,
    deletedConversations,
    canonicalizedExternalIds,
    movedShadowMessages,
    movedShadowAuditEvents,
    deletedShadowConversations
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const duplicateGroupsBefore = await countDuplicateGroups();
  const shadowDuplicateGroupsBefore = await countShadowDuplicateGroups();
  const sampleBefore = await listDuplicateGroups(15);

  console.log(`[dedupe-direct-conversations] grupos duplicados: ${duplicateGroupsBefore}`);
  console.log(`[dedupe-direct-conversations] grupos sombra (nome+avatar): ${shadowDuplicateGroupsBefore}`);
  if (sampleBefore.length > 0) {
    console.log("[dedupe-direct-conversations] amostra de grupos:");
    for (const group of sampleBefore) {
      console.log(
        `  tenant=${group.tenantId} phone=${group.phoneKey} total=${group.total} ids=${group.conversationIds.join(",")}`
      );
    }
  }

  if (!apply) {
    console.log("[dedupe-direct-conversations] modo dry-run. Use --apply para executar.");
    return;
  }

  const result = await applyDeduplication();
  const duplicateGroupsAfter = await countDuplicateGroups();
  const shadowDuplicateGroupsAfter = await countShadowDuplicateGroups();

  console.log(`[dedupe-direct-conversations] mensagens movidas: ${result.movedMessages}`);
  console.log(`[dedupe-direct-conversations] auditorias movidas: ${result.movedAuditEvents}`);
  console.log(`[dedupe-direct-conversations] conversas removidas: ${result.deletedConversations}`);
  console.log(`[dedupe-direct-conversations] externalIds canonicalizados: ${result.canonicalizedExternalIds}`);
  console.log(`[dedupe-direct-conversations] mensagens sombra movidas: ${result.movedShadowMessages}`);
  console.log(`[dedupe-direct-conversations] auditorias sombra movidas: ${result.movedShadowAuditEvents}`);
  console.log(`[dedupe-direct-conversations] conversas sombra removidas: ${result.deletedShadowConversations}`);
  console.log(`[dedupe-direct-conversations] grupos duplicados apos ajuste: ${duplicateGroupsAfter}`);
  console.log(`[dedupe-direct-conversations] grupos sombra apos ajuste: ${shadowDuplicateGroupsAfter}`);
}

main()
  .catch((error) => {
    console.error("[dedupe-direct-conversations] erro:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
