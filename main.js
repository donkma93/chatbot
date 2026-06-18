const { app, BrowserWindow, ipcMain, Notification, shell } = require('./electron-api')
const path = require('path')
const fs = require('fs')
const WebSocket = require('ws')
const https = require('https')
const crypto = require('crypto')
const os = require('os')

let mainWindow = null
let notificationsEnabled = false

let ACCOUNTS_FILE
let ACTIVATION_FILE
let MACHINE_ID_FILE
let isActivated = false

let GIVEAWAY_ACTIVATION_FILE
let isGiveawayActivated = false

// accounts: [ { id, label, token, channels[] } ]
let accounts = []
let activeAccountId = null

// connectionKey = accountId + ':' + channel -> WebSocket
const connections = {}

// 50 Valid Activation Keys
const VALID_KEYS = [
  "TV-AI5Q-N097-0V3J","TV-L8VN-GNL2-0FPE","TV-UGDE-UEVE-XG25","TV-MO92-5SHH-UPPC","TV-7BET-HIGI-R5WP",
  "TV-KM7X-T86O-YWRE","TV-BLO6-VNX8-BLEL","TV-J3RP-1VD7-DWTY","TV-1M2Z-VHT5-ND3Y","TV-MUK3-4ZPZ-IVEG",
  "TV-GWAB-RW9D-H9T9","TV-Q4XH-0FFF-TXFG","TV-5B3C-U9PV-DYO0","TV-0CDV-3WGF-LJO8","TV-27DC-0D0G-CBSJ",
  "TV-N5DN-MCJ2-8X0D","TV-6S5D-YOA5-85GF","TV-HNDB-WDHD-6TWF","TV-9FUX-WAMG-OZ4T","TV-ROOT-MKE1-ERBW",
  "TV-0CH8-BN4B-AL2E","TV-O2LO-DKP9-44C7","TV-RUI0-J57H-TSOI","TV-INUC-VEXH-VDZH","TV-UCHZ-62LD-U6NU",
  "TV-PP27-B0LI-TJUB","TV-3FPB-HG6P-HEXS","TV-JILQ-5DPM-JNYV","TV-OO0W-0LJT-V3GF","TV-IT2T-ST65-B7Y6",
  "TV-AP2N-KEX4-Q4ZO","TV-3OK9-GKYJ-59P9","TV-PNQQ-5ZBY-5S1U","TV-8OZI-2Q75-ULWF","TV-9Q9N-2GKK-HHQ4",
  "TV-E2GC-E2JM-B5GY","TV-79B3-MPNY-CKI7","TV-UDVG-UZNT-QQZL","TV-WS0J-6AD4-7332","TV-746M-KBHK-WBA6",
  "TV-26R2-BMUZ-JIRZ","TV-EFJZ-4OWQ-P3IL","TV-IVPH-7FE1-UB5G","TV-MA4F-B4AL-9Q4A","TV-I0WW-6MDN-CHOY",
  "TV-ACYM-ZYXH-81ZP","TV-ABZ3-2NXQ-NAVS","TV-OPJZ-VJTL-UMQG","TV-2DRJ-UIS5-3QH1","TV-9UTM-QUDL-JRTE"
]

