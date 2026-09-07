/**
 * Booking wizard — vanilla JS, no build step.
 *
 * Everything the business owner is likely to tweak lives in CONFIG below.
 * The rest of the file is state + rendering + the three fetch calls
 * (services are static, slots and booking hit the Worker functions).
 */

// ---------------------------------------------------------------------
// CONFIG — edit this block to match the business. No other file needs
// to change for a simple service-list or hours update.
// ---------------------------------------------------------------------
const CONFIG = {
  businessName: "Serene Studio",
  services: [
    { id: "deep-clean", name: "Deep Cleaning Facial", price: 1500, durationMins: 45 },
    { id: "classic-facial", name: "Classic Facial", price: 900, durationMins: 30 },
    { id: "massage-60", name: "Relaxation Massage (60 min)", price: 2200, durationMins: 60 },
    { id: "consult", name: "New Client Consultation", price: 0, durationMins: 20 },
  ],
  // How many upcoming days to show in the day picker.
  daysAhead: 7,
  currency: "₹",
};

// ---------------------------------------------------------------------
// STATE
// ---------------------------------------------------------------------
const state = {
  step: 1,
  service: null,       // selected service object
  date: null,           // 'YYYY-MM-DD'
  time: null,           // 'HH:MM'
  slotsCache: {},        // date -> array of times (avoid re-fetching)
};

// ---------------------------------------------------------------------
// DOM refs
// ---------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const els = {
  businessName: $("#business-name"),
  serviceList: $("#service-list"),
  selectedServiceLabel: $("#selected-service-label"),
  dayPicker: $("#day-picker"),
  slotsGrid: $("#slots-grid"),
  slotsHeading: $("#slots-heading"),
  bookingSummary: $("#booking-summary"),
  form: $("#details-form"),
  formError: $("#form-error"),
  submitBtn: $("#submit-btn"),
  successSummary: $("#success-summary"),
  icsLink: $("#ics-link"),
  bookAnother: $("#book-another"),
};

els.businessName.textContent = CONFIG.businessName;

// ---------------------------------------------------------------------
// Step navigation
// ---------------------------------------------------------------------
function goToStep(n) {
  document.querySelectorAll(".wizard-step").forEach((el) => el.classList.add("hidden"));
  $(`#step-${n}`).classList.remove("hidden");
  state.step = n;

  document.querySelectorAll(".progress-seg").forEach((seg) => {
    const segStep = Number(seg.dataset.step);
    seg.classList.toggle("is-done", segStep < n);
    seg.classList.toggle("is-active", segStep === n);
  });

  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

document.querySelectorAll("[data-back]").forEach((btn) => {
  btn.addEventListener("click", () => goToStep(Number(btn.dataset.back)));
});

$("#book-another").addEventListener("click", () => {
  state.service = null;
  state.date = null;
  state.time = null;
  els.form.reset();
  hideFormError();
  goToStep(1);
});

// ---------------------------------------------------------------------
// STEP 1 — Services
// ---------------------------------------------------------------------
function renderServices() {
  els.serviceList.innerHTML = "";
  CONFIG.services.forEach((svc) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "service-card";
    btn.dataset.id = svc.id;
    const priceLabel = svc.price > 0 ? `${CONFIG.currency}${svc.price.toLocaleString("en-IN")}` : "Free";
    btn.innerHTML = `
      <span>
        <span class="block font-medium text-[15px]">${escapeHtml(svc.name)}</span>
        <span class="block text-ink/50 text-sm mt-0.5">${svc.durationMins} mins</span>
      </span>
      <span class="font-display text-lg">${priceLabel}</span>
    `;
    btn.addEventListener("click", () => selectService(svc));
    els.serviceList.appendChild(btn);
  });
}

function selectService(svc) {
  state.service = svc;
  document.querySelectorAll(".service-card").forEach((c) => {
    c.classList.toggle("is-selected", c.dataset.id === svc.id);
  });
  els.selectedServiceLabel.textContent = `${svc.name} · ${svc.durationMins} mins`;
  state.date = null;
  state.time = null;
  goToStep(2);
  renderDayPicker();
}

// ---------------------------------------------------------------------
// STEP 2 — Date & time
// ---------------------------------------------------------------------
function getNextDays(count) {
  const days = [];
  const cursor = new Date();
  let guard = 0;
  while (days.length < count && guard < count * 3) {
    guard++;
    const d = new Date(cursor);
    d.setDate(cursor.getDate() + guard - 1);
    days.push(d);
  }
  return days;
}

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

function renderDayPicker() {
  const days = getNextDays(CONFIG.daysAhead);
  els.dayPicker.innerHTML = "";
  days.forEach((d, i) => {
    const iso = toISODate(d);
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "day-chip";
    chip.dataset.date = iso;
    chip.innerHTML = `
      <span class="dow block">${d.toLocaleDateString("en-IN", { weekday: "short" })}</span>
      <span class="dom block">${d.getDate()}</span>
    `;
    chip.addEventListener("click", () => selectDay(iso));
    els.dayPicker.appendChild(chip);
    if (i === 0) selectDay(iso, chip); // auto-select the first available day
  });
}

