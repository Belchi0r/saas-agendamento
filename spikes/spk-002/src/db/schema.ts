import { sql } from "drizzle-orm";
import {
  check,
  customType,
  index,
  pgSchema,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

const tstzrange = customType<{ data: string }>({
  dataType() {
    return "tstzrange";
  },
});

export const appPrivate = pgSchema("app_private");

export const business = appPrivate.table(
  "business",
  {
    id: uuid("id").primaryKey(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [index("business_name_idx").on(table.name)],
);

export const transactionProbe = appPrivate.table("transaction_probe", {
  id: uuid("id").primaryKey(),
  note: text("note").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const scheduleOccupancy = appPrivate.table(
  "schedule_occupancy",
  {
    id: uuid("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    occupiedPeriod: tstzrange("occupied_period").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    check(
      "schedule_occupancy_period_is_half_open",
      sql`not isempty(${table.occupiedPeriod}) and lower_inc(${table.occupiedPeriod}) and not upper_inc(${table.occupiedPeriod}) and lower(${table.occupiedPeriod}) < upper(${table.occupiedPeriod})`,
    ),
    index("schedule_occupancy_business_idx").on(table.businessId),
  ],
);

export const applicationTables = [
  business,
  transactionProbe,
  scheduleOccupancy,
] as const;
