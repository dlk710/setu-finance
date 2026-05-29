import { createHmac, timingSafeEqual } from "node:crypto";

const COOKIE_NAME = "setu_portal_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "setu-local-demo";
const DEFAULT_SESSION_SECRET = "dev-only-change-me";

function getConfiguredUsername() {
  return process.env.PORTAL_USERNAME?.trim() || DEFAULT_USERNAME;
}

function getConfiguredPassword() {
  return process.env.PORTAL_PASSWORD || DEFAULT_PASSWORD;
}

function getSessionSecret() {
  return process.env.AUTH_SESSION_SECRET?.trim() || DEFAULT_SESSION_SECRET;
}

function signPayload(payload) {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

function parseCookieHeader(header = "") {
  return header
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex < 0) {
        return cookies;
      }

      const key = part.slice(0, separatorIndex).trim();
      const value = part.slice(separatorIndex + 1).trim();
      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function getPortalAuthStatus() {
  return {
    enabled: true,
    usernameHint: getConfiguredUsername(),
    usingDefaultCredentials:
      getConfiguredUsername() === DEFAULT_USERNAME && getConfiguredPassword() === DEFAULT_PASSWORD,
  };
}

export function authenticatePortalUser(username, password) {
  if (username?.trim() !== getConfiguredUsername() || password !== getConfiguredPassword()) {
    return null;
  }

  return {
    username: getConfiguredUsername(),
  };
}

export function setAuthCookie(response, username) {
  const payload = Buffer.from(
    JSON.stringify({
      username,
      issuedAt: Date.now(),
    }),
    "utf8",
  ).toString("base64url");
  const signature = signPayload(payload);

  response.cookie(COOKIE_NAME, `${payload}.${signature}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: SESSION_TTL_MS,
  });
}

export function clearAuthCookie(response) {
  response.cookie(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    expires: new Date(0),
  });
}

export function readAuthenticatedSession(request) {
  const cookieValue = parseCookieHeader(request.headers.cookie)[COOKIE_NAME];
  if (!cookieValue) {
    return null;
  }

  const separatorIndex = cookieValue.lastIndexOf(".");
  if (separatorIndex < 0) {
    return null;
  }

  const payload = cookieValue.slice(0, separatorIndex);
  const signature = cookieValue.slice(separatorIndex + 1);
  const expectedSignature = signPayload(payload);

  if (!safeCompare(signature, expectedSignature)) {
    return null;
  }

  let session;
  try {
    session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (!session?.username || !session?.issuedAt) {
    return null;
  }

  if (Date.now() - Number(session.issuedAt) > SESSION_TTL_MS) {
    return null;
  }

  if (session.username !== getConfiguredUsername()) {
    return null;
  }

  return {
    username: session.username,
    issuedAt: Number(session.issuedAt),
  };
}

export function getSessionCookieName() {
  return COOKIE_NAME;
}
