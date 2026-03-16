import type { CoreTenant } from "./core-client.js";

function normalizeText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function stripCoreSuffix(slug: string) {
  const normalized = normalizeText(slug);
  return normalized.endsWith("-core") ? normalized.slice(0, -5) : normalized;
}

export function findBestCoreTenantMatch(options: {
  localSlug?: string | null;
  localName?: string | null;
  coreTenants: CoreTenant[];
}) {
  const localSlug = normalizeText(options.localSlug);
  const localName = normalizeText(options.localName);
  const coreTenants = options.coreTenants;

  if (coreTenants.length < 1) {
    return null;
  }

  if (localSlug) {
    const exactSlug = coreTenants.find((entry) => normalizeText(entry.slug) === localSlug);
    if (exactSlug) {
      return exactSlug;
    }

    const slugWithCore = coreTenants.find((entry) => normalizeText(entry.slug) === `${localSlug}-core`);
    if (slugWithCore) {
      return slugWithCore;
    }

    const slugWithoutCore = stripCoreSuffix(localSlug);
    const compareByRoot = coreTenants.find((entry) => stripCoreSuffix(entry.slug) === slugWithoutCore);
    if (compareByRoot) {
      return compareByRoot;
    }
  }

  if (localName) {
    const exactName = coreTenants.find((entry) => normalizeText(entry.name) === localName);
    if (exactName) {
      return exactName;
    }
  }

  if (coreTenants.length === 1) {
    return coreTenants[0];
  }

  return null;
}
