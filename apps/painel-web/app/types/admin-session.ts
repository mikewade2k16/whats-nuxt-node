export interface AdminSessionConfigData {
  ttlMinutes: number;
  defaultTTLMinutes: number;
  minTTLMinutes: number;
  maxTTLMinutes: number;
  updatedAt: string;
}

export interface AdminActiveSessionDeviceData {
  id: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  deviceName?: string;
  userAgent?: string;
  ip?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  current: boolean;
}

export interface AdminActiveSessionUserData {
  userId: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  sessionCount: number;
  multipleDevices: boolean;
  hasCurrentSession: boolean;
  lastSeenAt: string;
  expiresAt: string;
  activeSessions: AdminActiveSessionDeviceData[];
}

export interface AdminSessionRevocationData {
  userId?: string;
  sessionId?: string;
  revokedCount: number;
  revokedCurrentSession: boolean;
}