// 50 Valid Giveaway Keys
const VALID_GIVEAWAY_KEYS = [
  "GW-AI5Q-N097-0V3J","GW-L8VN-GNL2-0FPE","GW-UGDE-UEVE-XG25","GW-MO92-5SHH-UPPC","GW-7BET-HIGI-R5WP",
  "GW-KM7X-T86O-YWRE","GW-BLO6-VNX8-BLEL","GW-J3RP-1VD7-DWTY","GW-1M2Z-VHT5-ND3Y","GW-MUK3-4ZPZ-IVEG",
  "GW-GWAB-RW9D-H9T9","GW-Q4XH-0FFF-TXFG","GW-5B3C-U9PV-DYO0","GW-0CDV-3WGF-LJO8","GW-27DC-0D0G-CBSJ",
  "GW-N5DN-MCJ2-8X0D","GW-6S5D-YOA5-85GF","GW-HNDB-WDHD-6TWF","GW-9FUX-WAMG-OZ4T","GW-ROOT-MKE1-ERBW",
  "GW-0CH8-BN4B-AL2E","GW-O2LO-DKP9-44C7","GW-RUI0-J57H-TSOI","GW-INUC-VEXH-VDZH","GW-UCHZ-62LD-U6NU",
  "GW-PP27-B0LI-TJUB","GW-3FPB-HG6P-HEXS","GW-JILQ-5DPM-JNYV","GW-OO0W-0LJT-V3GF","GW-IT2T-ST65-B7Y6",
  "GW-AP2N-KEX4-Q4ZO","GW-3OK9-GKYJ-59P9","GW-PNQQ-5ZBY-5S1U","GW-8OZI-2Q75-ULWF","GW-9Q9N-2GKK-HHQ4",
  "GW-E2GC-E2JM-B5GY","GW-79B3-MPNY-CKI7","GW-UDVG-UZNT-QQZL","GW-WS0J-6AD4-7332","GW-746M-KBHK-WBA6",
  "GW-26R2-BMUZ-JIRZ","GW-EFJZ-4OWQ-P3IL","GW-IVPH-7FE1-UB5G","GW-MA4F-B4AL-9Q4A","GW-I0WW-6MDN-CHOY",
  "GW-ACYM-ZYXH-81ZP","GW-ABZ3-2NXQ-NAVS","GW-OPJZ-VJTL-UMQG","GW-2DRJ-UIS5-3QH1","GW-9UTM-QUDL-JRTE"
]

// ── License & Activation ────────────────────────────────────────
const APP_KEY = 'gvsxcl1q'

function getMachineId() {
  try {
    if (fs.existsSync(MACHINE_ID_FILE)) {
      return fs.readFileSync(MACHINE_ID_FILE, 'utf8').trim()
    }
  } catch (e) {
    console.error('Error reading machine ID file:', e)
  }
  
  try {
    const randomPart = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2) + Date.now().toString(36)
    const info = `${os.platform()}-${os.arch()}-${os.hostname()}-${os.userInfo().username}-${randomPart}`
    const machineId = crypto.createHash('sha256').update(info).digest('hex')
    fs.writeFileSync(MACHINE_ID_FILE, machineId, 'utf8')
    return machineId
  } catch (e) {
    const fallbackId = Math.random().toString(36).substring(2) + Date.now().toString(36)
    try {
      fs.writeFileSync(MACHINE_ID_FILE, fallbackId, 'utf8')
    } catch (err) {}
    return fallbackId
  }
}

function checkActivationLocal() {
  try {
    if (fs.existsSync(ACTIVATION_FILE)) {
      const act = JSON.parse(fs.readFileSync(ACTIVATION_FILE, 'utf8'))
      const currentMachineId = getMachineId()
      if (act && act.key && VALID_KEYS.includes(act.key) && act.machineId === currentMachineId) {
        isActivated = true
        return true
      }
    }
  } catch (e) {
    console.error('Error checking local activation:', e)
  }
  isActivated = false
  return false
}

