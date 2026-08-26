import {
  businessScopeFromServer,
  type BusinessScope,
} from "@/domain/business/business-scope";
import { ApplicationError } from "@/shared/errors/application-error";

export type BusinessIdentity = Readonly<{
  id: string;
  adminAuthUserId: string;
}>;

export interface BusinessScopeReader {
  findPublicSingleton(): Promise<BusinessIdentity[]>;
  findByAdminAuthUserId(authUserId: string): Promise<BusinessIdentity | null>;
}

export async function resolvePublicBusinessScope(
  reader: BusinessScopeReader,
): Promise<BusinessScope> {
  const businesses = await reader.findPublicSingleton();
  const business = businesses[0];

  if (businesses.length !== 1 || !business) {
    throw new ApplicationError(
      businesses.length === 0
        ? "BUSINESS_SCOPE_NOT_FOUND"
        : "BUSINESS_SCOPE_AMBIGUOUS",
      "Não foi possível identificar o negócio público.",
      503,
    );
  }

  return businessScopeFromServer(business.id, "public-singleton");
}

export async function resolveAdminBusinessScope(
  reader: BusinessScopeReader,
  authenticatedUserId: string,
): Promise<BusinessScope> {
  const business = await reader.findByAdminAuthUserId(authenticatedUserId);

  if (!business) {
    throw new ApplicationError(
      "ADMIN_NOT_AUTHORIZED",
      "Você não tem acesso administrativo a este negócio.",
      403,
    );
  }

  return businessScopeFromServer(business.id, "admin-auth-user");
}
