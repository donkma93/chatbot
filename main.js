const { app, BrowserWindow, ipcMain, Notification, shell } = require('./electron-api')
const path = require('path')
const fs = require('fs')
const WebSocket = require('ws')
const https = require('https')
const crypto = require('crypto')
const os = require('os')
const { encryptString, decryptString } = require('./lib/secure-store')
const { createLogger } = require('./lib/system-logger')
const {
  ACCOUNT_SCHEMA_VERSION,
  APP_SETTINGS_DEFAULTS,
  mergeAppSettings,
  applyTelemetryPatch,
  buildSessionSnapshot,
  needsAccountStorageRewrite
} = require('./lib/app-state')
const {
  createAdminConfig,
  verifyAdminKey,
  generateIssuerKeyPair,
  buildLicenseRecord,
  normalizeLicenseRecord,
  getLicenseStatus,
  signLicenseRecord,
  verifySignedLicense,
  buildIssuerProfile
} = require('./lib/license-manager')
const {
  parseTwitchRoomState,
  parseTwitchNotice,
  isFollowersOnlyNotice,
  parseTwitchMessage,
  simpleHash,
  intToHex
} = require('./lib/twitch-irc')

let mainWindow = null
let notificationsEnabled = false

let ACCOUNTS_FILE
let ACTIVATION_FILE
let LICENSE_STORE_FILE
let ADMIN_CONFIG_FILE
let ISSUER_PROFILE_FILE
let ISSUER_PRIVATE_FILE
let MACHINE_ID_FILE
let APP_SETTINGS_FILE
let SYSTEM_LOG_FILE
let isActivated = false

let GIVEAWAY_ACTIVATION_FILE
let isGiveawayActivated = false
let systemLogger = null

// accounts: [ { id, label, token, channels[] } ]
let accounts = []
let activeAccountId = null

// connectionKey = accountId + ':' + channel -> WebSocket
const connections = {}
const reconnectTimers = {}
const reconnectAttempts = {}
const manualDisconnects = {}
const authFailedConnections = {}

// 50 Valid Activation Keys
const VALID_KEYS = [
  "TV-AI5Q-N097-0V3J", "TV-L8VN-GNL2-0FPE", "TV-UGDE-UEVE-XG25", "TV-MO92-5SHH-UPPC", "TV-7BET-HIGI-R5WP",
  "TV-KM7X-T86O-YWRE", "TV-BLO6-VNX8-BLEL", "TV-J3RP-1VD7-DWTY", "TV-1M2Z-VHT5-ND3Y", "TV-MUK3-4ZPZ-IVEG",
  "TV-GWAB-RW9D-H9T9", "TV-Q4XH-0FFF-TXFG", "TV-5B3C-U9PV-DYO0", "TV-0CDV-3WGF-LJO8", "TV-27DC-0D0G-CBSJ",
  "TV-N5DN-MCJ2-8X0D", "TV-6S5D-YOA5-85GF", "TV-HNDB-WDHD-6TWF", "TV-9FUX-WAMG-OZ4T", "TV-ROOT-MKE1-ERBW",
  "TV-0CH8-BN4B-AL2E", "TV-O2LO-DKP9-44C7", "TV-RUI0-J57H-TSOI", "TV-INUC-VEXH-VDZH", "TV-UCHZ-62LD-U6NU",
  "TV-PP27-B0LI-TJUB", "TV-3FPB-HG6P-HEXS", "TV-JILQ-5DPM-JNYV", "TV-OO0W-0LJT-V3GF", "TV-IT2T-ST65-B7Y6",
  "TV-AP2N-KEX4-Q4ZO", "TV-3OK9-GKYJ-59P9", "TV-PNQQ-5ZBY-5S1U", "TV-8OZI-2Q75-ULWF", "TV-9Q9N-2GKK-HHQ4",
  "TV-E2GC-E2JM-B5GY", "TV-79B3-MPNY-CKI7", "TV-UDVG-UZNT-QQZL", "TV-WS0J-6AD4-7332", "TV-746M-KBHK-WBA6",
  "TV-26R2-BMUZ-JIRZ", "TV-EFJZ-4OWQ-P3IL", "TV-IVPH-7FE1-UB5G", "TV-MA4F-B4AL-9Q4A", "TV-I0WW-6MDN-CHOY",
  "TV-ACYM-ZYXH-81ZP", "TV-ABZ3-2NXQ-NAVS", "TV-OPJZ-VJTL-UMQG", "TV-2DRJ-UIS5-3QH1", "TV-9UTM-QUDL-JRTE"
]

// 50 Valid Giveaway Keys
const VALID_GIVEAWAY_KEYS = [
  "GW-AI5Q-N097-0V3J", "GW-L8VN-GNL2-0FPE", "GW-UGDE-UEVE-XG25", "GW-MO92-5SHH-UPPC", "GW-7BET-HIGI-R5WP",
  "GW-KM7X-T86O-YWRE", "GW-BLO6-VNX8-BLEL", "GW-J3RP-1VD7-DWTY", "GW-1M2Z-VHT5-ND3Y", "GW-MUK3-4ZPZ-IVEG",
  "GW-GWAB-RW9D-H9T9", "GW-Q4XH-0FFF-TXFG", "GW-5B3C-U9PV-DYO0", "GW-0CDV-3WGF-LJO8", "GW-27DC-0D0G-CBSJ",
  "GW-N5DN-MCJ2-8X0D", "GW-6S5D-YOA5-85GF", "GW-HNDB-WDHD-6TWF", "GW-9FUX-WAMG-OZ4T", "GW-ROOT-MKE1-ERBW",
  "GW-0CH8-BN4B-AL2E", "GW-O2LO-DKP9-44C7", "GW-RUI0-J57H-TSOI", "GW-INUC-VEXH-VDZH", "GW-UCHZ-62LD-U6NU",
  "GW-PP27-B0LI-TJUB", "GW-3FPB-HG6P-HEXS", "GW-JILQ-5DPM-JNYV", "GW-OO0W-0LJT-V3GF", "GW-IT2T-ST65-B7Y6",
  "GW-AP2N-KEX4-Q4ZO", "GW-3OK9-GKYJ-59P9", "GW-PNQQ-5ZBY-5S1U", "GW-8OZI-2Q75-ULWF", "GW-9Q9N-2GKK-HHQ4",
  "GW-E2GC-E2JM-B5GY", "GW-79B3-MPNY-CKI7", "GW-UDVG-UZNT-QQZL", "GW-WS0J-6AD4-7332", "GW-746M-KBHK-WBA6",
  "GW-26R2-BMUZ-JIRZ", "GW-EFJZ-4OWQ-P3IL", "GW-IVPH-7FE1-UB5G", "GW-MA4F-B4AL-9Q4A", "GW-I0WW-6MDN-CHOY",
  "GW-ACYM-ZYXH-81ZP", "GW-ABZ3-2NXQ-NAVS", "GW-OPJZ-VJTL-UMQG", "GW-2DRJ-UIS5-3QH1", "GW-9UTM-QUDL-JRTE"
]

// ── License & Activation ────────────────────────────────────────
const APP_KEY = 'gvsxcl1q'
const LICENSE_DURATION_DAYS = 90
const LICENSE_DURATION_MS = LICENSE_DURATION_DAYS * 24 * 60 * 60 * 1000
const OWNER_OVERRIDE_KEY_HASH = 'ad09e52c1378eaca9dd3c53496c06d855f190bc2f2d73a0aa3b400599b6d61a9'
const OWNER_OVERRIDE_STORAGE_KEY = 'OWNER-OVERRIDE-DONPV'
const OWNER_OVERRIDE_DURATION_DAYS = 36500
const OWNER_OVERRIDE_DURATION_MS = OWNER_OVERRIDE_DURATION_DAYS * 24 * 60 * 60 * 1000

function logSystem(level, area, message, meta) {
  if (!systemLogger) return null

  const entry = systemLogger.log(level, area, message, meta)
  if (mainWindow && mainWindow.webContents) {
    mainWindow.webContents.send('system-log-entry', entry)
  }
  return entry
}

function getStorageSecret() {
  return getMachineId() + ':' + APP_KEY
}

