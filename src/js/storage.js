/**
 * FH Audio - Storage Manager (localStorage)
 * Centralized local storage for Roblox API Accounts, History, and User Settings.
 */

function getBackendUrl(endpoint) {
  if (!endpoint.startsWith('/')) endpoint = '/' + endpoint;
  const loc = (typeof window !== 'undefined' && window.location) ? window.location : null;
  if (loc && loc.port === '5520') {
    return endpoint;
  }
  const isLocal = loc && (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');
  const host = isLocal ? loc.hostname : '127.0.0.1';
  return `http://${host}:5520${endpoint}`;
}
window.getBackendUrl = getBackendUrl;

const STORAGE_KEYS = {
  ACCOUNTS: 'fhaudio_accounts_v1',
  HISTORY: 'fhaudio_history_v1',
  SETTINGS: 'fhaudio_settings_v1'
};

// Default Settings
const defaultSettings = {
  namingMode: 'stealth_scene', // 'stealth_scene' | 'original_song'
  aliasPrefix: 'BGM',
  sceneCategory: 'all',
  includeSongName: false,
  includePartNumber: true,
  defaultPresetSpeed: 2.3,
  defaultAmplification: -4,
  defaultQuality: 10,
  defaultMaxDuration: 250,
  uploadGatewayUrl: '', // Optional Cloudflare Worker URL if user wants 1-click in-browser
  autoUploadAfterConvert: false
};

// ----------------------------------------------------
// SERVER DISK SYNC HELPERS (Chrome <-> Firefox shared)
// ----------------------------------------------------
function pushHistoryToServer(list) {
  try {
    const url = getBackendUrl('/api/history');
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(list)
    }).catch(() => {});
  } catch (e) {}
}

function pushAccountsToServer(accounts) {
  try {
    const url = getBackendUrl('/api/accounts');
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(accounts)
    }).catch(() => {});
  } catch (e) {}
}

function pushSettingsToServer(settings) {
  try {
    const url = getBackendUrl('/api/settings');
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(() => {});
  } catch (e) {}
}

let isSyncing = false;
async function syncWithServer() {
  if (isSyncing) return;
  isSyncing = true;
  try {
    // 1. Sync History from server disk
    const histResp = await fetch(getBackendUrl('/api/history'));
    if (histResp.ok) {
      const serverHistory = await histResp.json();
      const localHistory = getHistory();
      if (Array.isArray(serverHistory) && serverHistory.length > 0) {
        // Merge without duplicates
        const merged = [...serverHistory];
        localHistory.forEach(loc => {
          if (!merged.some(m => m.id === loc.id)) {
            merged.push(loc);
          }
        });
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(merged));
        if (merged.length !== serverHistory.length) {
          pushHistoryToServer(merged);
        }
      } else if (localHistory.length > 0) {
        // Initial sync: push existing local history to server disk
        pushHistoryToServer(localHistory);
      }
    }

    // 2. Sync Accounts from server disk
    const accResp = await fetch(getBackendUrl('/api/accounts'));
    if (accResp.ok) {
      const serverAccounts = await accResp.json();
      const localAccounts = getAccounts();
      if (Array.isArray(serverAccounts) && serverAccounts.length > 0) {
        localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(serverAccounts));
      } else if (localAccounts.length > 0) {
        pushAccountsToServer(localAccounts);
      }
    }

    // 3. Sync Settings from server disk
    const setResp = await fetch(getBackendUrl('/api/settings'));
    if (setResp.ok) {
      const serverSettings = await setResp.json();
      if (serverSettings && typeof serverSettings === 'object' && Object.keys(serverSettings).length > 0) {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(serverSettings));
      }
    }

    // Re-render active UI dashboards
    if (window.FHHistory && typeof window.FHHistory.renderHistoryDashboard === 'function') {
      window.FHHistory.renderHistoryDashboard();
    }
    if (window.FHSettings && typeof window.FHSettings.renderAccountsList === 'function') {
      window.FHSettings.renderAccountsList();
    }
  } catch (err) {
    console.warn('Server sync error (running offline):', err);
  } finally {
    isSyncing = false;
  }
}

// Initialize with safe fallback
function getSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    return raw ? { ...defaultSettings, ...JSON.parse(raw) } : { ...defaultSettings };
  } catch (e) {
    return { ...defaultSettings };
  }
}

