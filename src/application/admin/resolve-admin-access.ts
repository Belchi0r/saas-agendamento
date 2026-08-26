import type { BusinessScope } from "@/domain/business/business-scope";

import {
  resolveAdminBusinessScope,
  type BusinessScopeReader,
} from "../business/resolve-business-scope";

export interface VerifiedAdminIdentityProvider {
  getAuthenticatedUserId(): Promise<string>;
}

/** Keeps AuthN (identity provider) separate from domain AuthZ (Business lookup). */
export async function resolveAdminAccess(
  identityProvider: VerifiedAdminIdentityProvider,
  businessReader: BusinessScopeReader,
): Promise<BusinessScope> {
  const authenticatedUserId =
    await identityProvider.getAuthenticatedUserId();

  return resolveAdminBusinessScope(businessReader, authenticatedUserId);
}