function buildExpiryTimestamp(activatedAt) {
  const base = Number(activatedAt || Date.now())
  return base + LICENSE_DURATION_MS
}

function isOwnerOverrideKey(value) {
  const text = String(value || '').trim()
  if (!text) return false
  const hash = crypto.createHash('sha256').update(text).digest('hex')
  return hash === OWNER_OVERRIDE_KEY_HASH
}

function buildOwnerOverrideExpiryTimestamp(activatedAt) {
  const base = Number(activatedAt || Date.now())
  return base + OWNER_OVERRIDE_DURATION_MS
}

function isOwnerOverrideActivationRecord(record) {
  return !!(record && record.key === OWNER_OVERRIDE_STORAGE_KEY && record.expiresAt > Date.now())
}

function buildOwnerOverrideActivationRecord(machineId, activatedAt) {
  const startedAt = Number(activatedAt || Date.now())
  return {
    key: OWNER_OVERRIDE_STORAGE_KEY,
    machineId: machineId,
    activatedAt: startedAt,
    expiresAt: buildOwnerOverrideExpiryTimestamp(startedAt)
  }
}

function normalizeLocalActivationRecord(record) {
  const item = record && typeof record === 'object' ? record : {}
  const activatedAt = Number(item.activatedAt || Date.now())
  return {
    key: String(item.key || '').trim(),
    machineId: String(item.machineId || '').trim(),
    activatedAt: activatedAt,
    expiresAt: Number(item.expiresAt || buildExpiryTimestamp(activatedAt))
  }
}

function parseRemoteActivationValue(rawValue) {
  const text = String(rawValue || '').trim()
  if (!text) return null

  if (text.startsWith('v2_')) {
    const decoded = Buffer.from(text.slice(3), 'base64url').toString('utf8')
    const parsed = JSON.parse(decoded)
    const activatedAt = Number(parsed.activatedAt || Date.now())
    return {
      machineId: String(parsed.machineId || '').trim(),
      activatedAt: activatedAt,
      expiresAt: Number(parsed.expiresAt || buildExpiryTimestamp(activatedAt)),
      legacy: false
    }
  }

  return {
    machineId: text,
    activatedAt: 0,
    expiresAt: 0,
    legacy: true
  }
}

function serializeRemoteActivationValue(record) {
  const normalized = normalizeLocalActivationRecord(record)
  const payload = Buffer.from(JSON.stringify(normalized), 'utf8').toString('base64url')
  return 'v2_' + payload
}

function readLocalActivationFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      return normalizeLocalActivationRecord(JSON.parse(fs.readFileSync(filePath, 'utf8')))
    }
  } catch (error) {
    console.error('Error reading activation file:', error)
  }
  return null
}

