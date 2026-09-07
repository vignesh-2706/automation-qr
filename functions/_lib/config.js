/**
 * Business rules in one place, so slots.js (availability) and book.js
 * (booking) can never drift out of sync with each other.
 *
 * Edit these constants to match the real business. Everything else in
 * the Functions is generic scheduling logic.
 */
export const BUSINESS_CONFIG = {
  // Operational hours, in the business's *local* time, 24h format.
  openHour: 9, // 9:00 AM
  closeHour: 18, // 6:00 PM

  // UTC offset of the business's local timezone, e.g. India = "+05:30".
  // Cloudflare Workers always run in UTC, so every date/time calculation
  // has to account for this manually.
  utcOffset: "+05:30",

  // Granularity of bookable start times, in minutes.
  slotIntervalMinutes: 30,

  // Google Calendar to check/write. "primary" is the service account's
  // own calendar; more commonly you'll share a specific calendar with the
  // service account and put its ID here (looks like an email address).
  calendarId: "025405bf2501cf4392cac192baf536ea761b953befa5df8f24294bf6d59246ee@group.calendar.google.com",

  // Google Sheet used as the CRM log.
  sheetRange: "Bookings!A:F",
};

/** Minutes offset implied by utcOffset, e.g. "+05:30" -> 330. */
export function offsetMinutes() {
  const sign = BUSINESS_CONFIG.utcOffset.startsWith("-") ? -1 : 1;
  const [h, m] = BUSINESS_CONFIG.utcOffset.slice(1).split(":").map(Number);
  return sign * (h * 60 + m);
}

/** Build a UTC Date for a given local YYYY-MM-DD + HH:MM in the business timezone. */
export function localToUtcDate(dateStr, hhmm) {
  const [year, month, day] = dateStr.split("-").map(Number);
  const [hour, minute] = hhmm.split(":").map(Number);
  // Treat the components as UTC first, then subtract the local offset to
  // land on the correct real UTC instant.
  const utcMillis = Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes() * 60000;
  return new Date(utcMillis);
}

/** Current time in the business's local timezone, as a plain Date-like offset. */
export function nowInBusinessTz() {
  return new Date(Date.now() + offsetMinutes() * 60000);
}
