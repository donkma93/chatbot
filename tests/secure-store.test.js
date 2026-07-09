"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { encryptString, decryptString } = require("../lib/secure-store");

test("encryptString and decryptString round-trip data", () => {
  const secret = "machine-secret";
  const original = "oauth:abc123-super-secret-token";
  const encrypted = encryptString(original, secret);

  assert.notEqual(encrypted, original);
  assert.equal(decryptString(encrypted, secret), original);
});

test("decryptString rejects invalid payload", () => {
  assert.throws(() => decryptString("invalid-payload", "secret"), /INVALID_ENCRYPTED_PAYLOAD/);
});

test("decryptString fails with another secret", () => {
  const encrypted = encryptString("oauth:token", "secret-a");
  assert.throws(() => decryptString(encrypted, "secret-b"));
});
