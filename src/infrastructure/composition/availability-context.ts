import "server-only";

import { resolveAdminAccess } from "@/application/admin/resolve-admin-access";
import type { BusinessScope } from "@/domain/business/business-scope";
import { getVerifiedAdminAuthUserId } from "@/infrastructure/auth/verified-admin-identity";
import { PostgresBlockedPeriodRepository } from "@/persistence/availability/postgres-blocked-period-repository";
import { PostgresWeeklyAvailabilityRepository } from "@/persistence/availability/postgres-weekly-availability-repository";
import { PostgresDateAvailabilityRepository } from "@/persistence/availability/postgres-date-availability-repository";
import {
  PostgresBusinessRepository,
  type BusinessPresentation,
} from "@/persistence/business/business-repository";
import { getDatabase } from "@/persistence/database/client";

export type AvailabilityApplicationContext = Readonly<{
  scope: BusinessScope;
  business: BusinessPresentation;
  availability: PostgresWeeklyAvailabilityRepository;
  dateAvailability: PostgresDateAvailabilityRepository;
  blockedPeriods: PostgresBlockedPeriodRepository;
}>;

export async function createAdminAvailabilityContext(): Promise<AvailabilityApplicationContext> {
  const database = getDatabase();
  const businessRepository = new PostgresBusinessRepository(database);
  const scope = await resolveAdminAccess(
    { getAuthenticatedUserId: getVerifiedAdminAuthUserId },
    businessRepository,
  );

  return {
    scope,
    business: await businessRepository.getPresentation(scope),
    availability: new PostgresWeeklyAvailabilityRepository(database, scope),
    dateAvailability: new PostgresDateAvailabilityRepository(database, scope),
    blockedPeriods: new PostgresBlockedPeriodRepository(database, scope),
  };
}