function writeLocalActivationFile(filePath, record) {
  const normalized = normalizeLocalActivationRecord(record)
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

function fetchRemoteActivationValue(key, callback) {
  const cleanKey = String(key || '').trim()
  const req = https.request({
    hostname: 'keyvalue.immanuel.co',
    path: `/api/KeyVal/GetValue/${APP_KEY}/${encodeURIComponent(cleanKey)}`,
    method: 'GET'
  }, function (res) {
    let data = ''
    res.on('data', function (chunk) { data += chunk })
    res.on('end', function () {
      let parsed = ''
      try {
        if (data && data.trim()) {
          parsed = JSON.parse(data)
        }
      } catch (e) {
        parsed = data.replace(/^"|"$/g, '').trim()
      }
      callback(null, parseRemoteActivationValue(parsed))
    })
  })

  req.on('error', function (err) {
    callback(err)
  })
  req.end()
}

function saveRemoteActivationValue(key, record, callback) {
  const payload = serializeRemoteActivationValue(record)
  const req = https.request({
    hostname: 'keyvalue.immanuel.co',
    path: `/api/KeyVal/UpdateValue/${APP_KEY}/${encodeURIComponent(String(key || '').trim())}/${encodeURIComponent(payload)}`,
    method: 'POST',
    headers: {
      'Content-Length': '0'
    }
  }, function (res) {
    let data = ''
    res.on('data', function (chunk) { data += chunk })
    res.on('end', function () {
      let ok = false
      try {
        ok = JSON.parse(data) === true
      } catch (e) {
        ok = String(data || '').trim() === 'true'
      }
      callback(null, ok)
    })
  })

  req.on('error', function (err) {
    callback(err)
  })
  req.end()
}

function normalizeLicenseStore(raw) {
  const input = raw && typeof raw === 'object' ? raw : {}
  const licenses = Array.isArray(input.licenses)
    ? input.licenses.map(function (item) { return normalizeLicenseRecord(item) }).filter(function (item) { return !!item.key })
    : []

  return {
    version: 1,
    updatedAt: Number(input.updatedAt || 0),
    licenses: licenses
  }
}

function loadLicenseStore() {
  try {
    if (LICENSE_STORE_FILE && fs.existsSync(LICENSE_STORE_FILE)) {
      return normalizeLicenseStore(JSON.parse(fs.readFileSync(LICENSE_STORE_FILE, 'utf8')))
    }
  } catch (error) {
    console.error('Error loading license store:', error)
  }

  return normalizeLicenseStore()
}

function saveLicenseStore(store) {
  const payload = normalizeLicenseStore({
    ...(store || {}),
    updatedAt: Date.now()
  })
  fs.writeFileSync(LICENSE_STORE_FILE, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

function loadAdminConfig() {
  try {
    if (ADMIN_CONFIG_FILE && fs.existsSync(ADMIN_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(ADMIN_CONFIG_FILE, 'utf8'))
    }
  } catch (error) {
    console.error('Error loading admin config:', error)
  }

  return null
}

function saveAdminConfig(config) {
  fs.writeFileSync(ADMIN_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8')
  return config
}

function loadIssuerProfile() {
  try {
    if (ISSUER_PROFILE_FILE && fs.existsSync(ISSUER_PROFILE_FILE)) {
      return JSON.parse(fs.readFileSync(ISSUER_PROFILE_FILE, 'utf8'))
    }
  } catch (error) {
    console.error('Error loading issuer profile:', error)
  }
  return null
}

function saveIssuerProfile(profile) {
  fs.writeFileSync(ISSUER_PROFILE_FILE, JSON.stringify(profile, null, 2), 'utf8')
  return profile
}

function loadIssuerPrivateKey() {
  try {
    if (ISSUER_PRIVATE_FILE && fs.existsSync(ISSUER_PRIVATE_FILE)) {
      return decryptString(fs.readFileSync(ISSUER_PRIVATE_FILE, 'utf8'), getStorageSecret())
    }
  } catch (error) {
    console.error('Error loading issuer private key:', error)
  }
  return ''
}

function saveIssuerPrivateKey(privateKeyPem) {
  fs.writeFileSync(ISSUER_PRIVATE_FILE, encryptString(privateKeyPem, getStorageSecret()), 'utf8')
}

function ensureIssuerInitialized(adminKey) {
  verifyAdminAccess(adminKey)
  let profile = loadIssuerProfile()
  let privateKeyPem = loadIssuerPrivateKey()
  if (profile && privateKeyPem) {
    return { profile: profile, privateKeyPem: privateKeyPem, created: false }
  }

  const pair = generateIssuerKeyPair()
  profile = buildIssuerProfile(pair.publicKeyPem)
  saveIssuerProfile(profile)
  saveIssuerPrivateKey(pair.privateKeyPem)
  return { profile: profile, privateKeyPem: pair.privateKeyPem, created: true }
}

function verifyAdminAccess(adminKey) {
  if (isOwnerOverrideKey(adminKey)) {
    return true
  }

  const config = loadAdminConfig()
  if (!config) {
    throw new Error('ADMIN_KEY_NOT_INITIALIZED')
  }
  if (!verifyAdminKey(adminKey, config)) {
    throw new Error('ADMIN_KEY_INVALID')
  }
  return true
}

function ensureAdminConfigured(adminKey) {
  if (isOwnerOverrideKey(adminKey)) {
    return { alreadyConfigured: true, ownerOverride: true }
  }

  const existing = loadAdminConfig()
  if (existing) {
    if (!verifyAdminKey(adminKey, existing)) {
      throw new Error('ADMIN_KEY_INVALID')
    }
    return { alreadyConfigured: true }
  }

  saveAdminConfig(createAdminConfig(adminKey, Date.now()))
  return { alreadyConfigured: false }
}

function getLicenseByKey(licenseKey, store) {
  const key = String(licenseKey || '').trim().toUpperCase()
  return (store && Array.isArray(store.licenses) ? store.licenses : []).find(function (item) {
    return item.key === key
  }) || null
}

function upsertLicenseRecord(record) {
  const store = loadLicenseStore()
  const normalized = normalizeLicenseRecord(record)
  const next = store.licenses.filter(function (item) { return item.key !== normalized.key })
  next.push(normalized)
  return saveLicenseStore({
    ...store,
    licenses: next
  })
}

function createManagedLicense(adminKey, options) {
  verifyAdminAccess(adminKey)
  const record = buildLicenseRecord({
    product: options && options.product,
    daysValid: options && options.daysValid,
    note: options && options.note,
    now: Date.now()
  })
  upsertLicenseRecord(record)
  return record
}

function updateManagedLicense(adminKey, licenseKey, patch) {
  verifyAdminAccess(adminKey)
  const store = loadLicenseStore()
  const current = getLicenseByKey(licenseKey, store)
  if (!current) {
    throw new Error('LICENSE_NOT_FOUND')
  }

  const next = normalizeLicenseRecord({
    ...current,
    ...patch,
    updatedAt: Date.now()
  })
  upsertLicenseRecord(next)
  return next
}

function getLicenseActivationSnapshot(license, machineId) {
  const now = Date.now()
  const status = getLicenseStatus(license, now)
  return {
    status: status,
    isActive: status === 'active',
    expiresAt: license && license.expiresAt ? license.expiresAt : 0,
    machineId: machineId,
    activatedMachineId: license && license.activatedMachineId ? license.activatedMachineId : '',
    remainingDays: license && license.expiresAt
      ? Math.max(0, Math.ceil((license.expiresAt - now) / (24 * 60 * 60 * 1000)))
      : 0
  }
}

function getManagedLicenseRecord(licenseKey, product) {
  const license = getLicenseByKey(licenseKey, loadLicenseStore())
  if (!license) return null
  if (product && license.product !== product) return null
  return normalizeLicenseRecord(license)
}

function getLocalActivationSnapshot(filePath, product, validKeys) {
  const machineId = getMachineId()
  const act = readLocalActivationFile(filePath)
  if (!act || act.machineId !== machineId) {
    return {
      isActivated: false,
      machineId: machineId,
      key: '',
      expiresAt: 0,
      remainingDays: 0,
      source: ''
    }
  }

  const now = Date.now()
  if (isOwnerOverrideActivationRecord(act)) {
    return {
      isActivated: true,
      machineId: machineId,
      key: OWNER_OVERRIDE_STORAGE_KEY,
      expiresAt: act.expiresAt,
      remainingDays: Math.max(0, Math.ceil((act.expiresAt - now) / (24 * 60 * 60 * 1000))),
      source: 'owner'
    }
  }

  const allowedKeys = Array.isArray(validKeys) ? validKeys : []
  if (allowedKeys.includes(act.key)) {
    return {
      isActivated: act.expiresAt > now,
      machineId: machineId,
      key: act.key,
      expiresAt: act.expiresAt,
      remainingDays: Math.max(0, Math.ceil((act.expiresAt - now) / (24 * 60 * 60 * 1000))),
      source: 'legacy'
    }
  }

  const managed = getManagedLicenseRecord(act.key, product)
  if (!managed) {
    return {
      isActivated: false,
      machineId: machineId,
      key: act.key,
      expiresAt: act.expiresAt,
      remainingDays: Math.max(0, Math.ceil((act.expiresAt - now) / (24 * 60 * 60 * 1000))),
      source: ''
    }
  }

  const snapshot = getLicenseActivationSnapshot(managed, machineId)
  return {
    ...snapshot,
    machineId: machineId,
    key: managed.key,
    source: 'managed'
  }
}

function formatManagedLicenseForRenderer(record) {
  const license = normalizeLicenseRecord(record)
  return {
    ...license,
    ...getLicenseActivationSnapshot(license, getMachineId())
  }
}

function listManagedLicensesForRenderer() {
  const store = loadLicenseStore()
  return (store.licenses || [])
    .slice()
    .sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0) })
    .map(function (item) { return formatManagedLicenseForRenderer(item) })
}

function syncLocalActivationFileWithManagedLicense(record) {
  const license = normalizeLicenseRecord(record)
  const machineId = getMachineId()
  const filePath = license.product === 'giveaway' ? GIVEAWAY_ACTIVATION_FILE : ACTIVATION_FILE
  const local = readLocalActivationFile(filePath)
  if (!local || local.key !== license.key || local.machineId !== machineId) {
    return
  }

  if (license.status === 'active' && license.expiresAt > Date.now() && license.activatedMachineId === machineId) {
    writeLocalActivationFile(filePath, {
      key: license.key,
      machineId: machineId,
      activatedAt: license.activatedAt || local.activatedAt || Date.now(),
      expiresAt: license.expiresAt
    })
    return
  }

  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    console.error('Error removing managed activation file:', error)
  }

  if (license.product === 'giveaway') {
    isGiveawayActivated = false
  } else {
    isActivated = false
  }
}

function activateManagedLicenseLocally(key, product) {
  const cleanKey = String(key || '').trim().toUpperCase()
  const license = getManagedLicenseRecord(cleanKey, product)
  if (!license) return null

  const machineId = getMachineId()
  const status = getLicenseStatus(license, Date.now())
  if (status === 'revoked') {
    return { success: false, message: 'Key đã bị thu hồi bởi quản trị viên.' }
  }
  if (status === 'expired') {
    return { success: false, message: 'Key đã hết hạn. Hãy dùng key mới hoặc gia hạn.' }
  }
  if (license.activatedMachineId && license.activatedMachineId !== machineId) {
    return { success: false, message: 'Key đã được kích hoạt trên thiết bị khác!' }
  }

  const updated = normalizeLicenseRecord({
    ...license,
    status: 'active',
    activatedMachineId: machineId,
    activatedAt: license.activatedAt || Date.now(),
    updatedAt: Date.now()
  })
  upsertLicenseRecord(updated)

  const filePath = product === 'giveaway' ? GIVEAWAY_ACTIVATION_FILE : ACTIVATION_FILE
  writeLocalActivationFile(filePath, {
    key: updated.key,
    machineId: machineId,
    activatedAt: updated.activatedAt,
    expiresAt: updated.expiresAt
  })

  const remainingDays = Math.max(0, Math.ceil((updated.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)))
  if (product === 'giveaway') {
    isGiveawayActivated = true
    return {
      success: true,
      message: 'Kích hoạt Giveaway Premium thành công!',
      expiresAt: updated.expiresAt,
      remainingDays: remainingDays,
      source: 'managed'
    }
  }

  isActivated = true
  return {
    success: true,
    message: 'Kích hoạt bản quyền thành công!',
    expiresAt: updated.expiresAt,
    remainingDays: remainingDays,
    source: 'managed'
  }
}

function activateOwnerOverrideLocally() {
  const machineId = getMachineId()
  const now = Date.now()
  const activationData = buildOwnerOverrideActivationRecord(machineId, now)

  writeLocalActivationFile(ACTIVATION_FILE, activationData)
  writeLocalActivationFile(GIVEAWAY_ACTIVATION_FILE, activationData)
  isActivated = true
  isGiveawayActivated = true

  logSystem('info', 'license', 'Owner override activated locally.', {
    expiresAt: activationData.expiresAt
  })

  return {
    success: true,
    message: 'Đã mở khóa toàn bộ chức năng bằng owner override.',
    expiresAt: activationData.expiresAt,
    remainingDays: Math.max(0, Math.ceil((activationData.expiresAt - now) / (24 * 60 * 60 * 1000))),
    source: 'owner',
    unlocksGiveaway: true
  }
}

