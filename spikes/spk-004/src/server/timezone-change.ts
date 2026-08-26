import { Temporal } from "@js-temporal/polyfill";

import { resolveLocalDateTime, validateIanaTimeZone } from "./time-strategy.js";

export type BusinessTimeConfiguration = Readonly<{
  timezone: string;
  availabilityVersion: number;
}>;

export type AppointmentTimeRecord = Readonly<{
  id: string;
  status: "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  scheduledStartAtUtc: string;
  timezoneSnapshot: string;
  localDateSnapshot: string;
  localTimeSnapshot: string;
  utcOffsetMinutesSnapshot: number;
}>;

export type TimezoneChangeResult =
  | Readonly<{
      outcome: "BLOCKED_FUTURE_CONFIRMED";
      conflictingAppointmentIds: readonly string[];
      business: BusinessTimeConfiguration;
      appointments: readonly AppointmentTimeRecord[];
    }>
  | Readonly<{
      outcome: "CHANGED";
      conflictingAppointmentIds: readonly [];
      business: BusinessTimeConfiguration;
      appointments: readonly AppointmentTimeRecord[];
      recurringRulesReinterpreted: true;
    }>;

export function changeBusinessTimezone(
  business: BusinessTimeConfiguration,
  appointments: readonly AppointmentTimeRecord[],
  requestedTimezone: string,
  nowUtc: string,
): TimezoneChangeResult {
  const timezone = validateIanaTimeZone(requestedTimezone);
  const now = Temporal.Instant.from(nowUtc);
  const conflicts = appointments
    .filter((appointment) =>
      appointment.status === "CONFIRMED"
      && Temporal.Instant.compare(
        Temporal.Instant.from(appointment.scheduledStartAtUtc),
        now,
      ) > 0)
    .map((appointment) => appointment.id)
    .sort();

  if (conflicts.length > 0) {
    return Object.freeze({
      outcome: "BLOCKED_FUTURE_CONFIRMED",
      conflictingAppointmentIds: Object.freeze(conflicts),
      business,
      appointments,
    });
  }

  return Object.freeze({
    outcome: "CHANGED",
    conflictingAppointmentIds: Object.freeze([] as const),
    business: Object.freeze({
      timezone,
      availabilityVersion: business.availabilityVersion + 1,
    }),
    appointments,
    recurringRulesReinterpreted: true,
  });
}

export function interpretRecurringRule(
  localDate: string,
  localTime: string,
  businessTimezone: string,
) {
  return resolveLocalDateTime(localDate, localTime, businessTimezone);
}
