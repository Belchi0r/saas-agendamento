import { sql } from "drizzle-orm";

import { scheduleOccupancy } from "./schema.js";

export type OccupancySqlInput = {
  id: string;
  businessId: string;
  startAt: string;
  endAt: string;
  releasedAt?: string;
};

/**
 * PostgreSQL-specific SQL stays localized. Drizzle's sql tag parameterizes all
 * runtime values while keeping identifiers bound to the typed schema object.
 */
export function insertOccupancySql(input: OccupancySqlInput) {
  return sql`
    insert into ${scheduleOccupancy}
      (id, business_id, occupied_period, released_at)
    values (
      ${input.id},
      ${input.businessId},
      tstzrange(${input.startAt}::timestamptz, ${input.endAt}::timestamptz, '[)'),
      ${input.releasedAt ?? null}::timestamptz
    )
  `;
}