function resetLocalLicenseState(options) {
  const opts = options && typeof options === 'object' ? options : {}
  const files = [ACTIVATION_FILE, GIVEAWAY_ACTIVATION_FILE]
  if (opts.includeAdminData) {
    files.push(LICENSE_STORE_FILE, ADMIN_CONFIG_FILE, ISSUER_PROFILE_FILE, ISSUER_PRIVATE_FILE)
  }

  const deleted = []
  files.forEach(function (filePath) {
    try {
      if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
        deleted.push(filePath)
      }
    } catch (error) {
      console.error('Error resetting local license state:', error)
    }
  })

  isActivated = false
  isGiveawayActivated = false

  return {
    success: true,
    deleted: deleted
  }
}

function sanitizeAccountForStorage(acc) {
  const source = acc || {}
  const stored = {
    id: source.id,
    label: source.label,
    token: source.token === 'anonymous' ? 'anonymous' : '',
    tokenEncrypted: '',
    clientId: source.clientId || '',
    login: source.login || '',
    profileImageUrl: source.profileImageUrl || '',
    channels: Array.isArray(source.channels) ? source.channels : []
  }

  if (source.token && source.token !== 'anonymous') {
    stored.tokenEncrypted = encryptString(source.token, getStorageSecret())
  }

  return stored
}

function hydrateAccountFromStorage(raw) {
  const item = raw || {}
  const hydrated = {
    id: item.id,
    label: item.label || '',
    token: 'anonymous',
    clientId: item.clientId || '',
    login: item.login || '',
    profileImageUrl: item.profileImageUrl || '',
    channels: Array.isArray(item.channels) ? item.channels : []
  }

  if (item.token === 'anonymous') {
    hydrated.token = 'anonymous'
    return hydrated
  }

  if (item.tokenEncrypted) {
    hydrated.token = decryptString(item.tokenEncrypted, getStorageSecret())
    return hydrated
  }

  if (item.token) {
    hydrated.token = item.token
    return hydrated
  }

  hydrated.token = 'anonymous'
  return hydrated
}

function loadAppSettings() {
  try {
    if (APP_SETTINGS_FILE && fs.existsSync(APP_SETTINGS_FILE)) {
      const raw = JSON.parse(fs.readFileSync(APP_SETTINGS_FILE, 'utf8'))
      return mergeAppSettings(raw)
    }
  } catch (error) {
    console.error('Error loading app settings:', error)
  }

  return mergeAppSettings()
}

function saveAppSettings(settings) {
  const payload = mergeAppSettings(settings)
  fs.writeFileSync(APP_SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf8')
  return payload
}

function updateTelemetry(patch) {
  const current = loadAppSettings()
  return saveAppSettings(applyTelemetryPatch(current, patch))
}

function saveSessionSnapshot() {
  const current = loadAppSettings()
  return saveAppSettings({
    ...current,
    lastSessionSnapshot: buildSessionSnapshot(accounts, connections)
  })
}

function exportAppState() {
  return {
    exportedAt: new Date().toISOString(),
    accounts: accounts.map(function (acc) {
      return {
        id: acc.id,
        label: acc.label,
        token: acc.token || 'anonymous',
        clientId: acc.clientId || '',
        login: acc.login || '',
        profileImageUrl: acc.profileImageUrl || '',
        channels: Array.isArray(acc.channels) ? acc.channels : []
      }
    }),
    appSettings: loadAppSettings()
  }
}

function importAppState(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('INVALID_IMPORT_PAYLOAD')
  }

  const importedAccounts = Array.isArray(payload.accounts) ? payload.accounts : []
  const normalizedAccounts = importedAccounts.map(function (acc, index) {
    const label = String((acc && acc.label) || '').trim() || ('Imported ' + (index + 1))
    const token = String((acc && acc.token) || 'anonymous').trim() || 'anonymous'
    return {
      id: String((acc && acc.id) || genId()),
      label: label,
      token: token,
      clientId: String((acc && acc.clientId) || '').trim(),
      login: normalizeIdentity((acc && acc.login) || ''),
      profileImageUrl: String((acc && acc.profileImageUrl) || '').trim(),
      channels: Array.isArray(acc && acc.channels)
        ? acc.channels.map(function (ch) { return normalizeIdentity(ch) }).filter(Boolean)
        : []
    }
  })

  accounts = normalizedAccounts.length > 0
    ? normalizedAccounts
    : [{ id: 'default-anon', label: 'Ẩn danh', token: 'anonymous', channels: [] }]

  saveAccounts()

  if (payload.appSettings && typeof payload.appSettings === 'object') {
    saveAppSettings(payload.appSettings)
  }

  logSystem('info', 'settings', 'Imported application backup.', {
    accountCount: accounts.length
  })

  return true
}

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
    } catch (err) { }
    return fallbackId
  }
}

