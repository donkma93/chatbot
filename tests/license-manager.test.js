"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  DAY_MS,
  createAdminConfig,
  verifyAdminKey,
  generateIssuerKeyPair,
  buildLicenseRecord,
  getLicenseStatus,
  encodeLicenseRecord,
  decodeLicenseRecord,
  signLicenseRecord,
  verifySignedLicense
} = require("../lib/license-manager");

test("admin config verifies correct key and rejects wrong key", () => {
  const config = createAdminConfig("super-admin-123", 1000);
  assert.equal(verifyAdminKey("super-admin-123", config), true);
  assert.equal(verifyAdminKey("wrong-key", config), false);
});

test("license record expires based on expiresAt", () => {
  const now = 1_700_000_000_000;
  const record = buildLicenseRecord({
    product: "standard",
    daysValid: 10,
    now: now
  });

  assert.equal(getLicenseStatus(record, now), "active");
  assert.equal(getLicenseStatus(record, now + (11 * DAY_MS)), "expired");
});

test("license record encode/decode roundtrip preserves core fields", () => {
  const record = buildLicenseRecord({
    product: "giveaway",
    daysValid: 30,
    note: "VIP customer",
    now: 12345
  });

  const encoded = encodeLicenseRecord(record);
  const decoded = decodeLicenseRecord(encoded);

  assert.equal(decoded.key, record.key);
  assert.equal(decoded.product, "giveaway");
  assert.equal(decoded.note, "VIP customer");
  assert.equal(decoded.expiresAt, record.expiresAt);
});

test("signed license verifies with issuer public key", () => {
  const pair = generateIssuerKeyPair();
  const record = buildLicenseRecord({
    product: "standard",
    daysValid: 15,
    note: "Signed license"
  });

  const token = signLicenseRecord(record, pair.privateKeyPem);
  const verified = verifySignedLicense(token, pair.publicKeyPem);

  assert.equal(verified.key, record.key);
  assert.equal(verified.note, "Signed license");
});
