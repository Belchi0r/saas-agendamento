export type ConfirmationTimeView = Readonly<{
  timezoneSnapshot: string;
  localDateSnapshot: string;
  localTimeSnapshot: string;
  utcOffsetMinutesSnapshot: number;
}>;

export function confirmationTimeLabel(snapshot: ConfirmationTimeView) {
  const sign = snapshot.utcOffsetMinutesSnapshot < 0 ? "-" : "+";
  const absolute = Math.abs(snapshot.utcOffsetMinutesSnapshot);
  const hours = Math.floor(absolute / 60).toString().padStart(2, "0");
  const minutes = (absolute % 60).toString().padStart(2, "0");
  return `${snapshot.localDateSnapshot} ${snapshot.localTimeSnapshot} ${sign}${hours}:${minutes} [${snapshot.timezoneSnapshot}]`;
}
