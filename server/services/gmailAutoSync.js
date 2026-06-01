import { getPool } from "../db/pool.js";
import { applyGmailSyncResult, loadState } from "../stateStore.js";
import { getGmailIntegrationStatus } from "./gmailAuth.js";
import { normalizeGmailAutoSyncSettings } from "./gmailSyncSettings.js";
import { syncGmailInbox } from "./gmailSync.js";

const LOCK_NAMESPACE = 710;
const LOCK_ID = 5001;

let timer = null;

const schedulerState = {
  enabled: false,
  active: false,
  running: false,
  intervalMinutes: 5,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastTrigger: null,
  nextRunAt: null,
  reason: null,
};

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
  return {
    ...schedulerState,
  };
}

async function loadAutoSyncSettings() {
  const state = await loadState();
  return normalizeGmailAutoSyncSettings(state.integrations?.gmail?.autoSyncSettings ?? {});
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

function clearScheduledRun() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  schedulerState.nextRunAt = null;
}

async function configureNextRun(delayMs) {
  clearScheduledRun();
  const config = await loadAutoSyncSettings();
  const gmailStatus = getGmailIntegrationStatus();

  schedulerState.enabled = config.enabled;
  schedulerState.intervalMinutes = config.intervalMinutes;

  if (!config.enabled) {
    clearScheduledRun();
    schedulerState.active = false;
    schedulerState.reason = "Automatic Gmail sync is disabled.";
    return;
  }

  if (!gmailStatus.configured || !gmailStatus.authorized) {
    clearScheduledRun();
    schedulerState.active = false;
    schedulerState.reason = "Gmail credentials or token are not configured.";
    return;
  }

  schedulerState.active = true;
  schedulerState.reason = null;
  schedulerState.nextRunAt = new Date(Date.now() + delayMs).toISOString();

  timer = setTimeout(async () => {
    try {
      await runGmailSyncOnce({ trigger: "scheduled" });
    } catch (error) {
      console.error("Scheduled Gmail sync failed", error);
    } finally {
      const latestConfig = await loadAutoSyncSettings().catch(() => config);
      await configureNextRun(latestConfig.intervalMinutes * 60 * 1000).catch((error) => {
        schedulerState.active = false;
        schedulerState.reason = error.message || "Automatic Gmail sync could not be scheduled.";
        console.error("Could not schedule next Gmail sync", error);
      });
    }
  }, delayMs);

  timer.unref?.();
}

export async function startGmailAutoSync() {
  const config = await loadAutoSyncSettings();
  await configureNextRun(config.startupDelaySeconds * 1000);
}

export async function refreshGmailAutoSyncSchedule() {
  const config = await loadAutoSyncSettings();
  await configureNextRun(config.enabled ? config.intervalMinutes * 60 * 1000 : 0);
}