function activateKeyOnline(key) {
  return new Promise((resolve) => {
    const machineId = getMachineId()
    const cleanKey = key.trim()
    
    if (!VALID_KEYS.includes(cleanKey)) {
      resolve({ success: false, message: 'Key không tồn tại hoặc không hợp lệ!' })
      return
    }

    // Call keyvalue.immanuel.co GET key
    const getOptions = {
      hostname: 'keyvalue.immanuel.co',
      path: `/api/KeyVal/GetValue/${APP_KEY}/${cleanKey}`,
      method: 'GET'
    }

    const req = https.request(getOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let registeredMachineId = ''
        try {
          if (data && data.trim()) {
            registeredMachineId = JSON.parse(data)
          }
        } catch (e) {
          registeredMachineId = data.replace(/^"|"$/g, '').trim()
        }

        registeredMachineId = (registeredMachineId || '').trim()

        // If empty, the key is not activated yet.
        if (!registeredMachineId) {
          // Register key to machineId using POST
          const postOptions = {
            hostname: 'keyvalue.immanuel.co',
            path: `/api/KeyVal/UpdateValue/${APP_KEY}/${cleanKey}/${machineId}`,
            method: 'POST',
            headers: {
              'Content-Length': '0'
            }
          }
          const postReq = https.request(postOptions, (postRes) => {
            let postResult = ''
            postRes.on('data', (chunk) => { postResult += chunk })
            postRes.on('end', () => {
              let isSaved = false
              try {
                isSaved = JSON.parse(postResult) === true
              } catch (e) {
                isSaved = postResult.trim() === 'true'
              }

              if (isSaved) {
                // Save activation locally
                const activationData = {
                  key: cleanKey,
                  machineId: machineId,
                  activatedAt: Date.now()
                }
                try {
                  fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(activationData, null, 2), 'utf8')
                  isActivated = true
                  resolve({ success: true, message: 'Kích hoạt bản quyền thành công!' })
                } catch (e) {
                  resolve({ success: false, message: 'Lưu thông tin kích hoạt cục bộ thất bại!' })
                }
              } else {
                resolve({ success: false, message: 'Đăng ký key lên máy chủ thất bại!' })
              }
            })
          })
          postReq.on('error', (err) => {
            resolve({ success: false, message: `Lỗi kết nối khi kích hoạt: ${err.message}` })
          })
          postReq.end()
        } else {
          // Key is already activated somewhere. Check if it matches our machine ID.
          if (registeredMachineId === machineId) {
            // Re-save activation locally just in case
            const activationData = {
              key: cleanKey,
              machineId: machineId,
              activatedAt: Date.now()
            }
            try {
              fs.writeFileSync(ACTIVATION_FILE, JSON.stringify(activationData, null, 2), 'utf8')
              isActivated = true
              resolve({ success: true, message: 'Kích hoạt bản quyền thành công!' })
            } catch (e) {
              resolve({ success: false, message: 'Lưu thông tin kích hoạt cục bộ thất bại!' })
            }
          } else {
            resolve({ success: false, message: 'Key đã được kích hoạt trên thiết bị khác!' })
          }
        }
      })
    })

    req.on('error', (err) => {
      resolve({ success: false, message: `Không thể kết nối đến máy chủ kích hoạt. Vui lòng kiểm tra kết nối mạng! (Lỗi: ${err.message})` })
    })
    req.end()
  })
}

function checkGiveawayActivationLocal() {
  try {
    if (fs.existsSync(GIVEAWAY_ACTIVATION_FILE)) {
      const act = JSON.parse(fs.readFileSync(GIVEAWAY_ACTIVATION_FILE, 'utf8'))
      const currentMachineId = getMachineId()
      if (act && act.key && VALID_GIVEAWAY_KEYS.includes(act.key) && act.machineId === currentMachineId) {
        isGiveawayActivated = true
        return true
      }
    }
  } catch (e) {
    console.error('Error checking local giveaway activation:', e)
  }
  isGiveawayActivated = false
  return false
}

