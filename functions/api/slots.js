import { BUSINESS_CONFIG, localToUtcDate, nowInBusinessTz } from "../_lib/config.js";
import { getBusyPeriods, overlapsAny } from "../_lib/calendar.js";

/**
 * GET /api/slots?date=YYYY-MM-DD&duration=45
 *
 * Returns a JSON array of available start times as "HH:MM" strings,
 * filtered by business hours, existing calendar events, service duration,
 * and (for today) the current time.
 */
export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const dateStr = url.searchParams.get("date");
    const durationMins = Number(url.searchParams.get("duration") || 30);

    if (!isValidDate(dateStr)) {
      return jsonError("Missing or invalid 'date' query parameter (expected YYYY-MM-DD).", 400);
    }
    if (!Number.isFinite(durationMins) || durationMins <= 0 || durationMins > 8 * 60) {
      return jsonError("Invalid 'duration' query parameter.", 400);
    }

    // Window we ask Google Calendar about: the full business day, local time.
    const dayStartUtc = localToUtcDate(dateStr, `${pad(BUSINESS_CONFIG.openHour)}:00`);
    const dayEndUtc = localToUtcDate(dateStr, `${pad(BUSINESS_CONFIG.closeHour)}:00`);

    const busyPeriods = await getBusyPeriods(env, dayStartUtc, dayEndUtc);

    const candidateTimes = buildCandidateTimes(BUSINESS_CONFIG.openHour, BUSINESS_CONFIG.closeHour, BUSINESS_CONFIG.slotIntervalMinutes);
    const nowLocal = nowInBusinessTz();
    const isToday = dateStr === toLocalIsoDate(nowLocal);

    const available = candidateTimes.filter((hhmm) => {
      const slotStartUtc = localToUtcDate(dateStr, hhmm);
      const slotEndUtc = new Date(slotStartUtc.getTime() + durationMins * 60000);

      // Slot must finish by closing time.
      if (slotEndUtc > dayEndUtc) return false;

      // Skip past times on the current day.
      if (isToday) {
        const [h, m] = hhmm.split(":").map(Number);
        const nowH = nowLocal.getUTCHours();
        const nowM = nowLocal.getUTCMinutes();
        if (h < nowH || (h === nowH && m <= nowM)) return false;
      }

      // Skip anything that overlaps an existing calendar event.
      if (overlapsAny(slotStartUtc, slotEndUtc, busyPeriods)) return false;

      return true;
    });

    return new Response(JSON.stringify(available), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("GET /api/slots error:", err);
    return jsonError("Could not load availability right now. Please try again shortly.", 502);
  }
}

function buildCandidateTimes(openHour, closeHour, stepMinutes) {
  const times = [];
  for (let mins = openHour * 60; mins < closeHour * 60; mins += stepMinutes) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    times.push(`${pad(h)}:${pad(m)}`);
  }
  return times;
}

function isValidDate(str) {
  return typeof str === "string" && /^\d{4}-\d{2}-\d{2}$/.test(str) && !Number.isNaN(Date.parse(str));
}

function toLocalIsoDate(d) {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
