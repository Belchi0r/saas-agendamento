import "server-only";

import { resolveAdminAccess } from "@/application/admin/resolve-admin-access";
import {
  resolvePublicBusinessScope,
  type BusinessScopeReader,
} from "@/application/business/resolve-business-scope";
import type { BusinessScope } from "@/domain/business/business-scope";
import { getVerifiedAdminAuthUserId } from "@/infrastructure/auth/verified-admin-identity";
import {
  PostgresBusinessRepository,
  type BusinessPresentation,
} from "@/persistence/business/business-repository";
import { getDatabase } from "@/persistence/database/client";
import { PostgresServiceRepository } from "@/persistence/services/postgres-service-repository";

export type ServiceApplicationContext = Readonly<{
  scope: BusinessScope;
  business: BusinessPresentation;
  services: PostgresServiceRepository;
}>;

async function createContext(
  scope: BusinessScope,
  businessRepository: PostgresBusinessRepository,
): Promise<ServiceApplicationContext> {
  return {
    scope,
    business: await businessRepository.getPresentation(scope),
    services: new PostgresServiceRepository(getDatabase(), scope),
  };
}

export async function createAdminServiceContext(): Promise<ServiceApplicationContext> {
  const database = getDatabase();
  const businessRepository = new PostgresBusinessRepository(database);
  const scope = await resolveAdminAccess(
    { getAuthenticatedUserId: getVerifiedAdminAuthUserId },
    businessRepository,
  );

  return createContext(scope, businessRepository);
}

export async function createPublicServiceContext(): Promise<ServiceApplicationContext> {
  const database = getDatabase();
  const businessRepository = new PostgresBusinessRepository(database);
  const scope = await resolvePublicBusinessScope(businessRepository);

  return createContext(scope, businessRepository);
}

export async function authorizeAuthenticatedUser(
  authenticatedUserId: string,
  businessReader: BusinessScopeReader = new PostgresBusinessRepository(getDatabase()),
): Promise<BusinessScope> {
  return resolveAdminAccess(
    {
      getAuthenticatedUserId: async () => authenticatedUserId,
    },
    businessReader,
  );
}
