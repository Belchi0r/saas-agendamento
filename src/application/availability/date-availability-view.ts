import type { DateAvailabilitySnapshot } from "./date-availability-repository";

export type DateAvailabilityExceptionView = Readonly<{
  id: string;
  localDate: string;
  mode: "CLOSED" | "REPLACE";
  privateNote: string | null;
  version: number;
  workingWindows: readonly Readonly<{
    id: string;
    startLocalTime: string;
    endLocalTime: string;
  }>[];
}>;

export type DateAvailabilityView = Readonly<{
  timezone: string | null;
  availabilityVersion: number;
  exceptions: readonly DateAvailabilityExceptionView[];
}>;

/** Authenticated DTO omits BusinessScope and persistence timestamps. */
export function toDateAvailabilityView(
  snapshot: DateAvailabilitySnapshot,
): DateAvailabilityView {
  return {
    timezone: snapshot.timezone,
    availabilityVersion: snapshot.availabilityVersion,
    exceptions: snapshot.exceptions.map((exception) => ({
      id: exception.id,
      localDate: exception.localDate,
      mode: exception.mode,
      privateNote: exception.privateNote,
      version: exception.version,
      workingWindows: exception.workingWindows.map((window) => ({
        id: window.id,
        startLocalTime: window.startLocalTime,
        endLocalTime: window.endLocalTime,
      })),
    })),
  };
}