function activateGiveawayKeyOnline(key) {
  return new Promise((resolve) => {
    const machineId = getMachineId()
    const cleanKey = key.trim()
    
    if (!VALID_GIVEAWAY_KEYS.includes(cleanKey)) {
      resolve({ success: false, message: 'Key Giveaway không tồn tại hoặc không hợp lệ!' })
      return
    }

    const getOptions = {
      hostname: 'keyvalue.immanuel.co',
      path: `/api/KeyVal/GetValue/${APP_KEY}/${cleanKey}`,
      method: 'GET'
    }

    const req = https.request(getOptions, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        let registeredMachineId = ''
        try {
          if (data && data.trim()) {
            registeredMachineId = JSON.parse(data)
          }
        } catch (e) {
          registeredMachineId = data.replace(/^"|"$/g, '').trim()
        }

        registeredMachineId = (registeredMachineId || '').trim()

        if (!registeredMachineId) {
          const postOptions = {
            hostname: 'keyvalue.immanuel.co',
            path: `/api/KeyVal/UpdateValue/${APP_KEY}/${cleanKey}/${machineId}`,
            method: 'POST',
            headers: {
              'Content-Length': '0'
            }
          }
          const postReq = https.request(postOptions, (postRes) => {
            let postResult = ''
            postRes.on('data', (chunk) => { postResult += chunk })
            postRes.on('end', () => {
              let isSaved = false
              try {
                isSaved = JSON.parse(postResult) === true
              } catch (e) {
                isSaved = postResult.trim() === 'true'
              }

              if (isSaved) {
                const activationData = {
                  key: cleanKey,
                  machineId: machineId,
                  activatedAt: Date.now()
                }
                try {
                  fs.writeFileSync(GIVEAWAY_ACTIVATION_FILE, JSON.stringify(activationData, null, 2), 'utf8')
                  isGiveawayActivated = true
                  resolve({ success: true, message: 'Kích hoạt Giveaway Premium thành công!' })
                } catch (e) {
                  resolve({ success: false, message: 'Lưu thông tin kích hoạt Giveaway cục bộ thất bại!' })
                }
              } else {
                resolve({ success: false, message: 'Đăng ký key lên máy chủ thất bại!' })
              }
            })
          })
          postReq.on('error', (err) => {
            resolve({ success: false, message: `Lỗi kết nối khi kích hoạt: ${err.message}` })
          })
          postReq.end()
        } else {
          if (registeredMachineId === machineId) {
            const activationData = {
              key: cleanKey,
              machineId: machineId,
              activatedAt: Date.now()
            }
            try {
              fs.writeFileSync(GIVEAWAY_ACTIVATION_FILE, JSON.stringify(activationData, null, 2), 'utf8')
              isGiveawayActivated = true
              resolve({ success: true, message: 'Kích hoạt Giveaway Premium thành công!' })
            } catch (e) {
              resolve({ success: false, message: 'Lưu thông tin kích hoạt Giveaway cục bộ thất bại!' })
            }
          } else {
            resolve({ success: false, message: 'Key đã được kích hoạt trên thiết bị khác!' })
          }
        }
      })
    })

    req.on('error', (err) => {
      resolve({ success: false, message: `Không thể kết nối đến máy chủ kích hoạt. Vui lòng kiểm tra kết nối mạng! (Lỗi: ${err.message})` })
    })
    req.end()
  })
}

// ── Persist accounts ──────────────────────────────────────────
function loadAccounts() {
  try {
    if (fs.existsSync(ACCOUNTS_FILE)) {
      accounts = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))
    }
  } catch (e) {
    accounts = []
  }
  if (!accounts || accounts.length === 0) {
    accounts = [{ id: 'default-anon', label: 'Ẩn danh', token: 'anonymous', channels: [] }]
    saveAccounts()
  }
}

function saveAccounts() {
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(accounts, null, 2), 'utf8')
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

// ── Helix Profile Fetcher ──────────────────────────────────────
function fetchUserProfile(token, clientId) {
  return new Promise((resolve, reject) => {
    if (!token || token === 'anonymous' || !clientId) {
      resolve(null)
      return
    }
    const cleanToken = token.startsWith('oauth:') ? token.substring(6) : token
    const options = {
      hostname: 'api.twitch.tv',
      path: '/helix/users',
      method: 'GET',
      headers: {
        'Authorization': 'Bearer ' + cleanToken,
        'Client-Id': clientId.trim()
      }
    }
    
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => { data += chunk })
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) {
            reject(new Error('Twitch API error: ' + res.statusCode))
            return
          }
          const parsed = JSON.parse(data)
          if (parsed && parsed.data && parsed.data.length > 0) {
            resolve({
              login: parsed.data[0].login,
              displayName: parsed.data[0].display_name,
              profileImageUrl: parsed.data[0].profile_image_url
            })
          } else {
            resolve(null)
          }
        } catch (e) {
          reject(e)
        }
      })
    })
    
    req.on('error', (err) => { reject(err) })
    req.end()
  })
}

// ── Account CRUD ──────────────────────────────────────────────
function addAccount(label, token, clientId, profileImageUrl) {
  var acc = {
    id: genId(),
    label: label.trim(),
    token: token.trim(),
    clientId: (clientId || '').trim(),
    profileImageUrl: profileImageUrl || '',
    channels: []
  }
  accounts.push(acc)
  saveAccounts()
  return acc
}

function updateAccount(id, label, token, clientId, profileImageUrl) {
  var acc = accounts.find(function(a) { return a.id === id })
  if (!acc) return null
  acc.label = label.trim()
  if (token) acc.token = token.trim()
  if (clientId !== undefined) acc.clientId = clientId.trim()
  if (profileImageUrl !== undefined) acc.profileImageUrl = profileImageUrl
  saveAccounts()
  return acc
}