async function selectDay(iso, chipEl) {
  state.date = iso;
  state.time = null;
  document.querySelectorAll(".day-chip").forEach((c) => {
    c.classList.toggle("is-selected", c.dataset.date === iso);
  });
  await loadSlots(iso);
}

function slotsSkeleton() {
  els.slotsGrid.innerHTML = Array.from({ length: 6 })
    .map(() => `<div class="skeleton h-11 rounded-xl"></div>`)
    .join("");
}

async function loadSlots(iso) {
  slotsSkeleton();
  els.slotsHeading.textContent = "Available times";

  if (state.slotsCache[iso]) {
    return renderSlots(state.slotsCache[iso]);
  }

  try {
    const params = new URLSearchParams({
      date: iso,
      duration: String(state.service?.durationMins ?? 30),
    });
    const res = await fetch(`/api/slots?${params.toString()}`);
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    const slots = Array.isArray(data) ? data : data.slots || [];
    state.slotsCache[iso] = slots;
    renderSlots(slots);
  } catch (err) {
    console.error("Failed to load slots:", err);
    els.slotsGrid.innerHTML = `
      <p class="col-span-3 text-sm text-danger bg-danger/10 rounded-xl px-4 py-3">
        Couldn't load available times. Please try another day or refresh the page.
      </p>`;
  }
}

function renderSlots(slots) {
  if (!slots.length) {
    els.slotsGrid.innerHTML = `
      <p class="col-span-3 text-sm text-ink/50 bg-white border border-line rounded-xl px-4 py-3">
        No open slots this day — try another date.
      </p>`;
    return;
  }
  els.slotsGrid.innerHTML = "";
  slots.forEach((time) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "time-slot";
    btn.textContent = formatTime(time);
    btn.dataset.time = time;
    btn.addEventListener("click", () => {
      state.time = time;
      document.querySelectorAll(".time-slot").forEach((s) => s.classList.remove("is-selected"));
      btn.classList.add("is-selected");
      setTimeout(() => goToStep(3), 180);
      renderBookingSummary();
    });
    els.slotsGrid.appendChild(btn);
  });
}

function formatTime(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

// ---------------------------------------------------------------------
// STEP 3 — Client details
// ---------------------------------------------------------------------
function renderBookingSummary() {
  const d = new Date(`${state.date}T00:00:00`);
  const dateLabel = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  els.bookingSummary.textContent = `${state.service.name} · ${dateLabel} at ${formatTime(state.time)}`;
}

function showFormError(msg) {
  els.formError.textContent = msg;
  els.formError.classList.remove("hidden");
}
function hideFormError() {
  els.formError.classList.add("hidden");
}

els.form.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideFormError();

  const formData = new FormData(els.form);
  const payload = {
    name: String(formData.get("name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    email: String(formData.get("email") || "").trim(),
    serviceId: state.service.id,
    serviceName: state.service.name,
    durationMins: state.service.durationMins,
    date: state.date,
    time: state.time,
  };

  if (!payload.name || !payload.phone || !payload.email) {
    showFormError("Please fill in every field.");
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(payload.email)) {
    showFormError("That email address doesn't look right.");
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = "Booking…";

  try {
    const res = await fetch("/api/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (res.status === 409) {
      showFormError("That slot was just taken — please pick another time.");
      delete state.slotsCache[state.date]; // force a fresh fetch
      els.submitBtn.disabled = false;
      els.submitBtn.textContent = "Confirm booking";
      goToStep(2);
      await loadSlots(state.date);
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `Server returned ${res.status}`);
    }

    const result = await res.json().catch(() => ({}));
    showSuccess(payload, result);
  } catch (err) {
    console.error("Booking failed:", err);
    showFormError("Something went wrong while booking. Please try again in a moment.");
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = "Confirm booking";
  }
});

// ---------------------------------------------------------------------
// STEP 4 — Success
// ---------------------------------------------------------------------
function showSuccess(payload, result) {
  const d = new Date(`${payload.date}T00:00:00`);
  const dateLabel = d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  els.successSummary.textContent = `${payload.serviceName} on ${dateLabel} at ${formatTime(payload.time)}. A confirmation has been sent to ${payload.email}.`;

  const icsContent = buildICS(payload);
  const blob = new Blob([icsContent], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  els.icsLink.href = url;

  goToStep(4);
}

function buildICS({ serviceName, date, time, durationMins }) {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const start = new Date(year, month - 1, day, hour, minute);
  const end = new Date(start.getTime() + durationMins * 60000);

  const fmt = (d) =>
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//" + CONFIG.businessName + "//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@booking`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${serviceName} — ${CONFIG.businessName}`,
    `DESCRIPTION:Appointment for ${serviceName} at ${CONFIG.businessName}.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------
renderServices();
goToStep(1);