function saveSettings(settings) {
  try {
    const prev = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    const nextStr = JSON.stringify(settings);
    // If settings haven't changed, don't trigger server push or disk writes
    if (prev === nextStr) return true;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, nextStr);
    pushSettingsToServer(settings);
    return true;
  } catch (e) {
    console.error('Error saving settings:', e);
    return false;
  }
}

// ----------------------------------------------------
// ACCOUNTS MANAGEMENT (Roblox Open Cloud API Keys)
// ----------------------------------------------------

function getAccounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACCOUNTS);
    if (!raw) {
      return [];
    }
    const accounts = JSON.parse(raw);
    if (Array.isArray(accounts)) {
      return accounts.filter(a => a && typeof a === 'object' && a.id && a.apiKey);
    }
    return [];
  } catch (e) {
    return [];
  }
}

function saveAccounts(accounts) {
  try {
    localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
    pushAccountsToServer(accounts);
    return true;
  } catch (e) {
    console.error('Error saving accounts:', e);
    return false;
  }
}

function getActiveAccount() {
  const accounts = getAccounts();
  return accounts.find(a => a.isActive) || accounts[0] || null;
}

function setActiveAccount(id) {
  const accounts = getAccounts();
  accounts.forEach(acc => {
    acc.isActive = (acc.id === id);
  });
  saveAccounts(accounts);
  return getActiveAccount();
}

function addOrUpdateAccount(accData) {
  const accounts = getAccounts();
  const existingIdx = accounts.findIndex(a => a.id === accData.id);

  if (existingIdx >= 0) {
    accounts[existingIdx] = { ...accounts[existingIdx], ...accData };
  } else {
    const newAcc = {
      id: accData.id || 'acc_' + Date.now(),
      name: accData.name || 'Roblox Account',
      creatorType: accData.creatorType || 'user',
      creatorId: accData.creatorId || '',
      apiKey: accData.apiKey || '',
      isActive: accounts.length === 0 ? true : !!accData.isActive,
      createdAt: new Date().toISOString()
    };
    if (newAcc.isActive) {
      accounts.forEach(a => a.isActive = false);
    }
    accounts.push(newAcc);
  }

  saveAccounts(accounts);
  return accounts;
}

function deleteAccount(id) {
  let accounts = getAccounts();
  const wasActive = accounts.find(a => a.id === id)?.isActive;
  accounts = accounts.filter(a => a.id !== id);
  if (wasActive && accounts.length > 0) {
    accounts[0].isActive = true;
  }
  saveAccounts(accounts);
  return accounts;
}

// ----------------------------------------------------
// CONVERSION & UPLOAD HISTORY
// ----------------------------------------------------

function getHistory() {
  try {
    let raw = localStorage.getItem(STORAGE_KEYS.HISTORY);
    if (!raw) return [];
    let parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Only return real user history, remove any dummy sample items
    const list = parsed.filter(item => 
      item.id !== 'hist_1' && 
      item.id !== 'hist_2' && 
      item.id !== 'hist_yame' && 
      item.id !== 'hist_djne'
    );

    let mutated = false;
    list.forEach(item => {
      if (!item.sceneAlias && window.FHAlias) {
        item.sceneAlias = window.FHAlias.getDeterministicScene(item.id || item.title);
        mutated = true;
      }
      const baseScene = item.sceneAlias || 'Main_Lobby';
      const parts = item.parts || [];
      parts.forEach(part => {
        if (!part.robloxAlias && window.FHAlias) {
          const pNum = part.partNum || 1;
          part.robloxAlias = window.FHAlias.generatePartAlias(baseScene, pNum, parts.length, 'BGM');
          part.assetName = part.robloxAlias;
          mutated = true;
        }
      });
    });

    if (mutated) {
      try {
        localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(list));
      } catch (e) {}
    }
    return list;
  } catch (e) {
    return [];
  }
}

// ----------------------------------------------------
// INDEXEDDB AUDIO BLOB STORAGE (Persistent Local Audio)
// ----------------------------------------------------
const DB_NAME = 'FHAudioDB';
const DB_VERSION = 1;
const STORE_NAME = 'partBlobs';

function openAudioDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) {
      reject(new Error('IndexedDB not supported'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function savePartBlob(historyId, partNum, blob) {
  const key = `${historyId}_part_${partNum}`;
  try {
    const db = await openAudioDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not save part to IndexedDB:', e);
  }

  // Sync audio to local server disk for cross-browser playback
  if (blob) {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        fetch(getBackendUrl('/api/save-audio'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, audioBase64: base64data })
        }).catch(() => {});
      };
    } catch (e) {}
  }
  return true;
}

async function getPartBlob(historyId, partNum) {
  const key = `${historyId}_part_${partNum}`;
  // 1. Try local IndexedDB
  try {
    const db = await openAudioDB();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (blob) return blob;
  } catch (e) {}

  // 2. Fallback: Fetch from server disk (shared with Firefox/Chrome)
  try {
    const url = getBackendUrl(`/api/audio-blob?id=${encodeURIComponent(key)}`);
    const resp = await fetch(url);
    if (resp.ok) {
      const blob = await resp.blob();
      try {
        const db = await openAudioDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, key);
      } catch (e) {}
      return blob;
    }
  } catch (e) {}

  return null;
}

function saveHistory(historyList) {
  try {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(historyList));
    pushHistoryToServer(historyList);
    return true;
  } catch (e) {
    console.error('Error saving history:', e);
    return false;
  }
}

function addHistoryItem(item) {
  const list = getHistory();
  const settings = getSettings();
  const category = settings.sceneCategory || 'all';
  const prefix = settings.aliasPrefix || 'BGM';
  const baseScene = item.sceneAlias || (window.FHAlias ? window.FHAlias.getRandomScene(category) : 'Main_Lobby');

  const rawParts = item.parts || [
    {
      partNum: 1,
      duration: '0:00',
      assetId: '',
      viaAccount: '',
      moderationStatus: 'unchecked'
    }
  ];

  const processedParts = rawParts.map((p, idx) => {
    const pNum = p.partNum || (idx + 1);
    const alias = p.robloxAlias || (window.FHAlias ? window.FHAlias.generatePartAlias(baseScene, pNum, rawParts.length, prefix) : `${prefix}_${baseScene}_Part${pNum}`);
    return {
      ...p,
      partNum: pNum,
      robloxAlias: alias,
      assetName: p.assetName || alias
    };
  });

  const newItem = {
    id: item.id || 'hist_' + Date.now(),
    title: item.title || 'Untitled Audio',
    sceneAlias: baseScene,
    sourceUrl: item.sourceUrl || '',
    thumbnail: item.thumbnail || '',
    timestamp: item.timestamp || new Date().toLocaleString(),
    speed: item.speed || 2.3,
    robloxSpeed: item.robloxSpeed || 0.435,
    volumeDb: item.volumeDb || -4,
    robloxVolume: item.robloxVolume || 1.58,
    quality: item.quality || 10,
    maxPartDuration: item.maxPartDuration || 250,
    parts: processedParts
  };
  list.unshift(newItem);
  saveHistory(list);
  return newItem;
}

function rerollItemScene(historyId) {
  const list = getHistory();
  const item = list.find(h => h.id === historyId);
  if (!item || !window.FHAlias) return null;

  const settings = getSettings();
  const category = settings.sceneCategory || 'all';
  const prefix = settings.aliasPrefix || 'BGM';

  let newScene = window.FHAlias.getRandomScene(category);
  // Ensure it's different from the old one
  if (newScene === item.sceneAlias && window.FHAlias.ALL_SCENES.length > 1) {
    newScene = window.FHAlias.getRandomScene(category);
  }

  item.sceneAlias = newScene;
  const parts = item.parts || [];
  parts.forEach(p => {
    p.robloxAlias = window.FHAlias.generatePartAlias(newScene, p.partNum, parts.length, prefix);
    p.assetName = p.robloxAlias;
    // Reset status to unchecked so user can re-upload fresh
    if (p.moderationStatus === 'rejected') {
      p.moderationStatus = 'unchecked';
      p.uploadStatus = 'idle';
      p.assetId = '';
    }
  });

  saveHistory(list);
  return item;
}