function checkActivationLocal() {
  try {
    const snapshot = getLocalActivationSnapshot(ACTIVATION_FILE, 'standard', VALID_KEYS)
    isActivated = snapshot.isActivated
    if (!snapshot.isActivated && snapshot.key && snapshot.expiresAt) {
      logSystem('warn', 'license', 'Standard license expired locally.', {
        key: snapshot.key,
        expiresAt: snapshot.expiresAt
      })
    }
    return snapshot.isActivated
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

function activateKeyOnlineV2(key) {
  return new Promise((resolve) => {
    const machineId = getMachineId()
    const cleanKey = String(key || '').trim()

    if (!VALID_KEYS.includes(cleanKey)) {
      resolve({ success: false, message: 'Key không tồn tại hoặc không hợp lệ!' })
      return
    }

    fetchRemoteActivationValue(cleanKey, function (err, remoteRecord) {
      if (err) {
        resolve({ success: false, message: `Không thể kết nối đến máy chủ kích hoạt. Vui lòng kiểm tra kết nối mạng! (Lỗi: ${err.message})` })
        return
      }

      const now = Date.now()
      let activationData = null

      if (!remoteRecord || !remoteRecord.machineId) {
        activationData = normalizeLocalActivationRecord({
          key: cleanKey,
          machineId: machineId,
          activatedAt: now,
          expiresAt: buildExpiryTimestamp(now)
        })
      } else if (remoteRecord.machineId === machineId) {
        const activatedAt = remoteRecord.activatedAt || now
        activationData = normalizeLocalActivationRecord({
          key: cleanKey,
          machineId: machineId,
          activatedAt: activatedAt,
          expiresAt: remoteRecord.expiresAt || buildExpiryTimestamp(activatedAt)
        })

        if (activationData.expiresAt <= now) {
          resolve({
            success: false,
            message: 'Key đã hết hạn sau 90 ngày sử dụng. Hãy dùng key mới hoặc trả phí gia hạn.'
          })
          return
        }
      } else {
        resolve({ success: false, message: 'Key đã được kích hoạt trên thiết bị khác!' })
        return
      }

      saveRemoteActivationValue(cleanKey, activationData, function (saveErr, ok) {
        if (saveErr) {
          resolve({ success: false, message: `Lỗi kết nối khi kích hoạt: ${saveErr.message}` })
          return
        }
        if (!ok) {
          resolve({ success: false, message: 'Đăng ký/gia hạn key lên máy chủ thất bại!' })
          return
        }

        try {
          writeLocalActivationFile(ACTIVATION_FILE, activationData)
          isActivated = true
          logSystem('info', 'license', 'Standard license activated or migrated to 90-day window.', {
            key: cleanKey,
            expiresAt: activationData.expiresAt
          })
          resolve({
            success: true,
            message: 'Kích hoạt bản quyền thành công!',
            expiresAt: activationData.expiresAt
          })
        } catch (e) {
          resolve({ success: false, message: 'Lưu thông tin kích hoạt cục bộ thất bại!' })
        }
      })
    })
  })
}

function checkGiveawayActivationLocal() {
  try {
    const snapshot = getLocalActivationSnapshot(GIVEAWAY_ACTIVATION_FILE, 'giveaway', VALID_GIVEAWAY_KEYS)
    isGiveawayActivated = snapshot.isActivated
    if (!snapshot.isActivated && snapshot.key && snapshot.expiresAt) {
      logSystem('warn', 'license', 'Giveaway license expired locally.', {
        key: snapshot.key,
        expiresAt: snapshot.expiresAt
      })
    }
    return snapshot.isActivated
  } catch (e) {
    console.error('Error checking local giveaway activation:', e)
  }
  isGiveawayActivated = false
  return false
}

function activateGiveawayKeyOnlineV2(key) {
  return new Promise((resolve) => {
    const machineId = getMachineId()
    const cleanKey = String(key || '').trim()

    if (!VALID_GIVEAWAY_KEYS.includes(cleanKey)) {
      resolve({ success: false, message: 'Key Giveaway khÃ´ng tá»“n táº¡i hoáº·c khÃ´ng há»£p lá»‡!' })
      return
    }

    fetchRemoteActivationValue(cleanKey, function (err, remoteRecord) {
      if (err) {
        resolve({ success: false, message: `KhÃ´ng thá»ƒ káº¿t ná»‘i Ä‘áº¿n mÃ¡y chá»§ kÃ­ch hoáº¡t. Vui lÃ²ng kiá»ƒm tra káº¿t ná»‘i máº¡ng! (Lá»—i: ${err.message})` })
        return
      }

      const now = Date.now()
      let activationData = null

      if (!remoteRecord || !remoteRecord.machineId) {
        activationData = normalizeLocalActivationRecord({
          key: cleanKey,
          machineId: machineId,
          activatedAt: now,
          expiresAt: buildExpiryTimestamp(now)
        })
      } else if (remoteRecord.machineId === machineId) {
        const activatedAt = remoteRecord.activatedAt || now
        activationData = normalizeLocalActivationRecord({
          key: cleanKey,
          machineId: machineId,
          activatedAt: activatedAt,
          expiresAt: remoteRecord.expiresAt || buildExpiryTimestamp(activatedAt)
        })

        if (activationData.expiresAt <= now) {
          resolve({
            success: false,
            message: 'Key Giveaway Ä‘Ã£ háº¿t háº¡n sau 90 ngÃ y sá»­ dá»¥ng. HÃ£y dÃ¹ng key má»›i hoáº·c tráº£ phÃ­ gia háº¡n.'
          })
          return
        }
      } else {
        resolve({ success: false, message: 'Key Ä‘Ã£ Ä‘Æ°á»£c kÃ­ch hoáº¡t trÃªn thiáº¿t bá»‹ khÃ¡c!' })
        return
      }

      saveRemoteActivationValue(cleanKey, activationData, function (saveErr, ok) {
        if (saveErr) {
          resolve({ success: false, message: `Lá»—i káº¿t ná»‘i khi kÃ­ch hoáº¡t: ${saveErr.message}` })
          return
        }
        if (!ok) {
          resolve({ success: false, message: 'ÄÄƒng kÃ½/gia háº¡n key lÃªn mÃ¡y chá»§ tháº¥t báº¡i!' })
          return
        }

        try {
          writeLocalActivationFile(GIVEAWAY_ACTIVATION_FILE, activationData)
          isGiveawayActivated = true
          logSystem('info', 'license', 'Giveaway license activated or migrated to 90-day window.', {
            key: cleanKey,
            expiresAt: activationData.expiresAt
          })
          resolve({
            success: true,
            message: 'KÃ­ch hoáº¡t Giveaway Premium thÃ nh cÃ´ng!',
            expiresAt: activationData.expiresAt
          })
        } catch (e) {
          resolve({ success: false, message: 'LÆ°u thÃ´ng tin kÃ­ch hoáº¡t Giveaway cá»¥c bá»™ tháº¥t báº¡i!' })
        }
      })
    })
  })
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
      const parsed = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8'))
      const rawAccounts = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed && parsed.accounts)
          ? parsed.accounts
          : []
      accounts = rawAccounts.map(function (item) {
        return hydrateAccountFromStorage(item)
      })

      if (needsAccountStorageRewrite(parsed)) {
        saveAccounts()
        logSystem('info', 'accounts', 'Migrated legacy account storage to encrypted schema.', {
          accountCount: accounts.length
        })
      }
    }
  } catch (e) {
    logSystem('error', 'accounts', 'Failed to load accounts file, resetting to empty.', {
      error: e.message
    })
    accounts = []
  }
  if (!accounts || accounts.length === 0) {
    accounts = [{ id: 'default-anon', label: 'Ẩn danh', token: 'anonymous', channels: [] }]
    saveAccounts()
  }
}

function saveAccounts() {
  const payload = {
    version: ACCOUNT_SCHEMA_VERSION,
    updatedAt: Date.now(),
    accounts: accounts.map(function (acc) {
      return sanitizeAccountForStorage(acc)
    })
  }
  fs.writeFileSync(ACCOUNTS_FILE, JSON.stringify(payload, null, 2), 'utf8')
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

function normalizeIdentity(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
}

function fallbackLoginFromLabel(label) {
  return normalizeIdentity(label).replace(/\s+/g, '_')
}

function getAccountLogin(acc) {
  if (!acc) return ''
  return normalizeIdentity(acc.login || fallbackLoginFromLabel(acc.label))
}

async function hydrateMissingAccountLogins() {
  var changed = false

  for (var i = 0; i < accounts.length; i++) {
    var acc = accounts[i]
    if (!acc) continue

    if (acc.token && acc.token !== 'anonymous' && acc.clientId && !acc.login) {
      try {
        var profile = await fetchUserProfile(acc.token, acc.clientId)
        if (profile) {
          acc.login = normalizeIdentity(profile.login)
          if (profile.displayName) acc.label = profile.displayName
          if (profile.profileImageUrl) acc.profileImageUrl = profile.profileImageUrl
          changed = true
          continue
        }
      } catch (e) {
        console.error('Helix API Error while hydrating login:', e.message)
      }
    }

    if (!acc.login) {
      acc.login = getAccountLogin(acc)
      changed = true
    }
  }

  if (changed) saveAccounts()
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
function parseMegamuJsonResponse(raw) {
  const text = String(raw || '').trim()
  if (!text) {
    return { result: -100, message: 'Phan hoi rong tu MEGAMU API.' }
  }

  try {
    const parsed = JSON.parse(text)
    if (typeof parsed.result === 'undefined') parsed.result = -100
    return parsed
  } catch (err) {
    return {
      result: -100,
      message: 'Khong the phan tich JSON tu MEGAMU API.',
      raw: text
    }
  }
}

function callMegamuApi(params, usePost) {
  return new Promise((resolve, reject) => {
    const payload = new URLSearchParams()
    Object.keys(params || {}).forEach(function (key) {
      const value = params[key]
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        payload.append(key, String(value).trim())
      }
    })

    const body = payload.toString()
    const req = https.request({
      hostname: 'en.megamu.net',
      path: '/dvapi.php' + (usePost ? '' : ('?' + body)),
      method: usePost ? 'POST' : 'GET',
      headers: usePost ? {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body)
      } : undefined
    }, function (res) {
      let data = ''
      res.on('data', function (chunk) { data += chunk })
      res.on('end', function () {
        const parsed = parseMegamuJsonResponse(data)
        parsed.httpStatus = res.statusCode
        resolve(parsed)
      })
    })

    req.on('error', function (err) {
      reject(err)
    })

    if (usePost) req.write(body)
    req.end()
  })
}

async function getMegamuAwards(dv, key) {
  if (!dv || !key) {
    return { result: -100, message: 'Vui long nhap day du DV va API key.' }
  }

  const response = await callMegamuApi({
    dv: dv,
    key: key,
    action: 'getawards'
  }, false)

  if (!Array.isArray(response.awards)) {
    response.awards = []
  }

  return response
}

function addAccount(label, token, clientId, profileImageUrl, login) {
  var acc = {
    id: genId(),
    label: label.trim(),
    token: token.trim(),
    clientId: (clientId || '').trim(),
    login: normalizeIdentity(login || ''),
    profileImageUrl: profileImageUrl || '',
    channels: []
  }
  if (!acc.login && acc.token && acc.token !== 'anonymous') {
    acc.login = fallbackLoginFromLabel(acc.label)
  }
  accounts.push(acc)
  saveAccounts()
  return acc
}

