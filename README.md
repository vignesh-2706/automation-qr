# Appointment Booking App

A lightweight, mobile-first appointment booking app for a small business (spa,
clinic, salon, studio — anything that takes bookings). It runs entirely on
Cloudflare's free tier, checks real availability against your Google
Calendar, logs every booking to a Google Sheet, and emails a confirmation.

No servers to manage, no database to pay for.

**What it looks like to a customer:** pick a service → pick a day and time →
enter their name, phone, email → done. They get an email and a calendar
file; you get a new event on your calendar and a new row in your sheet.

This guide assumes you've never deployed anything before. Every step is
spelled out — just follow them in order. It'll take 30–45 minutes the first
time.

---

## How it works (30 seconds)

```
Browser (public/)  --fetch-->  Cloudflare Pages Functions (functions/api/)  --API calls-->  Google Calendar
                                                                              --API calls-->  Google Sheets
                                                                              --API call--->  Resend (email)
```

- `public/` is the website itself — plain HTML/CSS/JS, no build step.
- `functions/api/slots.js` and `functions/api/book.js` are small serverless
  functions ("Cloudflare Pages Functions") that run next to your site.
  They're the only things allowed to know your Google/Resend credentials.
- Nothing secret ever reaches the browser.

---

## Part 1 — Things to set up before touching any code

### 1.1 Create a Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with the Google
   account that owns (or can access) your business's Calendar and a Sheet
   you'll use as a CRM.
2. Top-left, click the project dropdown → **New Project**.
3. Name it something like `booking-app` → **Create**.
4. Make sure the new project is selected in the top dropdown before
   continuing.

### 1.2 Enable the two APIs you need

1. In the left sidebar (or search bar at top), go to **APIs & Services →
   Library**.
2. Search for **Google Calendar API** → click it → **Enable**.
3. Search for **Google Sheets API** → click it → **Enable**.

### 1.3 Create a service account (this is how the app authenticates)

A "service account" is a robot user that the app logs in as — no human
password involved.

1. Go to **APIs & Services → Credentials**.
2. Click **+ Create Credentials → Service account**.
3. Name it `booking-app-bot` → **Create and Continue**.
4. You can skip the optional "grant access" steps → **Done**.
5. Click on the service account you just created (from the list).
6. Go to the **Keys** tab → **Add Key → Create new key** → choose **JSON**
   → **Create**.
7. A `.json` file downloads automatically. **Keep this file safe and never
   commit it to Git** — it's the equivalent of a password. Open it in a
   text editor; you'll need two values from it in a moment:
   - `client_email` — looks like `booking-app-bot@booking-app-123.iam.gserviceaccount.com`
   - `private_key` — a long string starting with `-----BEGIN PRIVATE KEY-----`

### 1.4 Share your calendar with the service account

The robot user can't see your calendar until you explicitly share it, same
as sharing with a person.

