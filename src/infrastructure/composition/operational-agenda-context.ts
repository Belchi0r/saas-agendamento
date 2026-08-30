import "server-only";

import { resolveAdminAccess } from "@/application/admin/resolve-admin-access";
import { getVerifiedAdminAuthUserId } from "@/infrastructure/auth/verified-admin-identity";
import { PostgresOperationalAgendaRepository } from "@/persistence/agenda/postgres-operational-agenda-repository";
import { PostgresBusinessRepository } from "@/persistence/business/business-repository";
import { getDatabase, getDatabasePool } from "@/persistence/database/client";
import { PostgresPublicBookingRepository } from "@/persistence/booking/postgres-public-booking-repository";

export async function createOperationalAgendaContext() {
  const businessRepository = new PostgresBusinessRepository(getDatabase());
  const scope = await resolveAdminAccess(
    { getAuthenticatedUserId: getVerifiedAdminAuthUserId },
    businessRepository,
  );
  return {
    scope,
    business: await businessRepository.getPresentation(scope),
    agenda: new PostgresOperationalAgendaRepository(getDatabasePool(), scope),
    booking: new PostgresPublicBookingRepository(getDatabasePool(), scope),
  };
}
