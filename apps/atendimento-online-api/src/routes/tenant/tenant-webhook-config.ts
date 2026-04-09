import { env } from "../../config.js";

export function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function buildWebhookUrl(tenantSlug: string) {
  return `${stripTrailingSlash(env.WEBHOOK_RECEIVER_BASE_URL)}/webhooks/evolution/${tenantSlug}`;
}

export function buildWebhookHeaders() {
  if (!env.EVOLUTION_WEBHOOK_TOKEN) {
    return undefined;
  }

  return {
    "x-webhook-token": env.EVOLUTION_WEBHOOK_TOKEN
  };
}

export function resolvePathTemplate(template: string, instanceName: string) {
  const normalizedTemplate = template.trim();
  if (!normalizedTemplate) {
    return null;
  }

  const encodedInstance = encodeURIComponent(instanceName);
  const resolvedTemplate = normalizedTemplate.includes(":instance")
    ? normalizedTemplate.replace(":instance", encodedInstance)
    : normalizedTemplate;

  return resolvedTemplate.startsWith("/") ? resolvedTemplate : `/${resolvedTemplate}`;
}
