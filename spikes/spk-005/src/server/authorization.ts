export interface AuthenticatedUser {
  readonly id: string;
}

export interface ServerAuthVerifier {
  getUser(): Promise<{
    data: { user: AuthenticatedUser | null };
    error: unknown;
  }>;
}

export interface BusinessRecord {
  readonly id: string;
  readonly adminAuthUserId: string;
}

export interface AdminBusinessRepository {
  findByAdminAuthUserId(authUserId: string): Promise<BusinessRecord | null>;
}

export type AdminAuthorizationResult =
  | {
      readonly ok: true;
      readonly status: 200;
      readonly userId: string;
      readonly businessId: string;
    }
  | {
      readonly ok: false;
      readonly status: 401 | 403;
      readonly code:
        | "AUTHENTICATION_REQUIRED"
        | "BUSINESS_ADMIN_MISMATCH"
        | "BUSINESS_SCOPE_INVARIANT_FAILED";
    };

export async function authorizeBusinessAdmin(
  auth: ServerAuthVerifier,
  businesses: AdminBusinessRepository,
): Promise<AdminAuthorizationResult> {
  const { data, error } = await auth.getUser();

  if (error || !data.user) {
    return {
      ok: false,
      status: 401,
      code: "AUTHENTICATION_REQUIRED",
    };
  }

  const business = await businesses.findByAdminAuthUserId(data.user.id);
  if (!business) {
    return {
      ok: false,
      status: 403,
      code: "BUSINESS_ADMIN_MISMATCH",
    };
  }

  if (business.adminAuthUserId !== data.user.id) {
    return {
      ok: false,
      status: 403,
      code: "BUSINESS_SCOPE_INVARIANT_FAILED",
    };
  }

  return {
    ok: true,
    status: 200,
    userId: data.user.id,
    businessId: business.id,
  };
}

