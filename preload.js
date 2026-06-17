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

  // Settings
  toggleNotifications: (enabled) => ipcRenderer.send('toggle-notifications', enabled),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // Events
  onMessage: (cb) => ipcRenderer.on('chat-message', (_, msg) => cb(msg)),
  onChannelStatus: (cb) => ipcRenderer.on('channel-status', (_, s) => cb(s)),
  onChannelError: (cb) => ipcRenderer.on('channel-error', (_, e) => cb(e))
})
