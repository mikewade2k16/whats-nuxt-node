SELECT COUNT(*) AS duplicate_tenant_core_ids
FROM (
  SELECT "coreTenantId"
  FROM public."Tenant"
  WHERE "coreTenantId" IS NOT NULL
  GROUP BY "coreTenantId"
  HAVING COUNT(*) > 1
) t;

SELECT COUNT(*) AS duplicate_user_core_tenant_user_ids
FROM (
  SELECT "coreTenantUserId"
  FROM public."User"
  WHERE "coreTenantUserId" IS NOT NULL
  GROUP BY "coreTenantUserId"
  HAVING COUNT(*) > 1
) u;
