"use strict";

const crypto = require("crypto");

const ADMIN_CONFIG_VERSION = 1;
const LICENSE_RECORD_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;

function makeSalt() {
  return crypto.randomBytes(16).toString("hex");
}

function hashAdminKey(adminKey, salt) {
  return crypto.pbkdf2Sync(String(adminKey || ""), String(salt || ""), 120000, 32, "sha256").toString("hex");
}

function createAdminConfig(adminKey, now) {
  const salt = makeSalt();
  return {
    version: ADMIN_CONFIG_VERSION,
    salt: salt,
    hash: hashAdminKey(adminKey, salt),
    createdAt: Number(now || Date.now())
  };
}

function verifyAdminKey(adminKey, config) {
  if (!config || !config.salt || !config.hash) return false;
  return hashAdminKey(adminKey, config.salt) === config.hash;
}

function randomBody(length) {
  let output = "";
  while (output.length < length) {
    output += crypto.randomBytes(8).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "");
  }
  return output.slice(0, length);
}

function buildLicenseKey(product) {
  const prefix = product === "giveaway" ? "GW" : "TV";
  const body = randomBody(12);
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

function generateIssuerKeyPair() {
  const pair = crypto.generateKeyPairSync("ed25519");
  return {
    publicKeyPem: pair.publicKey.export({ type: "spki", format: "pem" }),
    privateKeyPem: pair.privateKey.export({ type: "pkcs8", format: "pem" })
  };
}

function buildLicenseRecord(options) {
  const now = Number((options && options.now) || Date.now());
  const daysValid = Math.max(1, Number(options && options.daysValid) || 1);
  return normalizeLicenseRecord({
    version: LICENSE_RECORD_VERSION,
    id: String((options && options.id) || crypto.randomUUID()),
    key: String((options && options.key) || buildLicenseKey(options && options.product)),
    product: options && options.product === "giveaway" ? "giveaway" : "standard",
    status: "active",
    note: String((options && options.note) || "").trim(),
    createdAt: now,
    updatedAt: now,
    expiresAt: now + (daysValid * DAY_MS),
    activatedAt: 0,
    activatedMachineId: ""
  });
}

function normalizeLicenseRecord(raw) {
  const record = raw && typeof raw === "object" ? raw : {};
  return {
    version: LICENSE_RECORD_VERSION,
    id: String(record.id || ""),
    key: String(record.key || "").trim().toUpperCase(),
    product: record.product === "giveaway" ? "giveaway" : "standard",
    status: record.status === "revoked" ? "revoked" : "active",
    note: String(record.note || "").trim(),
    createdAt: Number(record.createdAt || 0),
    updatedAt: Number(record.updatedAt || record.createdAt || 0),
    expiresAt: Number(record.expiresAt || 0),
    activatedAt: Number(record.activatedAt || 0),
    activatedMachineId: String(record.activatedMachineId || "").trim()
  };
}

function getLicenseStatus(record, now) {
  const item = normalizeLicenseRecord(record);
  const currentTime = Number(now || Date.now());
  if (!item.key || !item.id) return "invalid";
  if (item.status === "revoked") return "revoked";
  if (!item.expiresAt || item.expiresAt <= currentTime) return "expired";
  return "active";
}

function encodeLicenseRecord(record) {
  return Buffer.from(JSON.stringify(normalizeLicenseRecord(record)), "utf8").toString("base64url");
}

function decodeLicenseRecord(value) {
  const text = String(value || "").trim();
  if (!text) return null;

  const json = Buffer.from(text, "base64url").toString("utf8");
  return normalizeLicenseRecord(JSON.parse(json));
}

function encodePayload(payload) {
  return Buffer.from(JSON.stringify(payload || {}), "utf8").toString("base64url");
}

function decodePayload(text) {
  return JSON.parse(Buffer.from(String(text || ""), "base64url").toString("utf8"));
}

function signLicenseRecord(record, privateKeyPem) {
  const payload = normalizeLicenseRecord(record);
  const payloadText = encodePayload(payload);
  const signature = crypto.sign(null, Buffer.from(payloadText), privateKeyPem).toString("base64url");
  return payloadText + "." + signature;
}

function verifySignedLicense(token, publicKeyPem) {
  const text = String(token || "").trim();
  const parts = text.split(".");
  if (parts.length !== 2) {
    throw new Error("INVALID_LICENSE_TOKEN");
  }

  const payloadText = parts[0];
  const signature = Buffer.from(parts[1], "base64url");
  const isValid = crypto.verify(null, Buffer.from(payloadText), publicKeyPem, signature);
  if (!isValid) {
    throw new Error("INVALID_LICENSE_SIGNATURE");
  }

  return normalizeLicenseRecord(decodePayload(payloadText));
}

function buildIssuerProfile(publicKeyPem) {
  return {
    version: 1,
    algorithm: "ed25519",
    publicKeyPem: String(publicKeyPem || "").trim()
  };
}

module.exports = {
  ADMIN_CONFIG_VERSION,
  LICENSE_RECORD_VERSION,
  DAY_MS,
  createAdminConfig,
  verifyAdminKey,
  generateIssuerKeyPair,
  buildLicenseKey,
  buildLicenseRecord,
  normalizeLicenseRecord,
  getLicenseStatus,
  encodeLicenseRecord,
  decodeLicenseRecord,
  signLicenseRecord,
  verifySignedLicense,
  buildIssuerProfile
};
