import { BUSINESS_CONFIG, localToUtcDate } from "../_lib/config.js";
import { getBusyPeriods, overlapsAny, createCalendarEvent } from "../_lib/calendar.js";
import { appendBookingRow } from "../_lib/sheets.js";
import { sendBookingEmails } from "../_lib/email.js";

/**
 * POST /api/book
 * Body: { name, phone, email, serviceId, serviceName, durationMins, date, time }
 */
export async function onRequestPost({ request, env }) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid JSON body.", 400);
  }

  const validationError = validatePayload(payload);
  if (validationError) return jsonError(validationError, 400);

  const { name, phone, email, serviceName, durationMins, date, time } = payload;

  const slotStartUtc = localToUtcDate(date, time);
  const slotEndUtc = new Date(slotStartUtc.getTime() + durationMins * 60000);

  try {
    // ---- 1. Re-verify the slot is still open. ----
    // This narrows the race window right before we write, but Google
    // Calendar has no true "lock" primitive — two requests landing in the
    // same few hundred milliseconds could still both pass this check. For
    // a single-provider micro-business this residual risk is very small;
    // if it needs to be airtight, add a short-lived Cloudflare KV lock
    // keyed by date+time around this section.
    const busyPeriods = await getBusyPeriods(env, slotStartUtc, slotEndUtc);
    if (overlapsAny(slotStartUtc, slotEndUtc, busyPeriods)) {
      return jsonError("That slot was just booked by someone else.", 409);
    }

    // ---- 2. Create the calendar event. ----
    const eventId = await createCalendarEvent(env, {
      summary: `[Booking] ${name} - ${serviceName}`,
      description: `Phone: ${phone}\nEmail: ${email}`,
      startUtc: slotStartUtc,
      endUtc: slotEndUtc,
      attendeeEmail: email,
    });

    // ---- 3. Log to the Sheets CRM. ----
    // Failures here are logged but don't block the booking — the calendar
    // event (the source of truth for availability) already succeeded.
    try {
      await appendBookingRow(env, [
        new Date().toISOString(),
        name,
        phone,
        email,
        serviceName,
        `${date} ${time}`,
      ]);
    } catch (err) {
      console.error("Sheets logging failed (booking still succeeded):", err);
    }

    // ---- 4. Send confirmation emails. ----
    const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString("en-IN", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    try {
      await sendBookingEmails(env, {
        businessName: env.BUSINESS_NAME || "the business",
        ownerEmail: env.OWNER_EMAIL,
        customerEmail: email,
        customerName: name,
        serviceName,
        dateLabel,
        timeLabel: time,
      });
    } catch (err) {
      console.error("Email dispatch failed (booking still succeeded):", err);
    }

    return new Response(JSON.stringify({ success: true, eventId }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("POST /api/book error:", err);
    return jsonError("Could not complete the booking right now. Please try again shortly.", 502);
  }
}

function validatePayload(p) {
  if (!p || typeof p !== "object") return "Missing request body.";
  if (!p.name || typeof p.name !== "string") return "Missing client name.";
  if (!p.phone || typeof p.phone !== "string") return "Missing phone number.";
  if (!p.email || typeof p.email !== "string" || !/^\S+@\S+\.\S+$/.test(p.email)) return "Missing or invalid email.";
  if (!p.serviceName || typeof p.serviceName !== "string") return "Missing service name.";
  if (!Number.isFinite(p.durationMins) || p.durationMins <= 0) return "Missing or invalid service duration.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date || "")) return "Missing or invalid date.";
  if (!/^\d{2}:\d{2}$/.test(p.time || "")) return "Missing or invalid time.";
  return null;
}

function jsonError(message, status) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
