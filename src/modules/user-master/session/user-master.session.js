import crypto from "node:crypto";
import { cookies } from "next/headers";

export const USER_MASTER_SESSION_COOKIE = "psb_um_session";
export const USER_MASTER_SESSION_TTL_SECONDS = 12 * 60 * 60;

function base64UrlEncode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function getSessionSecret() {
  const explicitSecret = process.env.USER_MASTER_SESSION_SECRET;
  if (explicitSecret && explicitSecret.trim()) return explicitSecret;

  const fallbackSecret = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (fallbackSecret && fallbackSecret.trim()) return fallbackSecret;

  throw new Error(
    "Missing USER_MASTER_SESSION_SECRET (and NEXT_PUBLIC_SUPABASE_ANON_KEY fallback unavailable)."
  );
}

function signValue(value) {
  return crypto
    .createHmac("sha256", getSessionSecret())
    .update(value)
    .digest("base64url");
}

export function createSessionToken(payload, options = {}) {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const ttlSeconds =
    Number.isFinite(Number(options.ttlSeconds)) && Number(options.ttlSeconds) > 0
      ? Number(options.ttlSeconds)
      : USER_MASTER_SESSION_TTL_SECONDS;

  const normalizedPayload = {
    ...payload,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
  };

  const encoded = base64UrlEncode(JSON.stringify(normalizedPayload));
  const signature = signValue(encoded);
  return `${encoded}.${signature}`;
}

export function parseSessionToken(token) {
  const rawToken = String(token || "").trim();
  if (!rawToken || !rawToken.includes(".")) return null;

  const [encodedPayload, tokenSignature] = rawToken.split(".");
  const expectedSignature = signValue(encodedPayload);

  if (!tokenSignature || tokenSignature !== expectedSignature) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (!payload?.exp || Number(payload.exp) <= nowSeconds) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function writeSessionCookie(response, payload, options = {}) {
  const token = createSessionToken(payload, options);
  const maxAge =
    Number.isFinite(Number(options.ttlSeconds)) && Number(options.ttlSeconds) > 0
      ? Number(options.ttlSeconds)
      : USER_MASTER_SESSION_TTL_SECONDS;

  response.cookies.set({
    name: USER_MASTER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });

  return token;
}

export function clearSessionCookie(response) {
  response.cookies.set({
    name: USER_MASTER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function readSessionPayloadFromCookies() {
  const cookieStore = await cookies();
  const token = cookieStore.get(USER_MASTER_SESSION_COOKIE)?.value;
  return parseSessionToken(token);
}
