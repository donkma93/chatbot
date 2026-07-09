"use strict";

const ACCOUNT_SCHEMA_VERSION = 2;

const APP_SETTINGS_DEFAULTS = {
  version: 1,
  chatFiltersByChannel: {},
  pendingMessagesByChannel: {},
  systemLogVisible: true,
  guideShown: false,
  transparencyEnabled: false,
  theme: null,
  giveawaySettings: null,
  giveawayHistory: [],
  giveawayDashboard: {
    totalSessions: 0,
    totalParticipants: 0,
    totalClaims: 0,
    totalExpired: 0,
    totalRerolls: 0
  },
  telemetry: {
    appLaunches: 0,
    reconnectEvents: 0,
    sentMessages: 0,
    importedBackups: 0,
    exportedBackups: 0,
    channelJoins: 0,
    channelLeaves: 0,
    rendererCrashes: 0,
    unhandledErrors: 0
  },
  lastSessionSnapshot: {
    savedAt: 0,
    accountCount: 0,
    connectedChannels: []
  },
  autoSettingsByChannel: {},
  eventNotifierSettingsByChannel: {}
};

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function mergeAppSettings(rawSettings) {
  const raw = asObject(rawSettings);

  return {
    ...APP_SETTINGS_DEFAULTS,
    ...raw,
    chatFiltersByChannel: {
      ...APP_SETTINGS_DEFAULTS.chatFiltersByChannel,
      ...asObject(raw.chatFiltersByChannel)
    },
    pendingMessagesByChannel: Object.keys(asObject(raw.pendingMessagesByChannel)).reduce(function (acc, key) {
      acc[key] = Array.isArray(raw.pendingMessagesByChannel[key])
        ? raw.pendingMessagesByChannel[key].filter(function (entry) {
          return entry && typeof entry === "object";
        })
        : [];
      return acc;
    }, {}),
    giveawayHistory: Array.isArray(raw.giveawayHistory) ? raw.giveawayHistory : [],
    giveawayDashboard: {
      ...APP_SETTINGS_DEFAULTS.giveawayDashboard,
      ...asObject(raw.giveawayDashboard)
    },
    telemetry: {
      ...APP_SETTINGS_DEFAULTS.telemetry,
      ...asObject(raw.telemetry)
    },
    lastSessionSnapshot: {
      ...APP_SETTINGS_DEFAULTS.lastSessionSnapshot,
      ...asObject(raw.lastSessionSnapshot),
      connectedChannels: Array.isArray(raw.lastSessionSnapshot && raw.lastSessionSnapshot.connectedChannels)
        ? raw.lastSessionSnapshot.connectedChannels
        : []
    },
    autoSettingsByChannel: {
      ...APP_SETTINGS_DEFAULTS.autoSettingsByChannel,
      ...asObject(raw.autoSettingsByChannel)
    },
    eventNotifierSettingsByChannel: {
      ...APP_SETTINGS_DEFAULTS.eventNotifierSettingsByChannel,
      ...asObject(raw.eventNotifierSettingsByChannel)
    }
  };
}

function applyTelemetryPatch(settings, patch) {
  const nextSettings = mergeAppSettings(settings);
  const nextTelemetry = {
    ...nextSettings.telemetry
  };

  Object.keys(asObject(patch)).forEach(function (key) {
    nextTelemetry[key] = Number(nextTelemetry[key] || 0) + Number(patch[key] || 0);
  });

  return {
    ...nextSettings,
    telemetry: nextTelemetry
  };
}

function buildSessionSnapshot(accounts, connections) {
  const connectedChannels = Object.keys(asObject(connections)).map(function (key) {
    const parts = key.split(":");
    return {
      accountId: parts[0] || "",
      channel: parts.slice(1).join(":") || ""
    };
  });

  return {
    savedAt: Date.now(),
    accountCount: Array.isArray(accounts) ? accounts.length : 0,
    connectedChannels: connectedChannels
  };
}

function needsAccountStorageRewrite(parsed) {
  if (Array.isArray(parsed)) {
    return true;
  }

  const payload = asObject(parsed);
  const storedAccounts = Array.isArray(payload.accounts) ? payload.accounts : [];

  if (payload.version !== ACCOUNT_SCHEMA_VERSION) {
    return true;
  }

  return storedAccounts.some(function (account) {
    return account
      && account.token
      && account.token !== "anonymous"
      && !account.tokenEncrypted;
  });
}

module.exports = {
  ACCOUNT_SCHEMA_VERSION,
  APP_SETTINGS_DEFAULTS,
  mergeAppSettings,
  applyTelemetryPatch,
  buildSessionSnapshot,
  needsAccountStorageRewrite
};
