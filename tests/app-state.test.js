"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  APP_SETTINGS_DEFAULTS,
  mergeAppSettings,
  applyTelemetryPatch,
  buildSessionSnapshot,
  needsAccountStorageRewrite
} = require("../lib/app-state");

test("mergeAppSettings deep-merges nested settings with defaults", () => {
  const merged = mergeAppSettings({
    chatFiltersByChannel: {
      "acc:channel": { type: "mentions", search: "hello" }
    },
    pendingMessagesByChannel: {
      "acc:channel": [{ text: "queued hello", createdAt: 1 }]
    },
    telemetry: {
      sentMessages: 5
    },
    lastSessionSnapshot: {
      accountCount: 3,
      connectedChannels: [{ accountId: "a1", channel: "demo" }]
    }
  });

  assert.equal(merged.telemetry.sentMessages, 5);
  assert.equal(merged.telemetry.appLaunches, APP_SETTINGS_DEFAULTS.telemetry.appLaunches);
  assert.deepEqual(merged.chatFiltersByChannel["acc:channel"], { type: "mentions", search: "hello" });
  assert.deepEqual(merged.pendingMessagesByChannel["acc:channel"], [{ text: "queued hello", createdAt: 1 }]);
  assert.equal(merged.lastSessionSnapshot.accountCount, 3);
  assert.deepEqual(merged.lastSessionSnapshot.connectedChannels, [{ accountId: "a1", channel: "demo" }]);
});

test("mergeAppSettings normalizes invalid pending message payloads", () => {
  const merged = mergeAppSettings({
    pendingMessagesByChannel: {
      "acc:channel": [{ text: "ok" }, null, "bad"],
      "acc:other": "nope"
    }
  });

  assert.deepEqual(merged.pendingMessagesByChannel["acc:channel"], [{ text: "ok" }]);
  assert.deepEqual(merged.pendingMessagesByChannel["acc:other"], []);
});

test("applyTelemetryPatch increments existing counters safely", () => {
  const next = applyTelemetryPatch({
    telemetry: {
      appLaunches: 2,
      sentMessages: 4
    }
  }, {
    appLaunches: 1,
    reconnectEvents: 2
  });

  assert.deepEqual(next.telemetry, {
    ...APP_SETTINGS_DEFAULTS.telemetry,
    appLaunches: 3,
    sentMessages: 4,
    reconnectEvents: 2
  });
});

test("buildSessionSnapshot captures account count and channel keys", () => {
  const snapshot = buildSessionSnapshot(
    [{ id: "a1" }, { id: "a2" }],
    {
      "a1:demo": {},
      "a2:channel:with:colon": {}
    }
  );

  assert.equal(snapshot.accountCount, 2);
  assert.deepEqual(snapshot.connectedChannels, [
    { accountId: "a1", channel: "demo" },
    { accountId: "a2", channel: "channel:with:colon" }
  ]);
  assert.equal(typeof snapshot.savedAt, "number");
});

test("needsAccountStorageRewrite detects legacy array and plaintext tokens", () => {
  assert.equal(needsAccountStorageRewrite([]), true);
  assert.equal(needsAccountStorageRewrite({
    version: 2,
    accounts: [{ token: "oauth:plaintext" }]
  }), true);
  assert.equal(needsAccountStorageRewrite({
    version: 2,
    accounts: [{ token: "", tokenEncrypted: "enc-value" }]
  }), false);
});
