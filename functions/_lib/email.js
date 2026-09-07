/**
 * Transactional email via Resend (https://resend.com). A free-tier account
 * gives 100 emails/day and 3,000/month, which is plenty for a micro-business.
 *
 * Swap this file out for EmailJS or another provider if preferred — the
 * rest of the app only calls sendBookingEmails(), so no other file changes.
 */
export async function sendBookingEmails(env, { businessName, ownerEmail, customerEmail, customerName, serviceName, dateLabel, timeLabel }) {
  const apiKey = env.RESEND_API_KEY;
  const fromAddress = env.RESEND_FROM_EMAIL;

  if (!apiKey || !fromAddress) {
    // Don't throw — a missing email config shouldn't fail an otherwise
    // successful booking. Log it so it's visible in `wrangler pages deployment tail`.
    console.warn("Email skipped: RESEND_API_KEY or RESEND_FROM_EMAIL not set.");
    return { sent: false };
  }

  const messages = [
    {
      from: fromAddress,
      to: customerEmail,
      subject: `You're booked: ${serviceName} at ${businessName}`,
      html: `
        <p>Hi ${escapeHtml(customerName)},</p>
        <p>Your appointment is confirmed:</p>
        <p><strong>${escapeHtml(serviceName)}</strong><br/>
        ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</p>
        <p>See you then!<br/>${escapeHtml(businessName)}</p>
      `,
    },
  ];

  if (ownerEmail) {
    messages.push({
      from: fromAddress,
      to: ownerEmail,
      subject: `New booking: ${customerName} — ${serviceName}`,
      html: `
        <p>New appointment booked:</p>
        <ul>
          <li><strong>Client:</strong> ${escapeHtml(customerName)} (${escapeHtml(customerEmail)})</li>
          <li><strong>Service:</strong> ${escapeHtml(serviceName)}</li>
          <li><strong>When:</strong> ${escapeHtml(dateLabel)} at ${escapeHtml(timeLabel)}</li>
        </ul>
      `,
    });
  }

  const results = await Promise.allSettled(
    messages.map((msg) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(msg),
      })
    )
  );

  const failures = results.filter((r) => r.status === "rejected" || (r.value && !r.value.ok));
  if (failures.length) {
    console.warn(`${failures.length} of ${messages.length} booking emails failed to send.`);
  }

  return { sent: failures.length < messages.length };
}

function escapeHtml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
