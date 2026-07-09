"use strict";

const FOLLOWERS_ONLY_NOTICE_IDS = {
  msg_followersonly: true,
  msg_followersonly_followed: true,
  msg_followersonly_zero: true
};

function normalizeIdentity(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function parseIrcMessageParts(line) {
  const tags = {};
  let rest = line;

  if (line.startsWith("@")) {
    const tagEnd = line.indexOf(" ");
    const tagStr = line.slice(1, tagEnd);
    rest = line.slice(tagEnd + 1);
    tagStr.split(";").forEach(function (part) {
      const kv = part.split("=");
      tags[kv[0]] = kv[1] || "";
    });
  }

  return { tags, rest };
}

function decodeTagValue(val) {
  if (!val) return "";
  return val
    .replace(/\\s/g, " ")
    .replace(/\\:/g, ";")
    .replace(/\\r/g, "\r")
    .replace(/\\n/g, "\n")
    .replace(/\\\\/g, "\\");
}

function parseTwitchRoomState(line) {
  const parsed = parseIrcMessageParts(line);
  const match = parsed.rest.match(/^:tmi\.twitch\.tv ROOMSTATE #(\S+)$/);
  if (!match) return null;

  const followersOnlyRaw = parsed.tags["followers-only"];
  const slowRaw = parsed.tags["slow"];
  const followersOnly = followersOnlyRaw !== undefined && followersOnlyRaw !== ""
    ? parseInt(followersOnlyRaw, 10)
    : null;
  const slow = slowRaw !== undefined && slowRaw !== "" ? parseInt(slowRaw, 10) : null;

  return {
    channel: normalizeIdentity(match[1]),
    followersOnly: Number.isFinite(followersOnly) ? followersOnly : null,
    emoteOnly: parsed.tags["emote-only"] === "1",
    slow: Number.isFinite(slow) ? slow : null,
    subsOnly: parsed.tags["subs-only"] === "1"
  };
}

function parseTwitchNotice(line) {
  const parsed = parseIrcMessageParts(line);
  const match = parsed.rest.match(/^:tmi\.twitch\.tv NOTICE (\*|#(\S+)) :([\s\S]+)$/);
  if (!match) return null;

  return {
    channel: normalizeIdentity(match[2] || ""),
    msgId: parsed.tags["msg-id"] || "",
    text: match[3]
  };
}

function isFollowersOnlyNotice(notice) {
  if (!notice) return false;
  if (notice.msgId && FOLLOWERS_ONLY_NOTICE_IDS[notice.msgId]) return true;
  return /followers-only/i.test(notice.text || "");
}

function simpleHash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffff;
  return h;
}

function intToHex(n) {
  const r = Math.max(80, (n >> 16) & 0xff);
  const g = Math.max(80, (n >> 8) & 0xff);
  const b = Math.max(80, n & 0xff);
  return [r, g, b].map(function (x) { return x.toString(16).padStart(2, "0"); }).join("");
}

function parseTwitchMessage(line) {
  const parsed = parseIrcMessageParts(line);
  const tags = parsed.tags;
  const rest = parsed.rest;

  let username = "";
  let login = "";
  let text = "";
  const match = rest.match(/^:(\S+)!\S+ PRIVMSG #(\S+) :([\s\S]+)$/);

  if (match) {
    login = tags.login || match[1] || "";
    username = tags["display-name"] || match[1];
    text = match[3];
  } else {
    const userNoticeMatch = rest.match(/^:tmi\.twitch\.tv USERNOTICE #(\S+) :([\s\S]+)$/);
    if (userNoticeMatch) {
      login = tags.login || "";
      username = tags["display-name"] || tags.login || "Twitch";
      text = userNoticeMatch[2];
    } else {
      return null;
    }
  }

  const color = tags.color || ("#" + intToHex(simpleHash(username)));
  const badges = tags.badges || "";

  return {
    id: tags.id || "",
    username: username,
    login: normalizeIdentity(login),
    color: color,
    text: text,
    isMod: badges.indexOf("moderator") !== -1 || tags.mod === "1",
    isSub: badges.indexOf("subscriber") !== -1,
    isBroadcaster: badges.indexOf("broadcaster") !== -1,
    isVip: badges.indexOf("vip") !== -1,
    timestamp: Date.now(),
    replyParentMsgId: tags["reply-parent-msg-id"] || "",
    replyParentUser: tags["reply-parent-display-name"] || tags["reply-parent-user-login"] || "",
    replyParentBody: tags["reply-parent-msg-body"] ? decodeTagValue(tags["reply-parent-msg-body"]) : ""
  };
}

module.exports = {
  FOLLOWERS_ONLY_NOTICE_IDS,
  normalizeIdentity,
  parseIrcMessageParts,
  decodeTagValue,
  parseTwitchRoomState,
  parseTwitchNotice,
  isFollowersOnlyNotice,
  parseTwitchMessage,
  simpleHash,
  intToHex
};
