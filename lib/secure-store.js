"use strict";

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

function deriveKey(secret) {
  return crypto.scryptSync(String(secret || ""), "twitch-chat-viewer", KEY_LENGTH);
}

function encryptString(value, secret) {
  const plainText = String(value || "");
  if (!plainText) return "";

  const iv = crypto.randomBytes(IV_LENGTH);
  const key = deriveKey(secret);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64")
  ].join(".");
}

function decryptString(payload, secret) {
  const raw = String(payload || "").trim();
  if (!raw) return "";

  const parts = raw.split(".");
  if (parts.length !== 3) {
    throw new Error("INVALID_ENCRYPTED_PAYLOAD");
  }

  const [ivBase64, tagBase64, encryptedBase64] = parts;
  const iv = Buffer.from(ivBase64, "base64");
  const tag = Buffer.from(tagBase64, "base64");
  const encrypted = Buffer.from(encryptedBase64, "base64");
  const key = deriveKey(secret);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);

  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString("utf8");
}

module.exports = {
  encryptString,
  decryptString
};
