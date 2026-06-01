import { getPool } from "../db/pool.js";
import { applyGmailSyncResult, loadState } from "../stateStore.js";
import { getGmailIntegrationStatus } from "./gmailAuth.js";
import { syncGmailInbox } from "./gmailSync.js";

const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_STARTUP_DELAY_SECONDS = 15;
const LOCK_NAMESPACE = 710;
const LOCK_ID = 5001;

let timer = null;

const schedulerState = {
  enabled: false,
  active: false,
  running: false,
  intervalMinutes: DEFAULT_INTERVAL_MINUTES,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastTrigger: null,
  nextRunAt: null,
  reason: null,
};

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return !["false", "0", "no", "off"].includes(String(value).trim().toLowerCase());
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAutoSyncConfig() {
  return {
    enabled: parseBoolean(process.env.GMAIL_AUTO_SYNC_ENABLED, true),
    intervalMinutes: parsePositiveNumber(
      process.env.GMAIL_AUTO_SYNC_INTERVAL_MINUTES,
      DEFAULT_INTERVAL_MINUTES,
    ),
    startupDelaySeconds: parsePositiveNumber(
      process.env.GMAIL_AUTO_SYNC_STARTUP_DELAY_SECONDS,
      DEFAULT_STARTUP_DELAY_SECONDS,
    ),
  };
}

async function withGmailSyncLock(work) {
  const client = await getPool().connect();

  try {
    const lockResult = await client.query(
      "SELECT pg_try_advisory_lock($1, $2) AS locked",
      [LOCK_NAMESPACE, LOCK_ID],
    );

    if (!lockResult.rows[0]?.locked) {
      return { skipped: true, reason: "Another Gmail sync is already running." };
    }

    try {
      return await work();
    } finally {
      await client.query("SELECT pg_advisory_unlock($1, $2)", [LOCK_NAMESPACE, LOCK_ID]);
    }
  } finally {
    client.release();
  }
}

export function getGmailAutoSyncStatus() {
  const config = getAutoSyncConfig();
  return {
    ...schedulerState,
    enabled: config.enabled,
    intervalMinutes: config.intervalMinutes,
  };
}

export async function runGmailSyncOnce({ trigger = "manual" } = {}) {
  if (schedulerState.running) {
    return { skipped: true, reason: "Gmail sync is already running." };
  }

  return withGmailSyncLock(async () => {
    schedulerState.running = true;
    schedulerState.lastStartedAt = new Date().toISOString();
    schedulerState.lastTrigger = trigger;
    schedulerState.lastError = null;

    try {
      const current = await loadState();
      const syncResult = await syncGmailInbox(current);
      const enrichedSyncResult = {
        ...syncResult,
        summary: {
          ...(syncResult.summary ?? {}),
          trigger,
        },
      };
      const state = await applyGmailSyncResult(enrichedSyncResult);

      schedulerState.lastFinishedAt = new Date().toISOString();
      schedulerState.lastError = null;

      return {
        skipped: false,
        syncResult: enrichedSyncResult,
        state,
      };
    } catch (error) {
      schedulerState.lastFinishedAt = new Date().toISOString();
      schedulerState.lastError = error.message || "Gmail sync failed.";
      throw error;
    } finally {
      schedulerState.running = false;
    }
  });
}

export function startGmailAutoSync() {
  const config = getAutoSyncConfig();
  const gmailStatus = getGmailIntegrationStatus();

  schedulerState.enabled = config.enabled;
  schedulerState.intervalMinutes = config.intervalMinutes;

  if (!config.enabled) {
    schedulerState.active = false;
    schedulerState.reason = "Automatic Gmail sync is disabled.";
    return;
  }

  if (!gmailStatus.configured || !gmailStatus.authorized) {
    schedulerState.active = false;
    schedulerState.reason = "Gmail credentials or token are not configured.";
    return;
  }

  schedulerState.active = true;
  schedulerState.reason = null;

  const intervalMs = config.intervalMinutes * 60 * 1000;

  function scheduleNext(delayMs) {
    if (timer) {
      clearTimeout(timer);
    }

    schedulerState.nextRunAt = new Date(Date.now() + delayMs).toISOString();
    timer = setTimeout(async () => {
      try {
        await runGmailSyncOnce({ trigger: "scheduled" });
      } catch (error) {
        console.error("Scheduled Gmail sync failed", error);
      } finally {
        scheduleNext(intervalMs);
      }
    }, delayMs);

    timer.unref?.();
  }

  scheduleNext(config.startupDelaySeconds * 1000);
}