function deleteAccount(id) {
  // Disconnect all channels of this account
  Object.keys(connections).forEach(function(key) {
    if (key.startsWith(id + ':')) {
      connections[key].close()
      delete connections[key]
    }
  })
  accounts = accounts.filter(function(a) { return a.id !== id })
  if (activeAccountId === id) {
    activeAccountId = accounts.length > 0 ? accounts[0].id : null
  }
  saveAccounts()
}

function getAccount(id) {
  return accounts.find(function(a) { return a.id === id }) || null
}

// ── Channel management per account ───────────────────────────
function addChannelToAccount(accountId, channel) {
  var acc = getAccount(accountId)
  if (!acc) return
  var ch = channel.toLowerCase().trim()
  if (acc.channels.indexOf(ch) === -1) {
    acc.channels.push(ch)
    saveAccounts()
  }
  connectChannel(accountId, ch)
}

function removeChannelFromAccount(accountId, channel) {
  var acc = getAccount(accountId)
  if (!acc) return
  var ch = channel.toLowerCase().trim()
  acc.channels = acc.channels.filter(function(c) { return c !== ch })
  saveAccounts()
  disconnectChannel(accountId, ch)
}

// ── WebSocket ─────────────────────────────────────────────────
function connKey(accountId, channel) {
  return accountId + ':' + channel
}

function connectChannel(accountId, channel) {
  var acc = getAccount(accountId)
  if (!acc) return
  var ch = channel.toLowerCase()
  var key = connKey(accountId, ch)
  if (connections[key]) return

  var ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
  connections[key] = ws

  // Twitch IRC: anonymous uses justinfan + any password
  // Authenticated uses oauth:TOKEN
  var isAnon = !acc.token || acc.token === 'anonymous'
  var nick = isAnon ? 'justinfan' + Math.floor(Math.random() * 99999) : acc.label.toLowerCase().replace(/\s+/g, '_')
  var pass = isAnon ? 'oauth:anonymous_token' : 'oauth:' + acc.token

  ws.on('open', function() {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    ws.send('PASS ' + pass)
    ws.send('NICK ' + nick)
    ws.send('JOIN #' + ch)
    if (mainWindow) mainWindow.webContents.send('channel-status', {
      accountId: accountId, channel: ch, connected: true
    })
  })

  ws.on('message', function(data) {
    var raw = data.toString()
    var lines = raw.split('\r\n').filter(Boolean)
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue }

      // Auth failure
      if (line.indexOf('Login authentication failed') !== -1) {
        if (mainWindow) mainWindow.webContents.send('channel-error', {
          accountId: accountId, channel: ch, error: 'Token không hợp lệ'
        })
        continue
      }

      var msg = parseTwitchMessage(line)
      if (msg && mainWindow) {
        msg.channel = ch
        msg.accountId = accountId
        mainWindow.webContents.send('chat-message', msg)
        if (notificationsEnabled && Notification.isSupported()) {
          new Notification({
            title: '#' + ch + ' — ' + msg.username,
            body: msg.text,
            silent: true
          }).show()
        }
      } else {
        if (line.includes('PRIVMSG') || line.includes('USERNOTICE')) {
          console.log(`[IRC Parse Skip] Line: ${line}`)
        }
      }
    }
  })

  ws.on('close', function() {
    delete connections[key]
    if (mainWindow) mainWindow.webContents.send('channel-status', {
      accountId: accountId, channel: ch, connected: false
    })
  })

  ws.on('error', function(err) {
    delete connections[key]
    if (mainWindow) mainWindow.webContents.send('channel-error', {
      accountId: accountId, channel: ch, error: err.message
    })
  })
}

function disconnectChannel(accountId, channel) {
  var key = connKey(accountId, channel.toLowerCase())
  if (connections[key]) { connections[key].close(); delete connections[key] }
}

function sendChat(accountId, channel, text, replyParentMsgId) {
  var key = connKey(accountId, channel.toLowerCase())
  var ws = connections[key]
  if (ws && ws.readyState === WebSocket.OPEN) {
    var command = ''
    if (replyParentMsgId) {
      command = '@reply-parent-msg-id=' + replyParentMsgId + ' '
    }
    command += 'PRIVMSG #' + channel.toLowerCase() + ' :' + text
    ws.send(command)
  }
}

// Giveaway WebSocket connection
let giveawayWs = null
let giveawayChannel = null
let giveawayModBotAccountId = null

