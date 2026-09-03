import { getGoogleAccessToken } from "./google.js";
import { BUSINESS_CONFIG } from "./config.js";

const CALENDAR_SCOPES = ["https://www.googleapis.com/auth/calendar"];

/**
 * Returns an array of { start, end } busy periods (as Date objects) that
 * overlap the given UTC window, for the configured calendar.
 */
export async function getBusyPeriods(env, windowStartUtc, windowEndUtc) {
  const token = await getGoogleAccessToken(env, CALENDAR_SCOPES);

  const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin: windowStartUtc.toISOString(),
      timeMax: windowEndUtc.toISOString(),
      items: [{ id: BUSINESS_CONFIG.calendarId }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar freeBusy lookup failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  const calendarEntry = data.calendars?.[BUSINESS_CONFIG.calendarId];
  const busy = calendarEntry?.busy || [];

  return busy.map((b) => ({ start: new Date(b.start), end: new Date(b.end) }));
}

/** True if [start, end) overlaps any of the given busy periods. */
export function overlapsAny(start, end, busyPeriods) {
  return busyPeriods.some((b) => start < b.end && end > b.start);
}

/** Creates a calendar event and returns its Google event ID. */
export async function createCalendarEvent(env, { summary, description, startUtc, endUtc, attendeeEmail }) {
  const token = await getGoogleAccessToken(env, CALENDAR_SCOPES);

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(BUSINESS_CONFIG.calendarId)}/events`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary,
        description,
        start: { dateTime: startUtc.toISOString() },
        end: { dateTime: endUtc.toISOString() },
        // Service accounts can't invite attendees without Domain-Wide
        // Delegation, so we leave this out by default. Uncomment if the
        // service account has delegation configured:
        // attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Calendar event creation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.id;
}
