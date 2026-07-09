"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

function computeGiveawayDashboard(history) {
  const items = Array.isArray(history) ? history : [];
  const dashboard = {
    totalSessions: items.length,
    totalParticipants: 0,
    totalClaims: 0,
    totalExpired: 0,
    totalRerolls: 0
  };

  items.forEach((entry) => {
    dashboard.totalParticipants += Number(entry.participantCount || 0);
    if (entry.status === "claimed") dashboard.totalClaims += 1;
    if (entry.status === "expired") dashboard.totalExpired += 1;
    if (entry.status === "rerolled") dashboard.totalRerolls += 1;
  });

  return dashboard;
}

test("computeGiveawayDashboard aggregates statuses and participants", () => {
  const dashboard = computeGiveawayDashboard([
    { status: "claimed", participantCount: 10 },
    { status: "expired", participantCount: 8 },
    { status: "rerolled", participantCount: 12 }
  ]);

  assert.deepEqual(dashboard, {
    totalSessions: 3,
    totalParticipants: 30,
    totalClaims: 1,
    totalExpired: 1,
    totalRerolls: 1
  });
});
