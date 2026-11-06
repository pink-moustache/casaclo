// JWT HS256 mínimo (sem dependências) + helpers de cookie.
import { createHmac, timingSafeEqual } from "node:crypto";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

export function signJwt(payload, secret, ttlSeconds) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now, exp: now + ttlSeconds };
  const data = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(body))}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export function verifyJwt(token, secret) {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", secret).update(data).digest();
  let got;
  try { got = Buffer.from(parts[2], "base64url"); } catch { return null; }
  if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")); } catch { return null; }
  if (!payload || typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/** cookie de sessão (nome usado pela plataforma) */
export const COOKIE_NAME = "casaclo_session";

export function sessionCookie(token, { secure, maxAgeSeconds }) {
  const bits = [
    `${COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  if (secure) bits.push("Secure");
  return bits.join("; ");
}

export function clearCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function readCookie(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx > -1 && part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}
