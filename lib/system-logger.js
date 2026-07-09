"use strict";

const fs = require("fs");

function createLogger(options) {
  const filePath = options && options.filePath;
  const maxEntries = Math.max(50, Number(options && options.maxEntries) || 500);
  let entries = [];

  function load() {
    if (!filePath || !fs.existsSync(filePath)) {
      entries = [];
      return entries;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      entries = Array.isArray(parsed) ? parsed.slice(-maxEntries) : [];
    } catch (error) {
      entries = [];
    }

    return entries;
  }

  function save() {
    if (!filePath) return;
    fs.writeFileSync(filePath, JSON.stringify(entries.slice(-maxEntries), null, 2), "utf8");
  }

  function log(level, area, message, meta) {
    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      timestamp: Date.now(),
      level: String(level || "info"),
      area: String(area || "app"),
      message: String(message || ""),
      meta: meta && typeof meta === "object" ? meta : {}
    };

    entries.push(entry);
    if (entries.length > maxEntries) {
      entries = entries.slice(-maxEntries);
    }
    save();
    return entry;
  }

  function clear() {
    entries = [];
    save();
  }

  function getEntries() {
    return entries.slice();
  }

  load();

  return {
    load,
    log,
    clear,
    getEntries
  };
}

module.exports = {
  createLogger
};
