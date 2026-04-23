import { beforeEach, describe, expect, it } from "vitest";

import {
  clearRememberedAdminLoginEmail,
  clearAdminSessionSnapshot,
  getAdminSessionPersistenceMode,
  getRememberedAdminLoginEmail,
  isPersistentAdminSessionPreferred,
  persistRememberedAdminLoginEmail,
  persistAdminSessionSnapshot,
  readAdminSessionSnapshot,
  type AdminSessionStorageKeys
} from "~/utils/admin-session-persistence";

const STORAGE_KEYS: AdminSessionStorageKeys = {
  tokenKey: "test:admin:token",
  userKey: "test:admin:user",
  expiresAtKey: "test:admin:expires-at"
};

describe("admin session persistence", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("persiste o email do login lembrado sem guardar a senha", () => {
    persistRememberedAdminLoginEmail("  Root@Core.Local  ");

    expect(getRememberedAdminLoginEmail()).toBe("root@core.local");
    expect(window.localStorage.getItem("admin:login:remembered-email")).toBe("root@core.local");

    clearRememberedAdminLoginEmail();

    expect(getRememberedAdminLoginEmail()).toBe("");
    expect(window.localStorage.getItem("admin:login:remembered-email")).toBeNull();
  });

  it("persiste snapshot no localStorage quando o modo e persistente", () => {
    persistAdminSessionSnapshot(STORAGE_KEYS, {
      token: "token-local",
      userRaw: '{"id":"u-1"}',
      expiresAt: "2026-04-09T12:00:00Z"
    }, "persistent");

    expect(window.localStorage.getItem(STORAGE_KEYS.tokenKey)).toBe("token-local");
    expect(window.localStorage.getItem(STORAGE_KEYS.userKey)).toBe('{"id":"u-1"}');
    expect(window.localStorage.getItem(STORAGE_KEYS.expiresAtKey)).toBe("2026-04-09T12:00:00Z");
    expect(window.sessionStorage.getItem(STORAGE_KEYS.tokenKey)).toBeNull();
    expect(getAdminSessionPersistenceMode()).toBe("persistent");
    expect(isPersistentAdminSessionPreferred()).toBe(true);
    expect(readAdminSessionSnapshot(STORAGE_KEYS)).toEqual({
      token: "token-local",
      userRaw: '{"id":"u-1"}',
      expiresAt: "2026-04-09T12:00:00Z",
      mode: "persistent"
    });
  });

  it("move o snapshot para sessionStorage quando o modo muda para sessao", () => {
    persistAdminSessionSnapshot(STORAGE_KEYS, {
      token: "token-local",
      userRaw: '{"id":"u-1"}',
      expiresAt: "2026-04-09T12:00:00Z"
    }, "persistent");

    persistAdminSessionSnapshot(STORAGE_KEYS, {
      token: "token-session",
      userRaw: '{"id":"u-2"}',
      expiresAt: "2026-04-10T12:00:00Z"
    }, "session");

    expect(window.localStorage.getItem(STORAGE_KEYS.tokenKey)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.userKey)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.expiresAtKey)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEYS.tokenKey)).toBe("token-session");
    expect(window.sessionStorage.getItem(STORAGE_KEYS.userKey)).toBe('{"id":"u-2"}');
    expect(window.sessionStorage.getItem(STORAGE_KEYS.expiresAtKey)).toBe("2026-04-10T12:00:00Z");
    expect(getAdminSessionPersistenceMode()).toBe("session");
    expect(isPersistentAdminSessionPreferred()).toBe(false);
    expect(readAdminSessionSnapshot(STORAGE_KEYS)).toEqual({
      token: "token-session",
      userRaw: '{"id":"u-2"}',
      expiresAt: "2026-04-10T12:00:00Z",
      mode: "session"
    });
  });

  it("limpa token, usuario e expiracao nos dois storages", () => {
    persistAdminSessionSnapshot(STORAGE_KEYS, {
      token: "token-local",
      userRaw: '{"id":"u-1"}',
      expiresAt: "2026-04-09T12:00:00Z"
    }, "persistent");

    clearAdminSessionSnapshot(STORAGE_KEYS);

    expect(window.localStorage.getItem(STORAGE_KEYS.tokenKey)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.userKey)).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEYS.expiresAtKey)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEYS.tokenKey)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEYS.userKey)).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEYS.expiresAtKey)).toBeNull();
  });
});