1. Open [Google Calendar](https://calendar.google.com) in your browser.
2. Find the calendar you want to use for bookings in the left sidebar (your
   main calendar is fine, or create a dedicated "Bookings" calendar).
3. Hover over it → ⋮ → **Settings and sharing**.
4. Under **Share with specific people**, click **Add people** and paste the
   `client_email` from step 1.3. Give it **"Make changes to events"**
   permission → **Send**.
5. If you're using your main calendar, its ID is just your Google account
   email. If you created a separate "Bookings" calendar, scroll down on
   this same settings page to **Integrate calendar** and copy the
   **Calendar ID** (looks like `abc123@group.calendar.google.com`). You'll
   need this for the `calendarId` setting later.

### 1.5 Create your CRM spreadsheet

1. Go to [Google Sheets](https://sheets.google.com) → create a **Blank**
   spreadsheet.
2. Rename it (e.g. "Booking CRM").
3. In row 1, add headers: `Timestamp | Client Name | Phone | Email | Service | Appointment Time`
4. Click **Share** (top-right) → paste the same `client_email` from step
   1.3 → give it **Editor** access → **Send**.
5. Copy the **Sheet ID** from the URL. If the URL is:
   `https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOp/edit`
   then the ID is `1AbCdEfGhIjKlMnOp`.

### 1.6 Create a Resend account (for confirmation emails)

1. Go to <https://resend.com> → sign up (free tier: 3,000 emails/month).
2. Go to **API Keys → Create API Key**. Copy it somewhere safe — you won't
   be able to see it again.
3. Go to **Domains → Add Domain** and follow their DNS verification steps
   *if you own a domain you want emails to come from* (recommended for a
   real business). If you just want to test quickly first, Resend lets you
   send from `onboarding@resend.dev` to your own verified email address
   with no domain setup — good enough to get started today.

### 1.7 Create free accounts for the rest

- **GitHub**: <https://github.com/signup> (free) — this is where your code
  lives so Cloudflare can find it.
- **Cloudflare**: <https://dash.cloudflare.com/sign-up> (free) — this is
  what actually hosts and runs the app.

---

## Part 2 — Get the code onto your computer

You need [Node.js](https://nodejs.org) installed (any recent LTS version)
and [Git](https://git-scm.com/downloads).

1. Put all the project files (this README, `public/`, `functions/`,
   `wrangler.toml`, `.gitignore`) into one folder, e.g. `booking-app`.
2. Open a terminal in that folder and turn it into a Git repository:

   ```bash
   git init
   git add .
   git commit -m "Initial commit: booking app"
   ```

3. Install Wrangler, Cloudflare's command-line tool (used for local testing
   and optional CLI deploys):

   ```bash
   npm install -g wrangler
   ```

### 2.1 Test it locally before deploying anywhere

1. Copy the example env file and fill in your real values from Part 1:

   ```bash
   cp .dev.vars.example .dev.vars
   ```

   Open `.dev.vars` and paste in your `GOOGLE_SERVICE_ACCOUNT_EMAIL`,
   `GOOGLE_PRIVATE_KEY` (the whole thing, including the `BEGIN/END` lines,
   wrapped in quotes, with `\n` where the real file has line breaks — this
   is exactly how it appears in the downloaded JSON key), `GOOGLE_SHEET_ID`,
   `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `OWNER_EMAIL`.

2. If you're using a calendar other than your primary one, or want
   different hours than the 9am–6pm default, open
   `functions/_lib/config.js` and edit `BUSINESS_CONFIG` at the top.

3. Run the local dev server:

   ```bash
   wrangler pages dev public
   ```

4. Open the URL it prints (usually `http://localhost:8788`) and try booking
   a slot end-to-end. Check that:
   - Time slots load in Step 2
   - A new event appears on your Google Calendar after booking
   - A new row appears in your Google Sheet
   - You receive the confirmation email

   If something fails, the terminal running `wrangler` will print the
   error — see **Troubleshooting** at the bottom of this file.

---

## Part 3 — Push the code to GitHub

1. Create a new **empty** repository on GitHub (no README, no .gitignore —
   you already have one): <https://github.com/new>
2. Copy the commands GitHub shows you under "…or push an existing
   repository from the command line", which will look like:

   ```bash
   git remote add origin https://github.com/YOUR-USERNAME/booking-app.git
   git branch -M main
   git push -u origin main
   ```

3. Refresh the GitHub page — you should see all your files there. (Your
   `.dev.vars` file will **not** be there, because `.gitignore` excludes
   it. That's correct and intentional — it has your secrets in it.)

---

## Part 4 — Deploy on Cloudflare Pages

### 4.1 Connect the repository

1. Log into <https://dash.cloudflare.com>.
2. In the left sidebar, go to **Workers & Pages**.
3. Click **Create → Pages → Connect to Git**.
4. Authorize Cloudflare to access your GitHub account if prompted, then
   select the `booking-app` repository.
5. On the build settings screen:
   - **Project name**: whatever you like (this becomes part of your free
     `*.pages.dev` URL).
   - **Production branch**: `main`
   - **Framework preset**: None
   - **Build command**: *(leave empty)*
   - **Build output directory**: `public`
6. **Don't click Save and Deploy yet** — first add your environment
   variables in the next step, so the very first deploy already works.

### 4.2 Add your environment variables

Still on that same setup screen (or afterwards under **Settings →
Environment variables** if you already deployed):

1. Scroll to **Environment variables (advanced)**.
2. Click **Add variable** for each of the following, under **Production**
   (add them under **Preview** too if you want preview deployments to
   work):

   | Variable name | Value |
   |---|---|
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the `client_email` from your JSON key |
   | `GOOGLE_PRIVATE_KEY` | the full `private_key` from your JSON key, including `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` |
   | `GOOGLE_SHEET_ID` | your spreadsheet ID from step 1.5 |
   | `RESEND_API_KEY` | your Resend API key |
   | `RESEND_FROM_EMAIL` | e.g. `bookings@yourdomain.com` or `onboarding@resend.dev` |
   | `OWNER_EMAIL` | where you want new-booking notifications sent |
   | `BUSINESS_NAME` | e.g. `Serene Studio` |

   **About `GOOGLE_PRIVATE_KEY` specifically:** paste it exactly as it
   appears in the downloaded JSON file, including the literal `\n`
   characters — do not try to turn them into real line breaks in the
   dashboard text box. The app converts `\n` back into real newlines
   automatically (see `functions/_lib/google.js`). Click the **Encrypt**
   option if the dashboard offers it, so it's masked afterward.

3. Click **Save**, then **Save and Deploy**.

### 4.3 Watch the first deploy

Cloudflare will show a build log. Since there's no build step, it just
uploads your files — this takes under a minute. When it finishes, click the
`*.pages.dev` link it gives you and run through a real test booking, the
same way you did locally.

---

## Part 5 — Optional: deploying updates via the command line

Once connected to GitHub, every `git push` to `main` auto-deploys — that's
the easiest path. If you'd rather deploy directly from your machine without
going through GitHub:

```bash
wrangler login          # one-time browser login
wrangler pages deploy public
```

Note the CLI deploys the contents of `public/` *and* automatically picks up
the `functions/` folder next to it. Environment variables still need to be
set in the dashboard (Part 4.2) — the CLI doesn't upload `.dev.vars`.

---

## Part 6 — Customizing it for your business

Everything you're likely to change lives in two small files:

- **`public/app.js`** → the `CONFIG` object at the top: business name, the
  list of services (name, price, duration).
- **`functions/_lib/config.js`** → `BUSINESS_CONFIG`: opening/closing
  hours, timezone offset, appointment slot spacing, which calendar to use,
  which sheet range to log to.

After editing either file, `git commit` and `git push` — Cloudflare
redeploys automatically within a minute or two.

---

## Troubleshooting

**"Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY" error**
The environment variables aren't set (or aren't set for the right
environment — Production vs Preview). Double check Part 4.2.

**Calendar events aren't being created / freebusy always looks empty**
The calendar almost certainly isn't shared with the service account yet.
Redo step 1.4 and confirm the email matches exactly.

**"Sheets append failed" in the logs**
Usually means the sheet isn't shared with the service account (step 1.5),
or `GOOGLE_SHEET_ID` is wrong, or the sheet doesn't have a tab named
`Bookings` (rename your first tab to `Bookings`, or edit `sheetRange` in
`functions/_lib/config.js` to match your tab's actual name).

**No confirmation email arrives**
Check `RESEND_FROM_EMAIL` is a verified sender/domain in Resend. If you're
using the no-domain `onboarding@resend.dev` sender, Resend only allows
sending to the email address you signed up with — fine for testing, not
for real customers, so verify your own domain before going live.

**Slots never show as available even though your calendar is empty**
Check `utcOffset` and `openHour`/`closeHour` in
`functions/_lib/config.js` match your actual business hours and timezone —
these are hardcoded rather than auto-detected.

**Viewing live logs from a deployed app**
```bash
wrangler pages deployment tail
```
This streams `console.error`/`console.warn` output from your live
Functions, which is the fastest way to see what a failed booking actually
hit.

---

## A note on the double-booking safeguard

`functions/api/book.js` re-checks Google Calendar for conflicts
immediately before creating the event, which closes almost all of the race
window between two people booking the same slot at nearly the same moment.
It is not a perfect lock — Google Calendar has no built-in locking
primitive, and Cloudflare Functions don't share memory between requests. For
a single-provider small business this residual risk is very low in
practice. If you ever need it to be airtight (e.g. multiple staff booking
into the same calendar at high volume), add a short-lived
[Cloudflare KV](https://developers.cloudflare.com/kv/) lock keyed by
`date+time` around the check-and-create step.

---

## File reference

```
public/
  index.html   — the booking wizard UI (4 steps)
  app.js       — wizard state, fetch calls to /api/slots and /api/book
  styles.css   — small hand-written styles Tailwind's utilities don't cover

functions/
  api/
    slots.js   — GET  /api/slots  → available times for a given date
    book.js    — POST /api/book   → re-checks, books, logs, emails
  _lib/
    google.js    — signs a JWT and exchanges it for a Google access token
    config.js    — business hours / timezone / calendar ID / sheet range
    calendar.js  — freebusy lookup + event creation
    sheets.js    — appends a row to the CRM spreadsheet
    email.js     — sends confirmation emails via Resend

wrangler.toml     — Cloudflare project config (no secrets)
.dev.vars.example — template for local secrets (copy to .dev.vars)
.gitignore
```
