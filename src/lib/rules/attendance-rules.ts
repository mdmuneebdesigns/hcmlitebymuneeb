// Client-safe pure helpers for attendance rules. No side effects — used by
// both server functions (authoritative) and unit tests.

export const PKT_TIME_ZONE = "Asia/Karachi";

export interface PktStamp {
  /** Calendar date in PKT, yyyy-mm-dd */
  date: string;
  /** HH:MM in PKT (24h) */
  time: string;
  /** Minutes since PKT midnight */
  minutes: number;
  /** Long weekday name, e.g. "Sunday" */
  weekday: string;
}

const dateFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: PKT_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const timeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: PKT_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const weekdayFmt = new Intl.DateTimeFormat("en-US", { timeZone: PKT_TIME_ZONE, weekday: "long" });

/** Stamp a server time into Pakistan Standard Time parts. */
export function pktStamp(d: Date): PktStamp {
  const date = dateFmt.format(d);
  const time = timeFmt.format(d);
  const [h, m] = time.split(":").map(Number);
  return {
    date,
    time,
    minutes: (h ?? 0) * 60 + (m ?? 0),
    weekday: weekdayFmt.format(d),
  };
}

/** "09:15" -> 555 */
export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function isWeekend(weekday: string, weekendDays: string[]): boolean {
  return weekendDays.includes(weekday);
}

/**
 * Late once past office start + grace. Brief rule: late after 09:15 for a
 * 09:00 start with 15 minutes grace — i.e. strictly later than start+grace.
 */
export function checkInStatus(
  checkIn: PktStamp,
  officeStart: string,
  graceMinutes: number,
): "late" | "present" {
  return checkIn.minutes > hhmmToMinutes(officeStart) + graceMinutes ? "late" : "present";
}

/**
 * Final status once checkout is stamped: a short day becomes half_day,
 * otherwise the check-in status (present/late) stands.
 */
export function finalStatusAfterCheckout(
  workedHours: number,
  halfDayHours: number,
  checkInStatusValue: string,
): string {
  return workedHours < halfDayHours ? "half_day" : checkInStatusValue;
}

/** Great-circle distance between two lat/lng points, in meters. */
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Display status for a day board cell: missing_checkout when the employee
 * checked in but never out, absent when there is no record at all.
 */
export function dayBoardStatus(record: { status: string; check_out: string | null } | null): string {
  if (!record) return "absent";
  return record.check_out ? record.status : "missing_checkout";
}
