import crypto from "node:crypto";
import { query } from "../db/pool.js";

const SENSITIVE_KEY_PATTERN = /(password|pass|token|secret|authorization|cookie|api[_-]?key|otp|mfa|credential)/i;

function getAuditSalt() {
  return (
    process.env.AUTH_AUDIT_HASH_SALT ||
    process.env.AUTH_SESSION_SECRET ||
    "setu-local-auth-audit"
  );
}

function hashValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return null;
  }

  return crypto
    .createHash("sha256")
    .update(getAuditSalt())
    .update("|")
    .update(normalized)
    .digest("hex");
}

function getClientIp(request) {
  const forwardedFor = request.get?.("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || null;
  }

  return request.ip || request.socket?.remoteAddress || null;
}

function sanitizeMetadata(value, depth = 0) {
  if (value === null || value === undefined) {
    return value;
  }

  if (depth > 4) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => sanitizeMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY_PATTERN.test(key) ? "[redacted]" : sanitizeMetadata(entry, depth + 1),
      ]),
    );
  }

  if (typeof value === "string") {
    return value.length > 240 ? `${value.slice(0, 240)}...` : value;
  }

  return value;
}

export async function recordAuthAuditEvent({
  request,
  eventType,
  outcome,
  username = null,
  userId = null,
  actorUsername = null,
  metadata = {},
}) {
  try {
    await query(
      `
        INSERT INTO auth_audit_events (
          id,
          event_type,
          outcome,
          username,
          user_id,
          actor_username,
          ip_hash,
          user_agent_hash,
          request_method,
          request_path,
          metadata,
          created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, NOW())
      `,
      [
        crypto.randomUUID(),
        String(eventType || "unknown"),
        outcome === "success" || outcome === "failure" ? outcome : "info",
        username ? String(username).trim().slice(0, 160) : null,
        userId ? String(userId).trim().slice(0, 160) : null,
        actorUsername ? String(actorUsername).trim().slice(0, 160) : null,
        hashValue(getClientIp(request)),
        hashValue(request.get?.("user-agent")),
        request.method ?? null,
        request.originalUrl ?? request.path ?? null,
        JSON.stringify(sanitizeMetadata(metadata) ?? {}),
      ],
    );
  } catch (error) {
    console.error("Auth audit write failed", error.message);
  }
}