function connectGiveawayChannel(channel, modBotAccountId) {
  stopGiveawayChannel()

  var ch = channel.toLowerCase()
  giveawayChannel = ch
  giveawayModBotAccountId = modBotAccountId

  var ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
  giveawayWs = ws

  var acc = null
  if (modBotAccountId) {
    acc = getAccount(modBotAccountId)
  }

  var isAnon = !acc || !acc.token || acc.token === 'anonymous'
  var nick = isAnon ? 'justinfan' + Math.floor(Math.random() * 99999) : acc.label.toLowerCase().replace(/\s+/g, '_')
  var pass = isAnon ? 'oauth:anonymous_token' : 'oauth:' + acc.token

  ws.on('open', function() {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    ws.send('PASS ' + pass)
    ws.send('NICK ' + nick)
    ws.send('JOIN #' + ch)
    if (mainWindow) mainWindow.webContents.send('giveaway-status', { connected: true })
  })

  ws.on('message', function(data) {
    var raw = data.toString()
    var lines = raw.split('\r\n').filter(Boolean)
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue }

      var msg = parseTwitchMessage(line)
      if (msg && mainWindow) {
        msg.channel = ch
        mainWindow.webContents.send('giveaway-chat-message', msg)
      }
    }
  })

  ws.on('close', function() {
    if (giveawayWs === ws) {
      giveawayWs = null
      if (mainWindow) mainWindow.webContents.send('giveaway-status', { connected: false })
    }
  })

  ws.on('error', function(err) {
    if (giveawayWs === ws) {
      giveawayWs = null
      if (mainWindow) mainWindow.webContents.send('giveaway-status', { connected: false, error: err.message })
    }
  })
}

function stopGiveawayChannel() {
  if (giveawayWs) {
    try {
      giveawayWs.close()
    } catch(e){}
    giveawayWs = null
  }
}

function sendGiveawayChat(text) {
  if (giveawayWs && giveawayWs.readyState === WebSocket.OPEN && giveawayChannel) {
    giveawayWs.send('PRIVMSG #' + giveawayChannel + ' :' + text)
  }
}

function decodeTagValue(val) {
  if (!val) return ''
  return val
    .replace(/\\s/g, ' ')
    .replace(/\\:/g, ';')
    .replace(/\\r/g, '\r')
    .replace(/\\n/g, '\n')
    .replace(/\\\\/g, '\\')
}

