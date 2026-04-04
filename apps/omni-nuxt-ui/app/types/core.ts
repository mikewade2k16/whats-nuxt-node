export interface CoreAuthUser {
  id: string;
  name: string;
  email: string;
  nick?: string | null;
  profileImage?: string | null;
  isPlatformAdmin: boolean;
  tenantId?: string;
  clientId?: number | null;
  clientName?: string;
  level?: string;
  userType?: string;
  preferences?: string;
  moduleCodes?: string[];
  atendimentoAccess?: boolean;
}

export interface CoreLoginResponse {
  accessToken: string;
  expiresAt: string;
  user: CoreAuthUser;
}

export interface CoreMeResponse {
  user: CoreAuthUser;
}

export interface CoreTenantRecord {
  id: string;
  slug: string;
  name: string;
  status: string;
  contactEmail?: string;
  timezone: string;
  locale: string;
  createdAt: string;
  updatedAt: string;
}

export interface CoreRoleRecord {
  id: string;
  tenantId?: string;
  moduleCode?: string;
  code: string;
  name: string;
  description?: string;
  isSystem: boolean;
  isActive: boolean;
  permissionCodes: string[];
  createdAt: string;
  updatedAt: string;
}
