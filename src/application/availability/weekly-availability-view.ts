import type {
  WeeklyBreak,
  WeeklyWorkingWindow,
} from "@/domain/availability/weekly-availability";

import type { WeeklyAvailabilitySnapshot } from "./weekly-availability-repository";

export type WeeklyIntervalView = Readonly<{
  id: string;
  weekday: number;
  startLocalTime: string;
  endLocalTime: string;
}>;

export type WeeklyAvailabilityView = Readonly<{
  timezone: string | null;
  availabilityVersion: number;
  futureConfirmedAppointmentsOutsideAvailability: number;
  workingWindows: readonly WeeklyIntervalView[];
  breaks: readonly WeeklyIntervalView[];
}>;

function toIntervalView(
  interval: WeeklyWorkingWindow | WeeklyBreak,
): WeeklyIntervalView {
  return {
    id: interval.id,
    weekday: interval.weekday,
    startLocalTime: interval.startLocalTime,
    endLocalTime: interval.endLocalTime,
  };
}

/** Browser DTO intentionally omits BusinessScope and persistence timestamps. */
export function toWeeklyAvailabilityView(
  snapshot: WeeklyAvailabilitySnapshot,
): WeeklyAvailabilityView {
  return {
    timezone: snapshot.timezone,
    availabilityVersion: snapshot.availabilityVersion,
    futureConfirmedAppointmentsOutsideAvailability:
      snapshot.futureConfirmedAppointmentsOutsideAvailability,
    workingWindows: snapshot.workingWindows.map(toIntervalView),
    breaks: snapshot.breaks.map(toIntervalView),
  };
}
