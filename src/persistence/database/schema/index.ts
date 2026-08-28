import {
  boolean,
  char,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgSchema,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
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

export const businessSchedulingPolicies = appPrivate.table(
  "business_scheduling_policy",
  {
    businessId: uuid("business_id").primaryKey().references(() => businesses.id, { onDelete: "restrict" }),
    minimumLeadMinutes: integer("minimum_lead_minutes").notNull(),
    bookingHorizonDays: integer("booking_horizon_days").notNull(),
    slotStepMinutes: integer("slot_step_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes"),
    cancellationEnabled: boolean("cancellation_enabled").notNull(),
    cancellationNoticeMinutes: integer("cancellation_notice_minutes"),
    configurationConfirmedAt: timestamp("configuration_confirmed_at", { withTimezone: true, mode: "date" }).notNull(),
    version: integer("version").notNull().default(1),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    check("business_scheduling_policy_slot_step_approved", sql`${table.slotStepMinutes} = 15`),
    check("business_scheduling_policy_minimum_lead_nonnegative", sql`${table.minimumLeadMinutes} >= 0`),
    check("business_scheduling_policy_horizon_positive", sql`${table.bookingHorizonDays} > 0`),
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

export const customers = appPrivate.table(
  "customer",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
    displayName: text("display_name").notNull(),
    whatsappE164: text("whatsapp_e164").notNull(),
    anonymizedAt: timestamp("anonymized_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    unique("customer_business_scope_unique").on(table.businessId, table.id),
    index("customer_business_whatsapp_idx").on(table.businessId, table.whatsappE164),
  ],
);

export const appointments = appPrivate.table(
  "appointment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
    serviceId: uuid("service_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    status: text("status").$type<"CONFIRMED" | "COMPLETED" | "CANCELLED" | "NO_SHOW">().notNull(),
    origin: text("origin").$type<"PUBLIC" | "ADMIN">().notNull(),
    version: integer("version").notNull().default(1),
    serviceNameSnapshot: text("service_name_snapshot").notNull(),
    serviceDescriptionSnapshot: text("service_description_snapshot"),
    serviceDurationMinutesSnapshot: integer("service_duration_minutes_snapshot").notNull(),
    servicePriceMinorSnapshot: integer("service_price_minor_snapshot").notNull(),
    currencyCodeSnapshot: char("currency_code_snapshot", { length: 3 }).notNull(),
    customerNameSnapshot: text("customer_name_snapshot").notNull(),
    customerWhatsappSnapshot: text("customer_whatsapp_snapshot").notNull(),
    scheduledStartAt: timestamp("scheduled_start_at", { withTimezone: true, mode: "date" }).notNull(),
    scheduledEndAt: timestamp("scheduled_end_at", { withTimezone: true, mode: "date" }).notNull(),
    occupiedStartAt: timestamp("occupied_start_at", { withTimezone: true, mode: "date" }).notNull(),
    occupiedEndAt: timestamp("occupied_end_at", { withTimezone: true, mode: "date" }).notNull(),
    timezoneSnapshot: text("timezone_snapshot").notNull(),
    localDateSnapshot: date("local_date_snapshot", { mode: "string" }).notNull(),
    localTimeSnapshot: time("local_time_snapshot", { precision: 0 }).notNull(),
    utcOffsetMinutesSnapshot: integer("utc_offset_minutes_snapshot").notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true, mode: "date" }),
    cancellationActor: text("cancellation_actor").$type<"CUSTOMER" | "ADMIN">(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({ name: "appointment_service_fk", columns: [table.businessId, table.serviceId], foreignColumns: [services.businessId, services.id] }).onDelete("restrict"),
    foreignKey({ name: "appointment_customer_fk", columns: [table.businessId, table.customerId], foreignColumns: [customers.businessId, customers.id] }).onDelete("restrict"),
    unique("appointment_business_scope_unique").on(table.businessId, table.id),
    index("appointment_business_start_idx").on(table.businessId, table.scheduledStartAt),
    index("appointment_business_customer_start_idx").on(table.businessId, table.customerId, table.scheduledStartAt),
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

export const blockedPeriods = appPrivate.table(
  "blocked_period",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    startAt: timestamp("start_at", { withTimezone: true, mode: "date" }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true, mode: "date" }).notNull(),
    localDateFrom: date("local_date_from", { mode: "string" }),
    localDateTo: date("local_date_to", { mode: "string" }),
    timezoneSnapshot: text("timezone_snapshot").notNull(),
    privateReason: text("private_reason"),
    active: boolean("active").notNull().default(true),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("blocked_period_business_scope_unique").on(
      table.businessId,
      table.id,
    ),
    index("blocked_period_business_start_end_idx")
      .on(table.businessId, table.startAt, table.endAt)
      .where(sql`${table.active}`),
    check("blocked_period_ordered", sql`${table.startAt} < ${table.endAt}`),
    check(
      "blocked_period_date_snapshots_paired",
      sql`(${table.localDateFrom} is null and ${table.localDateTo} is null)
        or (${table.localDateFrom} is not null and ${table.localDateTo} is not null
          and ${table.localDateFrom} <= ${table.localDateTo})`,
    ),
    check(
      "blocked_period_timezone_snapshot_not_blank",
      sql`btrim(${table.timezoneSnapshot}) <> ''`,
    ),
    check(
      "blocked_period_private_reason_not_blank",
      sql`${table.privateReason} is null or btrim(${table.privateReason}) <> ''`,
    ),
    check("blocked_period_version_positive", sql`${table.version} > 0`),
  ],
);

const tstzrange = customType<{ data: string }>({
  dataType() {
    return "tstzrange";
  },
});

export const scheduleOccupancies = appPrivate.table(
  "schedule_occupancy",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "restrict" }),
    blockedPeriodId: uuid("blocked_period_id"),
    appointmentId: uuid("appointment_id"),
    occupiedPeriod: tstzrange("occupied_period").notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "schedule_occupancy_blocked_period_fk",
      columns: [table.businessId, table.blockedPeriodId],
      foreignColumns: [blockedPeriods.businessId, blockedPeriods.id],
    })
      .onUpdate("restrict")
      .onDelete("restrict"),
    foreignKey({
      name: "schedule_occupancy_appointment_fk",
      columns: [table.businessId, table.appointmentId],
      foreignColumns: [appointments.businessId, appointments.id],
    }).onDelete("restrict"),
    uniqueIndex("schedule_occupancy_blocked_period_unique").on(
      table.blockedPeriodId,
    ),
    index("schedule_occupancy_business_released_idx").on(
      table.businessId,
      table.releasedAt,
    ),
    uniqueIndex("schedule_occupancy_appointment_unique")
      .on(table.appointmentId)
      .where(sql`${table.appointmentId} is not null`),
    check("schedule_occupancy_exactly_one_owner", sql`num_nonnulls(${table.appointmentId}, ${table.blockedPeriodId}) = 1`),
  ],
);