// ── IRC parser ────────────────────────────────────────────────
function parseTwitchMessage(line) {
  var tags = {}
  var rest = line
  if (line.startsWith('@')) {
    var tagEnd = line.indexOf(' ')
    var tagStr = line.slice(1, tagEnd)
    rest = line.slice(tagEnd + 1)
    tagStr.split(';').forEach(function(part) {
      var kv = part.split('=')
      tags[kv[0]] = kv[1] || ''
    })
  }
  
  var username = ''
  var text = ''
  var match = rest.match(/^:(\S+)!\S+ PRIVMSG #(\S+) :([\s\S]+)$/)
  
  if (match) {
    username = tags['display-name'] || match[1]
    text = match[3]
  } else {
    // Parse USERNOTICE (e.g. Chat Announcements /announce used by Nightbot)
    var userNoticeMatch = rest.match(/^:tmi\.twitch\.tv USERNOTICE #(\S+) :([\s\S]+)$/)
    if (userNoticeMatch) {
      username = tags['display-name'] || tags['login'] || 'Twitch'
      text = userNoticeMatch[2]
    } else {
      return null
    }
  }

  var color = tags['color'] || '#' + intToHex(simpleHash(username))
  var badges = tags['badges'] || ''
  
  var replyParentMsgId = tags['reply-parent-msg-id'] || ''
  var replyParentUser = tags['reply-parent-display-name'] || tags['reply-parent-user-login'] || ''
  var replyParentBody = tags['reply-parent-msg-body'] ? decodeTagValue(tags['reply-parent-msg-body']) : ''
  
  return {
    id: tags['id'] || '',
    username: username,
    color: color,
    text: text,
    isMod: badges.indexOf('moderator') !== -1 || tags['mod'] === '1',
    isSub: badges.indexOf('subscriber') !== -1,
    isBroadcaster: badges.indexOf('broadcaster') !== -1,
    isVip: badges.indexOf('vip') !== -1,
    timestamp: Date.now(),
    replyParentMsgId: replyParentMsgId,
    replyParentUser: replyParentUser,
    replyParentBody: replyParentBody
  }
}

function simpleHash(str) {
  var h = 0
  for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffff
  return h
}

function intToHex(n) {
  var r = Math.max(80, (n >> 16) & 0xff)
  var g = Math.max(80, (n >> 8) & 0xff)
  var b = Math.max(80, n & 0xff)
  return [r, g, b].map(function(x) { return x.toString(16).padStart(2, '0') }).join('')
}

// ── Window ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 680,
    height: 780,
    minWidth: 480,
    minHeight: 520,
    title: 'Twitch Chat Viewer',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    backgroundColor: '#0e0e10'
  })

  mainWindow.loadFile('index.html')

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console] ${message} (at ${sourceId}:${line})`);
  });

  mainWindow.on('closed', function() {
    Object.keys(connections).forEach(function(k) { connections[k].close() })
    mainWindow = null
  })
}

// ── IPC ───────────────────────────────────────────────────────
ipcMain.handle('check-activation', function() {
  return {
    isActivated: isActivated,
    machineId: getMachineId()
  }
})

ipcMain.handle('get-app-version', function() {
  return app.getVersion()
})

ipcMain.handle('activate-key', async function(event, key) {
  return await activateKeyOnline(key)
})

ipcMain.handle('check-giveaway-activation', function() {
  return {
    isActivated: isGiveawayActivated,
    machineId: getMachineId()
  }
})

ipcMain.handle('activate-giveaway-key', async function(event, key) {
  return await activateGiveawayKeyOnline(key)
})

ipcMain.on('start-giveaway-connection', function(event, channel, modBotAccountId) {
  connectGiveawayChannel(channel, modBotAccountId)
  
  // Background join for all authenticated accounts to process Auto Bot
  var ch = channel.toLowerCase().trim()
  if (ch) {
    accounts.forEach(function(acc) {
      if (acc.token && acc.token !== 'anonymous') {
        connectChannel(acc.id, ch)
      }
    })
  }
})

ipcMain.on('stop-giveaway-connection', function() {
  var channelToDisconnect = giveawayChannel
  stopGiveawayChannel()
  
  if (channelToDisconnect) {
    var ch = channelToDisconnect.toLowerCase().trim()
    accounts.forEach(function(acc) {
      if (acc.channels.indexOf(ch) === -1) {
        disconnectChannel(acc.id, ch)
      }
    })
  }
})

ipcMain.on('send-giveaway-chat', function(event, text) {
  sendGiveawayChat(text)
})

ipcMain.handle('get-accounts', function() {
  return accounts.map(function(a) {
    return {
      id: a.id,
      label: a.label,
      channels: a.channels,
      hasToken: !!a.token && a.token !== 'anonymous',
      clientId: a.clientId || '',
      profileImageUrl: a.profileImageUrl || ''
    }
  })
})

ipcMain.handle('add-account', async function(event, label, token, clientId) {
  if (!isActivated && token !== 'anonymous') {
    throw new Error('Chưa kích hoạt bản quyền! Không thể thêm tài khoản Twitch thật.')
  }
  var profileImageUrl = ''
  if (token && token !== 'anonymous' && clientId) {
    try {
      var profile = await fetchUserProfile(token, clientId)
      if (profile) {
        profileImageUrl = profile.profileImageUrl
        label = profile.displayName
      }
    } catch (e) {
      console.error('Helix API Error:', e.message)
    }
  }
  var acc = addAccount(label, token, clientId, profileImageUrl)
  return {
    id: acc.id,
    label: acc.label,
    channels: acc.channels,
    hasToken: !!acc.token && acc.token !== 'anonymous',
    clientId: acc.clientId || '',
    profileImageUrl: acc.profileImageUrl || ''
  }
})

ipcMain.handle('update-account', async function(event, id, label, token, clientId) {
  if (!isActivated && token !== 'anonymous') {
    throw new Error('Chưa kích hoạt bản quyền! Không thể sửa tài khoản Twitch thật.')
  }
  var profileImageUrl = undefined
  if (token && token !== 'anonymous' && clientId) {
    try {
      var profile = await fetchUserProfile(token, clientId)
      if (profile) {
        profileImageUrl = profile.profileImageUrl
        label = profile.displayName
      }
    } catch (e) {
      console.error('Helix API Error:', e.message)
    }
  }
  var acc = updateAccount(id, label, token, clientId, profileImageUrl)
  if (!acc) return null
  return {
    id: acc.id,
    label: acc.label,
    channels: acc.channels,
    hasToken: !!acc.token && acc.token !== 'anonymous',
    clientId: acc.clientId || '',
    profileImageUrl: acc.profileImageUrl || ''
  }
})

ipcMain.handle('delete-account', function(event, id) {
  if (id === 'default-anon') {
    throw new Error('Không thể xóa tài khoản mặc định.')
  }
  deleteAccount(id)
  return true
})

ipcMain.on('join-channel', function(event, accountId, channel) {
  addChannelToAccount(accountId, channel)
})

ipcMain.on('leave-channel', function(event, accountId, channel) {
  removeChannelFromAccount(accountId, channel)
})

ipcMain.on('send-chat', function(event, accountId, channel, text, replyParentMsgId, replyParentUser, replyParentBody) {
  if (text && text.trim()) {
    var trimmed = text.trim()
    sendChat(accountId, channel, trimmed, replyParentMsgId)
    
    // Echo back locally since Twitch IRC doesn't reflect own PRIVMSG to the sender
    var acc = getAccount(accountId)
    if (acc && mainWindow) {
      var username = acc.label
      var color = '#' + intToHex(simpleHash(username))
      var isBroadcaster = username.toLowerCase() === channel.toLowerCase()
      mainWindow.webContents.send('chat-message', {
        id: 'local-' + Date.now(),
        accountId: accountId,
        channel: channel.toLowerCase(),
        username: username,
        color: color,
        text: trimmed,
        isMod: isBroadcaster,
        isSub: false,
        isBroadcaster: isBroadcaster,
        isVip: false,
        timestamp: Date.now(),
        replyParentMsgId: replyParentMsgId || '',
        replyParentUser: replyParentUser || '',
        replyParentBody: replyParentBody || ''
      })
    }
  }
})

ipcMain.on('toggle-notifications', function(event, enabled) {
  notificationsEnabled = enabled
})

ipcMain.on('set-window-opacity', function(event, opacity) {
  if (mainWindow) {
    try {
      mainWindow.setOpacity(opacity)
    } catch (e) {
      console.error('Failed to set window opacity:', e)
    }
  }
})

ipcMain.on('reconnect-all', function() {
  accounts.forEach(function(acc) {
    acc.channels.forEach(function(ch) { connectChannel(acc.id, ch) })
  })
})

ipcMain.on('open-external', function(event, url) {
  if (url) shell.openExternal(url)
})

// ── Boot ──────────────────────────────────────────────────────
app.whenReady().then(function() {
  ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json')
  ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json')
  GIVEAWAY_ACTIVATION_FILE = path.join(app.getPath('userData'), 'giveaway_activation.json')
  MACHINE_ID_FILE = path.join(app.getPath('userData'), 'machine.id')
  
  loadAccounts()
  checkActivationLocal()
  checkGiveawayActivationLocal()
  createWindow()

  // Auto Update check (Method 1: electron-updater)
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true
    
    autoUpdater.on('update-available', function() {
      console.log('Update available! Downloading in background...')
    })

    autoUpdater.on('update-downloaded', function() {
      console.log('Update downloaded. Prompting user to restart.')
      const { dialog } = require('electron')
      dialog.showMessageBox({
        type: 'info',
        title: 'Cập Nhật Hoàn Tất 🚀',
        message: 'Bản cập nhật mới đã tải xuống hoàn tất. Bạn có muốn khởi động lại ứng dụng để áp dụng cập nhật ngay bây giờ?',
        buttons: ['Khởi động lại ngay', 'Để sau'],
        defaultId: 0
      }).then(function(result) {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
    })

    autoUpdater.on('error', function(err) {
      console.error('Lỗi khi tự động cập nhật:', err)
    })

    // Run update check
    autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.error('Không thể tải module auto updater:', e)
  }
})

app.on('window-all-closed', function() {
  Object.keys(connections).forEach(function(k) { connections[k].close() })
  app.quit()
})