function updateAccount(id, label, token, clientId, profileImageUrl, login) {
  var acc = accounts.find(function (a) { return a.id === id })
  if (!acc) return null
  acc.label = label.trim()
  if (token) acc.token = token.trim()
  if (clientId !== undefined) acc.clientId = clientId.trim()
  if (login !== undefined) acc.login = normalizeIdentity(login)
  if (profileImageUrl !== undefined) acc.profileImageUrl = profileImageUrl
  if (!acc.login && acc.token && acc.token !== 'anonymous') {
    acc.login = fallbackLoginFromLabel(acc.label)
  }
  saveAccounts()
  return acc
}

function deleteAccount(id) {
  // Disconnect all channels of this account
  Object.keys(connections).forEach(function (key) {
    if (key.startsWith(id + ':')) {
      clearReconnectTimer(key)
      delete reconnectAttempts[key]
      delete manualDisconnects[key]
      delete authFailedConnections[key]
      connections[key].close()
      delete connections[key]
    }
  })
  accounts = accounts.filter(function (a) { return a.id !== id })
  if (activeAccountId === id) {
    activeAccountId = accounts.length > 0 ? accounts[0].id : null
  }
  saveAccounts()
}

function getAccount(id) {
  return accounts.find(function (a) { return a.id === id }) || null
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
  acc.channels = acc.channels.filter(function (c) { return c !== ch })
  saveAccounts()
  disconnectChannel(accountId, ch)
}

// ── WebSocket ─────────────────────────────────────────────────
function connKey(accountId, channel) {
  return accountId + ':' + channel
}

function clearReconnectTimer(key) {
  if (reconnectTimers[key]) {
    clearTimeout(reconnectTimers[key])
    delete reconnectTimers[key]
  }
}

function shouldKeepChannelConnected(accountId, channel) {
  var acc = getAccount(accountId)
  if (!acc) return false
  var ch = channel.toLowerCase().trim()
  var isSavedChannel = Array.isArray(acc.channels) && acc.channels.indexOf(ch) !== -1
  var isBackgroundGiveawayChannel = !!(giveawayChannel && giveawayChannel === ch && acc.token && acc.token !== 'anonymous')
  return isSavedChannel || isBackgroundGiveawayChannel
}

function scheduleReconnect(accountId, channel, reason) {
  var ch = channel.toLowerCase().trim()
  var key = connKey(accountId, ch)
  if (manualDisconnects[key] || authFailedConnections[key] || reconnectTimers[key]) return
  if (!shouldKeepChannelConnected(accountId, ch)) return

  var attempt = (reconnectAttempts[key] || 0) + 1
  reconnectAttempts[key] = attempt
  var delayMs = Math.min(30000, 5000 * attempt)

  if (mainWindow) {
    mainWindow.webContents.send('channel-status', {
      accountId: accountId,
      channel: ch,
      connected: false,
      reconnecting: true,
      retryInMs: delayMs,
      reason: reason || 'reconnect'
    })
  }
  logSystem('warn', 'channels', 'Scheduling reconnect.', {
    accountId: accountId,
    channel: ch,
    attempt: attempt,
    delayMs: delayMs,
    reason: reason || 'reconnect'
  })
  updateTelemetry({ reconnectEvents: 1 })

  reconnectTimers[key] = setTimeout(function () {
    delete reconnectTimers[key]
    if (manualDisconnects[key] || authFailedConnections[key]) return
    if (!shouldKeepChannelConnected(accountId, ch)) return
    connectChannel(accountId, ch)
  }, delayMs)
}

