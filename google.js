/**
 * Minimal Google service-account auth for the Cloudflare Workers runtime.
 *
 * Cloudflare Workers do NOT support the official `googleapis` Node SDK
 * (it depends on Node-only APIs). Instead we hand-build a signed JWT using
 * the platform's native Web Crypto API and exchange it for an access
 * token — this is the standard pattern for calling Google APIs from
 * Workers/Pages Functions.
 *
 * Usage:
 *   const token = await getGoogleAccessToken(env, [
 *     "https://www.googleapis.com/auth/calendar",
 *     "https://www.googleapis.com/auth/spreadsheets",
 *   ]);
 */

// Cache the token in memory for the lifetime of the Worker isolate so we
// don't re-mint a new one on every single request.
let cachedToken = null;
let cachedTokenExpiry = 0;

export async function getGoogleAccessToken(env, scopes) {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedTokenExpiry - 60 > now) {
    return cachedToken;
  }

  const email = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = env.GOOGLE_PRIVATE_KEY;

  if (!email || !rawKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY environment variables."
    );
  }

  const jwt = await buildSignedJwt({
    email,
    privateKeyPem: normalizePrivateKey(rawKey),
    scope: scopes.join(" "),
    now,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = now + (data.expires_in || 3600);
  return cachedToken;
}

// Environment variables can't contain real newlines in most dashboards, so
// the key is usually pasted with literal "\n" sequences — convert those back.
function normalizePrivateKey(key) {
  return key.includes("\\n") ? key.replace(/\\n/g, "\n") : key;
}

async function buildSignedJwt({ email, privateKeyPem, scope, now }) {
  const header = { alg: "RS256", typ: "JWT" };
  const claims = {
    iss: email,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const encodedHeader = base64url(JSON.stringify(header));
  const encodedClaims = base64url(JSON.stringify(claims));
  const unsigned = `${encodedHeader}.${encodedClaims}`;

  const cryptoKey = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${base64urlFromBuffer(signature)}`;
}

async function importPrivateKey(pem) {
  const pemBody = pem
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  const binary = atob(pemBody);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function base64url(str) {
  return base64urlFromBuffer(new TextEncoder().encode(str));
}

function base64urlFromBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
