import {
  boolean,
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgSchema,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/** Domain tables will be added by feature migrations in this private schema. */
export const appPrivate = pgSchema("app_private");

export const businesses = appPrivate.table(
  "business",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    publicName: text("public_name"),
    publicDescription: text("public_description"),
    publicContact: text("public_contact"),
    publicLocation: text("public_location"),
    timezone: text("timezone"),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    adminAuthUserId: uuid("admin_auth_user_id").notNull(),
    publicBookingEnabled: boolean("public_booking_enabled")
      .notNull()
      .default(false),
    availabilityVersion: integer("availability_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("business_admin_auth_user_id_unique").on(table.adminAuthUserId),
    unique("business_scope_currency_unique").on(table.id, table.currencyCode),
    check(
      "business_public_name_not_blank",
      sql`${table.publicName} is null or btrim(${table.publicName}) <> ''`,
    ),
    check(
      "business_timezone_not_blank",
      sql`${table.timezone} is null or btrim(${table.timezone}) <> ''`,
    ),
    check(
      "business_currency_code_iso_shape",
      sql`${table.currencyCode} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "business_availability_version_positive",
      sql`${table.availabilityVersion} > 0`,
    ),
  ],
);

export const services = appPrivate.table(
  "service",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    description: text("description"),
    priceMinor: integer("price_minor").notNull(),
    currencyCode: char("currency_code", { length: 3 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    active: boolean("active").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "service_business_currency_fk",
      columns: [table.businessId, table.currencyCode],
      foreignColumns: [businesses.id, businesses.currencyCode],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    unique("service_business_scope_unique").on(table.businessId, table.id),
    index("service_business_active_name_idx").on(
      table.businessId,
      table.active,
      table.name,
    ),
    check("service_name_not_blank", sql`btrim(${table.name}) <> ''`),
    check("service_price_minor_nonnegative", sql`${table.priceMinor} >= 0`),
    check(
      "service_duration_minutes_positive",
      sql`${table.durationMinutes} > 0`,
    ),
    check("service_version_positive", sql`${table.version} > 0`),
  ],
);

export const weeklyWorkingWindows = appPrivate.table(
  "weekly_working_window",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    weekday: smallint("weekday").notNull(),
    startLocalTime: time("start_local_time", { precision: 0 }).notNull(),
    endLocalTime: time("end_local_time", { precision: 0 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("weekly_working_window_business_scope_unique").on(
      table.businessId,
      table.id,
    ),
    index("weekly_working_window_business_weekday_start_idx").on(
      table.businessId,
      table.weekday,
      table.startLocalTime,
    ),
    check(
      "weekly_working_window_weekday_iso",
      sql`${table.weekday} between 1 and 7`,
    ),
    check(
      "weekly_working_window_ordered",
      sql`${table.startLocalTime} < ${table.endLocalTime}`,
    ),
  ],
);

export const weeklyBreaks = appPrivate.table(
  "weekly_break",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    weekday: smallint("weekday").notNull(),
    startLocalTime: time("start_local_time", { precision: 0 }).notNull(),
    endLocalTime: time("end_local_time", { precision: 0 }).notNull(),
  },
  (table) => [
    unique("weekly_break_business_scope_unique").on(table.businessId, table.id),
    index("weekly_break_business_weekday_start_idx").on(
      table.businessId,
      table.weekday,
      table.startLocalTime,
    ),
    check("weekly_break_weekday_iso", sql`${table.weekday} between 1 and 7`),
    check(
      "weekly_break_ordered",
      sql`${table.startLocalTime} < ${table.endLocalTime}`,
    ),
  ],
);

export const dateAvailabilityExceptions = appPrivate.table(
  "date_availability_exception",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    localDate: date("local_date", { mode: "string" }).notNull(),
    mode: text("mode").$type<"CLOSED" | "REPLACE">().notNull(),
    privateNote: text("private_note"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("date_availability_exception_business_scope_unique").on(
      table.businessId,
      table.id,
    ),
    unique("date_availability_exception_business_date_unique").on(
      table.businessId,
      table.localDate,
    ),
    index("date_availability_exception_business_date_idx").on(
      table.businessId,
      table.localDate,
      table.id,
    ),
    check(
      "date_availability_exception_mode_valid",
      sql`${table.mode} in ('CLOSED', 'REPLACE')`,
    ),
    check(
      "date_availability_exception_private_note_not_blank",
      sql`${table.privateNote} is null or btrim(${table.privateNote}) <> ''`,
    ),
    check(
      "date_availability_exception_version_positive",
      sql`${table.version} > 0`,
    ),
  ],
);

export const exceptionWorkingWindows = appPrivate.table(
  "exception_working_window",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dateExceptionId: uuid("date_exception_id")
      .notNull()
      .references(() => dateAvailabilityExceptions.id, {
        onDelete: "cascade",
      }),
    startLocalTime: time("start_local_time", { precision: 0 }).notNull(),
    endLocalTime: time("end_local_time", { precision: 0 }).notNull(),
  },
  (table) => [
    index("exception_working_window_exception_start_idx").on(
      table.dateExceptionId,
      table.startLocalTime,
      table.id,
    ),
    check(
      "exception_working_window_ordered",
      sql`${table.startLocalTime} < ${table.endLocalTime}`,
    ),
  ],
);
