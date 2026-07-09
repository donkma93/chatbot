"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  parseTwitchMessage,
  parseTwitchNotice,
  parseTwitchRoomState,
  isFollowersOnlyNotice,
  decodeTagValue
} = require("../lib/twitch-irc");

test("parseTwitchMessage parses PRIVMSG tags", () => {
  const line = "@badge-info=;badges=moderator/1;color=#1E90FF;display-name=DonPV;id=abc123;login=donpv;mod=1;reply-parent-msg-body=hello\\sworld;reply-parent-msg-id=parent1;reply-parent-display-name=Alice :donpv!donpv@donpv.tmi.twitch.tv PRIVMSG #demo :Xin chao";
  const msg = parseTwitchMessage(line);

  assert.equal(msg.username, "DonPV");
  assert.equal(msg.login, "donpv");
  assert.equal(msg.text, "Xin chao");
  assert.equal(msg.isMod, true);
  assert.equal(msg.replyParentMsgId, "parent1");
  assert.equal(msg.replyParentUser, "Alice");
  assert.equal(msg.replyParentBody, "hello world");
});

test("parseTwitchRoomState parses followers-only status", () => {
  const line = "@emote-only=0;followers-only=10;r9k=0;room-id=1;slow=5;subs-only=1 :tmi.twitch.tv ROOMSTATE #demo";
  const state = parseTwitchRoomState(line);

  assert.equal(state.channel, "demo");
  assert.equal(state.followersOnly, 10);
  assert.equal(state.slow, 5);
  assert.equal(state.subsOnly, true);
});

test("parseTwitchNotice identifies follower-only notice", () => {
  const line = "@msg-id=msg_followersonly :tmi.twitch.tv NOTICE #demo :This room is in followers-only mode.";
  const notice = parseTwitchNotice(line);

  assert.equal(notice.channel, "demo");
  assert.equal(isFollowersOnlyNotice(notice), true);
});

test("decodeTagValue decodes escaped reply body", () => {
  assert.equal(decodeTagValue("line1\\nline2\\sok"), "line1\nline2 ok");
});
