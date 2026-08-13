const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('twitch', {
  // Activation
  checkActivation: () => ipcRenderer.invoke('check-activation'),
  activateKey: (key) => ipcRenderer.invoke('activate-key', key),

  // Accounts
  getAccounts: () => ipcRenderer.invoke('get-accounts'),
  addAccount: (label, token, clientId) => ipcRenderer.invoke('add-account', label, token, clientId),
  updateAccount: (id, label, token, clientId) => ipcRenderer.invoke('update-account', id, label, token, clientId),
  deleteAccount: (id) => ipcRenderer.invoke('delete-account', id),

  // Channels
  joinChannel: (accountId, channel) => ipcRenderer.send('join-channel', accountId, channel),
  leaveChannel: (accountId, channel) => ipcRenderer.send('leave-channel', accountId, channel),
  sendChat: (accountId, channel, text, replyParentMsgId, replyParentUser, replyParentBody) => ipcRenderer.send('send-chat', accountId, channel, text, replyParentMsgId, replyParentUser, replyParentBody),
  reconnectAll: () => ipcRenderer.send('reconnect-all'),
  checkChannelsLive: (channelNames, preferredAccountId) => ipcRenderer.invoke('check-channels-live', channelNames, preferredAccountId),

  // Settings
  toggleNotifications: (enabled) => ipcRenderer.send('toggle-notifications', enabled),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  adminInit: (adminKey) => ipcRenderer.invoke('admin-init', adminKey),
  adminListLicenses: (adminKey) => ipcRenderer.invoke('admin-list-licenses', adminKey),
  adminCreateLicense: (adminKey, options) => ipcRenderer.invoke('admin-create-license', adminKey, options),
  adminUpdateLicense: (adminKey, licenseKey, patch) => ipcRenderer.invoke('admin-update-license', adminKey, licenseKey, patch),
  adminResetLocalLicenseState: (adminKey, includeAdminData) => ipcRenderer.invoke('admin-reset-local-license-state', adminKey, includeAdminData),
  setWindowOpacity: (opacity) => ipcRenderer.send('set-window-opacity', opacity),
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  saveAppSettings: (settings) => ipcRenderer.invoke('save-app-settings', settings),
  exportAppState: () => ipcRenderer.invoke('export-app-state'),
  importAppState: (payload) => ipcRenderer.invoke('import-app-state', payload),
  getSystemLogs: () => ipcRenderer.invoke('get-system-logs'),
  clearSystemLogs: () => ipcRenderer.invoke('clear-system-logs'),

  // Events
  onMessage: (cb) => ipcRenderer.on('chat-message', (_, msg) => cb(msg)),
  onChannelStatus: (cb) => ipcRenderer.on('channel-status', (_, s) => cb(s)),
  onChannelError: (cb) => ipcRenderer.on('channel-error', (_, e) => cb(e)),
  onChannelRoomState: (cb) => ipcRenderer.on('channel-roomstate', (_, state) => cb(state)),
  onChannelChatRestriction: (cb) => ipcRenderer.on('channel-chat-restriction', (_, state) => cb(state)),
  onSystemLogEntry: (cb) => ipcRenderer.on('system-log-entry', (_, entry) => cb(entry)),

  // Giveaway
  checkGiveawayActivation: () => ipcRenderer.invoke('check-giveaway-activation'),
  activateGiveawayKey: (key) => ipcRenderer.invoke('activate-giveaway-key', key),
  startGiveawayConnection: (channel, modBotAccountId) => ipcRenderer.send('start-giveaway-connection', channel, modBotAccountId),
  stopGiveawayConnection: () => ipcRenderer.send('stop-giveaway-connection'),
  sendGiveawayChat: (text) => ipcRenderer.send('send-giveaway-chat', text),
  megamuGetAwards: (dv, key) => ipcRenderer.invoke('megamu-get-awards', dv, key),
  onGiveawayMessage: (cb) => ipcRenderer.on('giveaway-chat-message', (_, msg) => cb(msg)),
  onGiveawayStatus: (cb) => ipcRenderer.on('giveaway-status', (_, s) => cb(s))
})
