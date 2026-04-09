interface PasswordCredentialConstructor {
  new (data: { id: string; password: string; name?: string }): Credential;
}

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function getPasswordCredentialConstructor() {
  if (typeof window === "undefined") {
    return null;
  }

  const candidate = (window as typeof window & {
    PasswordCredential?: PasswordCredentialConstructor;
  }).PasswordCredential;

  return typeof candidate === "function" ? candidate : null;
}

export async function storeAdminLoginCredential(input: {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}) {
  if (typeof navigator === "undefined" || !navigator.credentials?.store) {
    return false;
  }

  const PasswordCredentialCtor = getPasswordCredentialConstructor();
  if (!PasswordCredentialCtor) {
    return false;
  }

  const email = normalizeText(input.email).toLowerCase();
  const password = String(input.password ?? "");
  const name = normalizeText(input.name) || email;
  if (!email || !password) {
    return false;
  }

  try {
    const credential = new PasswordCredentialCtor({
      id: email,
      password,
      name
    });

    await navigator.credentials.store(credential);
    return true;
  } catch {
    return false;
  }
}