function connectChannel(accountId, channel) {
  var acc = getAccount(accountId)
  if (!acc) return
  var ch = channel.toLowerCase()
  var key = connKey(accountId, ch)
  if (connections[key]) return
  delete manualDisconnects[key]
  delete authFailedConnections[key]
  clearReconnectTimer(key)

  var ws = new WebSocket('wss://irc-ws.chat.twitch.tv:443')
  connections[key] = ws

  // Twitch IRC: anonymous uses justinfan + any password
  // Authenticated uses oauth:TOKEN
  var isAnon = !acc.token || acc.token === 'anonymous'
  var nick = isAnon ? 'justinfan' + Math.floor(Math.random() * 99999) : getAccountLogin(acc)
  var pass = isAnon ? 'oauth:anonymous_token' : 'oauth:' + acc.token

  ws.on('open', function () {
    reconnectAttempts[key] = 0
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    ws.send('PASS ' + pass)
    ws.send('NICK ' + nick)
    ws.send('JOIN #' + ch)
    if (mainWindow) mainWindow.webContents.send('channel-status', {
      accountId: accountId, channel: ch, connected: true
    })
    logSystem('success', 'channels', 'Connected to Twitch channel.', {
      accountId: accountId,
      channel: ch,
      anonymous: isAnon
    })
  })

  ws.on('message', function (data) {
    var raw = data.toString()
    var lines = raw.split('\r\n').filter(Boolean)
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i]
      if (line.startsWith('PING')) { ws.send('PONG :tmi.twitch.tv'); continue }

      // Auth failure
      if (line.indexOf('Login authentication failed') !== -1) {
        authFailedConnections[key] = true
        clearReconnectTimer(key)
        if (mainWindow) mainWindow.webContents.send('channel-error', {
          accountId: accountId, channel: ch, error: 'Token không hợp lệ'
        })
        try { ws.close() } catch (e) { }
        continue
      }

      var roomState = parseTwitchRoomState(line)
      if (roomState && mainWindow) {
        mainWindow.webContents.send('channel-roomstate', {
          accountId: accountId,
          channel: ch,
          followersOnly: roomState.followersOnly,
          emoteOnly: roomState.emoteOnly,
          slow: roomState.slow,
          subsOnly: roomState.subsOnly
        })
        continue
      }

      var notice = parseTwitchNotice(line)
      if (notice && isFollowersOnlyNotice(notice) && mainWindow) {
        mainWindow.webContents.send('channel-chat-restriction', {
          accountId: accountId,
          channel: notice.channel || ch,
          kind: 'followers-only',
          message: notice.text,
          msgId: notice.msgId
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

  ws.on('close', function () {
    delete connections[key]
    if (manualDisconnects[key] || authFailedConnections[key]) {
      if (mainWindow) mainWindow.webContents.send('channel-status', {
        accountId: accountId, channel: ch, connected: false
      })
      logSystem('info', 'channels', 'Disconnected from Twitch channel.', {
        accountId: accountId,
        channel: ch,
        manual: !!manualDisconnects[key],
        authFailed: !!authFailedConnections[key]
      })
      return
    }
    scheduleReconnect(accountId, ch, 'close')
  })

  ws.on('error', function (err) {
    delete connections[key]
    if (mainWindow) mainWindow.webContents.send('channel-error', {
      accountId: accountId, channel: ch, error: err.message, reconnecting: !manualDisconnects[key] && !authFailedConnections[key]
    })
    logSystem('error', 'channels', 'WebSocket error for channel.', {
      accountId: accountId,
      channel: ch,
      error: err.message
    })
    if (!manualDisconnects[key] && !authFailedConnections[key]) {
      scheduleReconnect(accountId, ch, 'error')
    }
  })
}

function disconnectChannel(accountId, channel) {
  var key = connKey(accountId, channel.toLowerCase())
  manualDisconnects[key] = true
  delete authFailedConnections[key]
  clearReconnectTimer(key)
  delete reconnectAttempts[key]
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
  var nick = isAnon ? 'justinfan' + Math.floor(Math.random() * 99999) : getAccountLogin(acc)
  var pass = isAnon ? 'oauth:anonymous_token' : 'oauth:' + acc.token

  ws.on('open', function () {
    ws.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
    ws.send('PASS ' + pass)
    ws.send('NICK ' + nick)
    ws.send('JOIN #' + ch)
    if (mainWindow) mainWindow.webContents.send('giveaway-status', { connected: true })
  })

  ws.on('message', function (data) {
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

  ws.on('close', function () {
    if (giveawayWs === ws) {
      giveawayWs = null
      if (mainWindow) mainWindow.webContents.send('giveaway-status', { connected: false })
    }
  })

  ws.on('error', function (err) {
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
    } catch (e) { }
    giveawayWs = null
  }
}

function sendGiveawayChat(text) {
  if (giveawayWs && giveawayWs.readyState === WebSocket.OPEN && giveawayChannel) {
    giveawayWs.send('PRIVMSG #' + giveawayChannel + ' :' + text)
  }
}

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

  if (mainWindow.webContents && typeof mainWindow.webContents.on === 'function') {
    mainWindow.webContents.on('render-process-gone', function (event, details) {
      logSystem('error', 'system', 'Renderer process gone.', details || {})
      updateTelemetry({ rendererCrashes: 1 })
      saveSessionSnapshot()
    })
  }

  mainWindow.on('closed', function () {
    Object.keys(connections).forEach(function (k) { connections[k].close() })
    saveSessionSnapshot()
    mainWindow = null
  })
}

// ── IPC ───────────────────────────────────────────────────────
ipcMain.handle('check-activation', function () {
  const snapshot = getLocalActivationSnapshot(ACTIVATION_FILE, 'standard', VALID_KEYS)
  isActivated = snapshot.isActivated
  return snapshot
})

ipcMain.handle('get-app-version', function () {
  return app.getVersion()
})

ipcMain.handle('activate-key', async function (event, key) {
  if (isOwnerOverrideKey(key)) {
    return activateOwnerOverrideLocally()
  }

  const managedResult = activateManagedLicenseLocally(key, 'standard')
  if (managedResult) return managedResult
  return await activateKeyOnlineV2(key)
})

ipcMain.handle('check-giveaway-activation', function () {
  const snapshot = getLocalActivationSnapshot(GIVEAWAY_ACTIVATION_FILE, 'giveaway', VALID_GIVEAWAY_KEYS)
  isGiveawayActivated = snapshot.isActivated
  return snapshot
})

ipcMain.handle('activate-giveaway-key', async function (event, key) {
  if (isOwnerOverrideKey(key)) {
    return activateOwnerOverrideLocally()
  }

  const managedResult = activateManagedLicenseLocally(key, 'giveaway')
  if (managedResult) return managedResult
  return await activateGiveawayKeyOnlineV2(key)
})

ipcMain.handle('admin-init', function (event, adminKey) {
  try {
    const initResult = ensureAdminConfigured(adminKey)
    const issuerResult = ensureIssuerInitialized(adminKey)
    return {
      success: true,
      alreadyConfigured: initResult.alreadyConfigured,
      issuerCreated: issuerResult.created
    }
  } catch (error) {
    return {
      success: false,
      message: error.message === 'ADMIN_KEY_INVALID'
        ? 'Admin key không đúng.'
        : 'Không thể khởi tạo quản trị.'
    }
  }
})

ipcMain.handle('admin-list-licenses', function (event, adminKey) {
  try {
    verifyAdminAccess(adminKey)
    return {
      success: true,
      licenses: listManagedLicensesForRenderer()
    }
  } catch (error) {
    return {
      success: false,
      message: error.message === 'ADMIN_KEY_INVALID'
        ? 'Admin key không đúng.'
        : 'Admin key chưa được khởi tạo.'
    }
  }
})

ipcMain.handle('admin-create-license', function (event, adminKey, options) {
  try {
    const record = createManagedLicense(adminKey, options || {})
    return {
      success: true,
      license: formatManagedLicenseForRenderer(record)
    }
  } catch (error) {
    return {
      success: false,
      message: error.message === 'ADMIN_KEY_INVALID'
        ? 'Admin key không đúng.'
        : 'Không thể tạo key mới.'
    }
  }
})

ipcMain.handle('admin-update-license', function (event, adminKey, licenseKey, patch) {
  try {
    const nextPatch = { ...(patch || {}) }
    if (nextPatch.daysDelta) {
      const current = getManagedLicenseRecord(licenseKey)
      if (!current) {
        throw new Error('LICENSE_NOT_FOUND')
      }
      const base = current.expiresAt > Date.now() ? current.expiresAt : Date.now()
      nextPatch.expiresAt = base + (Number(nextPatch.daysDelta) * 24 * 60 * 60 * 1000)
      delete nextPatch.daysDelta
    }

    const record = updateManagedLicense(adminKey, licenseKey, nextPatch)
    syncLocalActivationFileWithManagedLicense(record)
    return {
      success: true,
      license: formatManagedLicenseForRenderer(record)
    }
  } catch (error) {
    return {
      success: false,
      message: error.message === 'ADMIN_KEY_INVALID'
        ? 'Admin key không đúng.'
        : error.message === 'LICENSE_NOT_FOUND'
          ? 'Không tìm thấy key cần cập nhật.'
          : 'Không thể cập nhật key.'
    }
  }
})

ipcMain.handle('admin-reset-local-license-state', function (event, adminKey, includeAdminData) {
  try {
    verifyAdminAccess(adminKey)
    return resetLocalLicenseState({ includeAdminData: !!includeAdminData })
  } catch (error) {
    return {
      success: false,
      message: error.message === 'ADMIN_KEY_INVALID'
        ? 'Admin key không đúng.'
        : 'Admin key chưa được khởi tạo.'
    }
  }
})

ipcMain.on('start-giveaway-connection', function (event, channel, modBotAccountId) {
  connectGiveawayChannel(channel, modBotAccountId)

  // Background join for all authenticated accounts to process Auto Bot
  var ch = channel.toLowerCase().trim()
  if (ch) {
    accounts.forEach(function (acc) {
      if (acc.token && acc.token !== 'anonymous') {
        connectChannel(acc.id, ch)
      }
    })
  }
})

ipcMain.on('stop-giveaway-connection', function () {
  var channelToDisconnect = giveawayChannel
  stopGiveawayChannel()

  if (channelToDisconnect) {
    var ch = channelToDisconnect.toLowerCase().trim()
    accounts.forEach(function (acc) {
      if (acc.channels.indexOf(ch) === -1) {
        disconnectChannel(acc.id, ch)
      }
    })
  }
})

ipcMain.on('send-giveaway-chat', function (event, text) {
  sendGiveawayChat(text)
})

ipcMain.handle('megamu-get-awards', async function (event, dv, key) {
  return await getMegamuAwards(dv, key)
})

ipcMain.handle('get-accounts', function () {
  return accounts.map(function (a) {
    return {
      id: a.id,
      label: a.label,
      login: a.login || '',
      channels: a.channels,
      hasToken: !!a.token && a.token !== 'anonymous',
      clientId: a.clientId || '',
      profileImageUrl: a.profileImageUrl || ''
    }
  })
})

ipcMain.handle('get-app-settings', function () {
  return loadAppSettings()
})

ipcMain.handle('save-app-settings', function (event, partialSettings) {
  const current = loadAppSettings()
  const next = saveAppSettings({
    ...current,
    ...(partialSettings || {})
  })
  logSystem('info', 'settings', 'Application settings saved.', {
    keys: Object.keys(partialSettings || {})
  })
  return next
})

ipcMain.handle('export-app-state', function () {
  const payload = exportAppState()
  logSystem('info', 'settings', 'Application backup exported.', {
    accountCount: payload.accounts.length
  })
  updateTelemetry({ exportedBackups: 1 })
  return payload
})

ipcMain.handle('import-app-state', async function (event, payload) {
  const result = importAppState(payload)
  await hydrateMissingAccountLogins()
  updateTelemetry({ importedBackups: 1 })
  return result
})

ipcMain.handle('get-system-logs', function () {
  return systemLogger ? systemLogger.getEntries() : []
})

ipcMain.handle('clear-system-logs', function () {
  if (systemLogger) {
    systemLogger.clear()
  }
  logSystem('info', 'system', 'System logs cleared by user.')
  return true
})

ipcMain.handle('add-account', async function (event, label, token, clientId) {
  if (!isActivated && token !== 'anonymous') {
    throw new Error('Chưa kích hoạt bản quyền! Không thể thêm tài khoản Twitch thật.')
  }
  var profileImageUrl = ''
  var login = ''
  if (token && token !== 'anonymous' && clientId) {
    try {
      var profile = await fetchUserProfile(token, clientId)
      if (profile) {
        profileImageUrl = profile.profileImageUrl
        login = profile.login || ''
        label = profile.displayName
      }
    } catch (e) {
      console.error('Helix API Error:', e.message)
    }
  }
  var acc = addAccount(label, token, clientId, profileImageUrl, login)
  logSystem('info', 'accounts', 'Added account.', {
    label: acc.label,
    hasToken: !!acc.token && acc.token !== 'anonymous'
  })
  return {
    id: acc.id,
    label: acc.label,
    login: acc.login || '',
    channels: acc.channels,
    hasToken: !!acc.token && acc.token !== 'anonymous',
    clientId: acc.clientId || '',
    profileImageUrl: acc.profileImageUrl || ''
  }
})

ipcMain.handle('update-account', async function (event, id, label, token, clientId) {
  if (!isActivated && token !== 'anonymous') {
    throw new Error('Chưa kích hoạt bản quyền! Không thể sửa tài khoản Twitch thật.')
  }
  var profileImageUrl = undefined
  var login = undefined
  if (token && token !== 'anonymous' && clientId) {
    try {
      var profile = await fetchUserProfile(token, clientId)
      if (profile) {
        profileImageUrl = profile.profileImageUrl
        login = profile.login || ''
        label = profile.displayName
      }
    } catch (e) {
      console.error('Helix API Error:', e.message)
    }
  }
  var acc = updateAccount(id, label, token, clientId, profileImageUrl, login)
  if (!acc) return null
  logSystem('info', 'accounts', 'Updated account.', {
    id: id,
    label: acc.label
  })
  return {
    id: acc.id,
    label: acc.label,
    login: acc.login || '',
    channels: acc.channels,
    hasToken: !!acc.token && acc.token !== 'anonymous',
    clientId: acc.clientId || '',
    profileImageUrl: acc.profileImageUrl || ''
  }
})

ipcMain.handle('delete-account', function (event, id) {
  if (id === 'default-anon') {
    throw new Error('Không thể xóa tài khoản mặc định.')
  }
  deleteAccount(id)
  logSystem('warn', 'accounts', 'Deleted account.', {
    id: id
  })
  return true
})

ipcMain.on('join-channel', function (event, accountId, channel) {
  addChannelToAccount(accountId, channel)
  logSystem('info', 'channels', 'Joined channel.', {
    accountId: accountId,
    channel: normalizeIdentity(channel)
  })
  updateTelemetry({ channelJoins: 1 })
  saveSessionSnapshot()
})

ipcMain.on('leave-channel', function (event, accountId, channel) {
  removeChannelFromAccount(accountId, channel)
  logSystem('warn', 'channels', 'Left channel.', {
    accountId: accountId,
    channel: normalizeIdentity(channel)
  })
  updateTelemetry({ channelLeaves: 1 })
  saveSessionSnapshot()
})

ipcMain.on('send-chat', function (event, accountId, channel, text, replyParentMsgId, replyParentUser, replyParentBody) {
  if (text && text.trim()) {
    var trimmed = text.trim()
    sendChat(accountId, channel, trimmed, replyParentMsgId)
    logSystem('info', 'chat', 'Sent chat message.', {
      accountId: accountId,
      channel: normalizeIdentity(channel),
      reply: !!replyParentMsgId,
      length: trimmed.length
    })
    updateTelemetry({ sentMessages: 1 })

    // Echo back locally since Twitch IRC doesn't reflect own PRIVMSG to the sender
    var acc = getAccount(accountId)
    if (acc && mainWindow) {
      var username = acc.label
      var color = '#' + intToHex(simpleHash(username))
      var isBroadcaster = getAccountLogin(acc) === normalizeIdentity(channel)
      mainWindow.webContents.send('chat-message', {
        id: 'local-' + Date.now(),
        accountId: accountId,
        channel: channel.toLowerCase(),
        username: username,
        login: getAccountLogin(acc),
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

ipcMain.on('toggle-notifications', function (event, enabled) {
  notificationsEnabled = enabled
})

ipcMain.on('set-window-opacity', function (event, opacity) {
  if (mainWindow) {
    try {
      mainWindow.setOpacity(opacity)
    } catch (e) {
      console.error('Failed to set window opacity:', e)
    }
  }
})

ipcMain.on('reconnect-all', function () {
  accounts.forEach(function (acc) {
    acc.channels.forEach(function (ch) { connectChannel(acc.id, ch) })
  })
  logSystem('info', 'channels', 'Triggered reconnect for all saved channels.')
})

ipcMain.on('open-external', function (event, url) {
  if (url) shell.openExternal(url)
})

// ── Boot ──────────────────────────────────────────────────────
app.whenReady().then(async function () {
  ACCOUNTS_FILE = path.join(app.getPath('userData'), 'accounts.json')
  ACTIVATION_FILE = path.join(app.getPath('userData'), 'activation.json')
  GIVEAWAY_ACTIVATION_FILE = path.join(app.getPath('userData'), 'giveaway_activation.json')
  LICENSE_STORE_FILE = path.join(app.getPath('userData'), 'license-store.json')
  ADMIN_CONFIG_FILE = path.join(app.getPath('userData'), 'admin-config.json')
  ISSUER_PROFILE_FILE = path.join(app.getPath('userData'), 'issuer-profile.json')
  ISSUER_PRIVATE_FILE = path.join(app.getPath('userData'), 'issuer-private.enc')
  MACHINE_ID_FILE = path.join(app.getPath('userData'), 'machine.id')
  APP_SETTINGS_FILE = path.join(app.getPath('userData'), 'app-settings.json')
  SYSTEM_LOG_FILE = path.join(app.getPath('userData'), 'system-log.json')
  systemLogger = createLogger({ filePath: SYSTEM_LOG_FILE, maxEntries: 800 })
  saveAppSettings(loadAppSettings())
  updateTelemetry({ appLaunches: 1 })

  loadAccounts()
  await hydrateMissingAccountLogins()
  checkActivationLocal()
  checkGiveawayActivationLocal()
  createWindow()
  saveSessionSnapshot()
  logSystem('info', 'system', 'Application boot completed.', {
    version: app.getVersion()
  })

  // Auto Update check (Method 1: electron-updater)
  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload = true

    autoUpdater.on('update-available', function () {
      console.log('Update available! Downloading in background...')
    })

    autoUpdater.on('update-downloaded', function () {
      console.log('Update downloaded. Prompting user to restart.')
      const { dialog } = require('electron')
      dialog.showMessageBox({
        type: 'info',
        title: 'Cập Nhật Hoàn Tất 🚀',
        message: 'Bản cập nhật mới đã tải xuống hoàn tất. Bạn có muốn khởi động lại ứng dụng để áp dụng cập nhật ngay bây giờ?',
        buttons: ['Khởi động lại ngay', 'Để sau'],
        defaultId: 0
      }).then(function (result) {
        if (result.response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
    })

    autoUpdater.on('error', function (err) {
      console.error('Lỗi khi tự động cập nhật:', err)
    })

    // Run update check
    autoUpdater.checkForUpdatesAndNotify()
  } catch (e) {
    console.error('Không thể tải module auto updater:', e)
  }
})

app.on('window-all-closed', function () {
  Object.keys(connections).forEach(function (k) { connections[k].close() })
  saveSessionSnapshot()
  app.quit()
})

process.on('uncaughtException', function (error) {
  try {
    updateTelemetry({ unhandledErrors: 1 })
    logSystem('error', 'system', 'Uncaught exception in main process.', {
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : ''
    })
    saveSessionSnapshot()
  } catch (innerError) {
    console.error('Failed while handling uncaughtException:', innerError)
  }
})

process.on('unhandledRejection', function (reason) {
  try {
    updateTelemetry({ unhandledErrors: 1 })
    logSystem('error', 'system', 'Unhandled promise rejection in main process.', {
      reason: reason && reason.message ? reason.message : String(reason)
    })
    saveSessionSnapshot()
  } catch (innerError) {
    console.error('Failed while handling unhandledRejection:', innerError)
  }
})