function updateHistoryPart(historyId, partNum, updates) {
  const list = getHistory();
  const item = list.find(h => h.id === historyId);
  if (!item) return null;
  const part = item.parts.find(p => p.partNum === partNum);
  if (!part) return null;

  Object.assign(part, updates);
  saveHistory(list);
  return item;
}

function updateHistoryItem(historyId, updates) {
  const list = getHistory();
  const item = list.find(h => h.id === historyId);
  if (!item) return null;
  Object.assign(item, updates);
  saveHistory(list);
  return item;
}

async function saveOriginalBlob(historyId, blob) {
  const key = `${historyId}_original`;
  try {
    const db = await openAudioDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(blob, key);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn('Could not save original blob to IndexedDB:', e);
  }

  // Push to server disk for cross-browser playback
  if (blob) {
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = () => {
        const base64data = reader.result.split(',')[1];
        fetch(getBackendUrl('/api/save-audio'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, audioBase64: base64data })
        }).catch(() => {});
      };
    } catch (e) {}
  }
  return true;
}

async function getOriginalBlob(historyId) {
  const key = `${historyId}_original`;
  try {
    const db = await openAudioDB();
    const blob = await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    if (blob) return blob;
  } catch (e) {}

  // Fallback from server disk (Firefox / cross-browser)
  try {
    const url = getBackendUrl(`/api/audio-blob?id=${encodeURIComponent(key)}`);
    const resp = await fetch(url);
    if (resp.ok) {
      const blob = await resp.blob();
      try {
        const db = await openAudioDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(blob, key);
      } catch (e) {}
      return blob;
    }
  } catch (e) {}

  return null;
}

function deleteHistoryItem(id) {
  let list = getHistory();
  list = list.filter(h => h.id !== id);
  saveHistory(list);
  return list;
}

// ----------------------------------------------------
// CSV & DATA EXPORT
// ----------------------------------------------------

function exportHistoryTXT() {
  const list = getHistory();
  if (!list.length) return false;

  const sep = '='.repeat(76);
  const subSep = '-'.repeat(76);

  let totalParts = 0;
  let totalUploaded = 0;
  list.forEach(item => {
    (item.parts || []).forEach(p => {
      totalParts++;
      if (p.assetId) totalUploaded++;
    });
  });

  const nowStr = new Date().toLocaleString('id-ID', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });

  const lines = [
    sep,
    '                  FH AUDIO - LAPORAN RIWAYAT BYPASS AUDIO',
    `                  Waktu Ekspor: ${nowStr}`,
    sep,
    `Total Lagu       : ${list.length}`,
    `Total Part Audio : ${totalParts}`,
    `Status Terunggah : ${totalUploaded} / ${totalParts} Part`,
    sep,
    ''
  ];

  list.forEach((item, idx) => {
    lines.push(`[${idx + 1}] JUDUL LAGU: ${item.title || 'Untitled Audio'}`);
    lines.push(`    • ID Record       : ${item.id}`);
    lines.push(`    • Waktu Konversi  : ${item.timestamp || '-'}`);
    lines.push(`    • Speed Bypass    : ${item.speed || '2.3'}x`);
    lines.push(`    • Speed di Roblox : ${item.robloxSpeed || '0.43'}x (PlaybackSpeed)`);
    lines.push(`    • Volume / Gain   : ${item.volumeDb || '-4'} dB (Roblox Volume: ${item.robloxVolume || '2.0'})`);
    lines.push(`    • Jumlah Part     : ${(item.parts || []).length} Part`);
    lines.push('');
    lines.push('    DAFTAR PART & ASSET ID ROBLOX:');
    lines.push(`    ${subSep.slice(4)}`);

    (item.parts || []).forEach(part => {
      const assetStr = part.assetId ? `rbxassetid://${part.assetId}  (Raw ID: ${part.assetId})` : 'Belum diunggah (-)';
      const mod = (part.moderationStatus || '').toLowerCase();
      let modStatus = '[ Belum Dicek ]';
      if (mod === 'approved') modStatus = '[ APPROVED ✓ ]';
      else if (mod === 'rejected' || mod === 'blocked') modStatus = '[ DITOLAK ROBLOX ✕ ]';
      else if (mod === 'reviewing') modStatus = '[ MENUNGGU REVIEW... ]';

      lines.push(`    • Part ${part.partNum}`);
      lines.push(`      - Judul Asli  : ${item.title || 'Untitled Audio'}`);
      lines.push(`      - Roblox Alias: ${part.robloxAlias || part.assetName || '-'}`);
      lines.push(`      - Nama File   : ${part.filename || `${item.title}_part${part.partNum}.ogg`}`);
      lines.push(`      - Asset ID    : ${assetStr}`);
      lines.push(`      - Moderasi    : ${modStatus}`);
      lines.push(`      - Akun Upload : ${part.viaAccount || '-'}`);
      lines.push('');
    });

    lines.push(subSep);
    lines.push('');
  });

  lines.push(sep);
  lines.push('             PANDUAN PEMUTARAN AUDIO DI ROBLOX (LUA SCRIPT)');
  lines.push(sep);
  lines.push('-- Buat Sound baru di Roblox Studio, lalu atur properties berikut:');
  lines.push('local sound = Instance.new("Sound")');
  lines.push('sound.SoundId = "rbxassetid://<ASSET_ID>"');
  lines.push('sound.PlaybackSpeed = 0.43 -- Ganti dengan nilai "Speed di Roblox"');
  lines.push('sound.Volume = 2.0         -- Ganti dengan nilai "Roblox Volume"');
  lines.push('sound.Parent = workspace');
  lines.push('sound:Play()');
  lines.push(sep);

  const textContent = lines.join('\r\n');
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `FH_Audio_History_${new Date().toISOString().slice(0, 10)}.txt`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

