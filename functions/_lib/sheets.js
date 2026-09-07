import { getGoogleAccessToken } from "./google.js";
import { BUSINESS_CONFIG } from "./config.js";

const SHEETS_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

/** Appends one row to the configured spreadsheet/range. */
export async function appendBookingRow(env, rowValues) {
  const spreadsheetId = env.GOOGLE_SHEET_ID;
  if (!spreadsheetId) {
    throw new Error("Missing GOOGLE_SHEET_ID environment variable.");
  }

  const token = await getGoogleAccessToken(env, SHEETS_SCOPES);

  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}` +
    `/values/${encodeURIComponent(BUSINESS_CONFIG.sheetRange)}:append` +
    `?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [rowValues] }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Sheets append failed (${res.status}): ${text}`);
  }
}
