const DEFAULT_INTERVAL_MINUTES = 5;
const DEFAULT_STARTUP_DELAY_SECONDS = 15;

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

function clampIntervalMinutes(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_INTERVAL_MINUTES;
  }

  return Math.min(1440, Math.max(1, Math.round(parsed)));
}

export function getDefaultGmailAutoSyncSettings() {
  return {
    enabled: parseBoolean(process.env.GMAIL_AUTO_SYNC_ENABLED, true),
    intervalMinutes: clampIntervalMinutes(
      parsePositiveNumber(process.env.GMAIL_AUTO_SYNC_INTERVAL_MINUTES, DEFAULT_INTERVAL_MINUTES),
    ),
    startupDelaySeconds: parsePositiveNumber(
      process.env.GMAIL_AUTO_SYNC_STARTUP_DELAY_SECONDS,
      DEFAULT_STARTUP_DELAY_SECONDS,
    ),
    updatedAt: null,
    updatedBy: null,
  };
}

export function normalizeGmailAutoSyncSettings(settings = {}) {
  const defaults = getDefaultGmailAutoSyncSettings();
  return {
    enabled: settings.enabled === undefined ? defaults.enabled : Boolean(settings.enabled),
    intervalMinutes: clampIntervalMinutes(settings.intervalMinutes ?? defaults.intervalMinutes),
    startupDelaySeconds: parsePositiveNumber(
      settings.startupDelaySeconds,
      defaults.startupDelaySeconds,
    ),
    updatedAt: settings.updatedAt ?? null,
    updatedBy: settings.updatedBy ?? null,
  };
}

export function normalizeGmailIntegrationState(state = {}) {
  return {
    lastSyncAt: state.lastSyncAt ?? null,
    lastSyncSummary: state.lastSyncSummary ?? null,
    autoSyncSettings: normalizeGmailAutoSyncSettings(state.autoSyncSettings ?? {}),
  };
}
