import "server-only";

import { resolveOperationalBusinessScope, resolvePublicBusinessScope } from "@/application/business/resolve-business-scope";
import { getDatabase, getDatabasePool } from "@/persistence/database/client";
import { PostgresBusinessRepository } from "@/persistence/business/business-repository";
import { PostgresPublicBookingRepository } from "@/persistence/booking/postgres-public-booking-repository";

export async function createPublicBookingContext() {
  const business = new PostgresBusinessRepository(getDatabase());
  const scope = await resolvePublicBusinessScope(business);
  return new PostgresPublicBookingRepository(getDatabasePool(), scope);
}

export async function createManagementBookingContext() {
  const business = new PostgresBusinessRepository(getDatabase());
  const scope = await resolveOperationalBusinessScope(business);
  return new PostgresPublicBookingRepository(getDatabasePool(), scope);
}