function exportHistoryTXTSimple() {
  const list = getHistory();
  if (!list.length) return false;

  const lines = [];

  list.forEach(item => {
    const cleanTitle = (item.title || 'Audio').replace(/\.[^/.]+$/, '');
    const parts = item.parts || [];
    if (parts.length === 0) {
      lines.push(`${cleanTitle}: -`);
    } else {
      parts.forEach(part => {
        const alias = part.robloxAlias || part.assetName || '';
        const aliasStr = alias ? ` (${alias})` : '';
        const partSuffix = parts.length > 1 ? ` [Part ${part.partNum}]` : '';
        const rawId = part.assetId || '-';
        lines.push(`${cleanTitle}${partSuffix}${aliasStr} : ${rawId}`);
      });
    }
  });

  const textContent = lines.join('\r\n');
  const blob = new Blob([textContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `FH_Audio_Simple_${new Date().toISOString().slice(0, 10)}.txt`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

function exportHistoryCSV() {
  const list = getHistory();
  if (!list.length) return false;

  const rows = [
    ['ID', 'Title', 'Roblox Alias', 'Timestamp', 'Speed', 'Set Speed in Roblox', 'Volume (dB)', 'Set Volume in Roblox', 'Part', 'Asset ID', 'Uploaded Via', 'Moderation Status']
  ];

  list.forEach(item => {
    (item.parts || []).forEach(part => {
      rows.push([
        `"${item.id}"`,
        `"${(item.title || '').replace(/"/g, '""')}"`,
        `"${(part.robloxAlias || part.assetName || '').replace(/"/g, '""')}"`,
        `"${item.timestamp}"`,
        `"${item.speed}x"`,
        `"${item.robloxSpeed}"`,
        `"${item.volumeDb} dB"`,
        `"${item.robloxVolume}"`,
        `"Part ${part.partNum}"`,
        `"${part.assetId || '-'}"`,
        `"${part.viaAccount || '-'}"`,
        `"${part.moderationStatus || 'unchecked'}"`
      ]);
    });
  });

  const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `FH_Audio_History_${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// Global Export on window
window.FHStorage = {
  getSettings,
  saveSettings,
  getAccounts,
  saveAccounts,
  getActiveAccount,
  setActiveAccount,
  addOrUpdateAccount,
  deleteAccount,
  getHistory,
  saveHistory,
  addHistoryItem,
  updateHistoryItem,
  updateHistoryPart,
  rerollItemScene,
  deleteHistoryItem,
  exportHistoryTXT,
  exportHistoryTXTSimple,
  exportHistoryCSV,
  savePartBlob,
  getPartBlob,
  saveOriginalBlob,
  getOriginalBlob,
  syncWithServer
};