export const appointmentEvents = appPrivate.table(
  "appointment_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
    appointmentVersion: integer("appointment_version").notNull(),
    eventType: text("event_type").notNull(),
    actorType: text("actor_type").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    fromStatus: text("from_status"), toStatus: text("to_status"),
    fromStartAt: timestamp("from_start_at", { withTimezone: true, mode: "date" }),
    toStartAt: timestamp("to_start_at", { withTimezone: true, mode: "date" }),
    fromEndAt: timestamp("from_end_at", { withTimezone: true, mode: "date" }),
    toEndAt: timestamp("to_end_at", { withTimezone: true, mode: "date" }),
    details: jsonb("details").$type<Record<string, unknown>>().notNull(),
  },
  (table) => [unique("appointment_event_appointment_version_unique").on(table.appointmentId, table.appointmentVersion)],
);

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const appointmentAccessTokens = appPrivate.table(
  "appointment_access_token",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    appointmentId: uuid("appointment_id").notNull().references(() => appointments.id, { onDelete: "restrict" }),
    tokenHash: bytea("token_hash").notNull(), tokenVersion: integer("token_version").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true, mode: "date" }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true, mode: "date" }),
    revokedAt: timestamp("revoked_at", { withTimezone: true, mode: "date" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }), rotationReason: text("rotation_reason"),
  },
  (table) => [
    unique("appointment_access_token_hash_unique").on(table.tokenHash),
    uniqueIndex("appointment_access_token_one_active_unique").on(table.appointmentId).where(sql`${table.revokedAt} is null`),
  ],
);

export const idempotencyRequests = appPrivate.table(
  "idempotency_request",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    businessId: uuid("business_id").notNull().references(() => businesses.id, { onDelete: "restrict" }),
    operation: text("operation").notNull(), keyHash: bytea("key_hash").notNull(),
    requestFingerprint: bytea("request_fingerprint").notNull(), fingerprintVersion: text("fingerprint_version").notNull(),
    status: text("status").$type<"SUCCEEDED">().notNull(), appointmentId: uuid("appointment_id"),
    responseStatus: integer("response_status").notNull(), responseEnvelope: bytea("response_envelope"),
    envelopeNonce: bytea("envelope_nonce"), envelopeAuthTag: bytea("envelope_auth_tag"),
    envelopeKeyVersion: text("envelope_key_version"),
    envelopeExpiresAt: timestamp("envelope_expires_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  },
  (table) => [
    foreignKey({ name: "idempotency_request_appointment_fk", columns: [table.businessId, table.appointmentId], foreignColumns: [appointments.businessId, appointments.id] }).onDelete("restrict"),
    unique("idempotency_request_business_operation_key_unique").on(table.businessId, table.operation, table.keyHash),
  ],
);
