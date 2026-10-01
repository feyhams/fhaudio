/**
 * FH Audio - Conversion History Dashboard Module
 * Implements stats cards, moderation filter tabs, search, card rendering,
 * and REAL functional actions: Audio Preview, Show in Windows Explorer,
 * Roblox Open Cloud direct uploader, and CSV Export.
 */

function initHistoryModule() {
  const historyListEl = document.getElementById('historyList');
  const statSongs = document.getElementById('statSongs');
  const statParts = document.getElementById('statParts');
  const statUploaded = document.getElementById('statUploaded');
  const historySearchInput = document.getElementById('historySearchInput');
  const btnHistoryExportTxtSimple = document.getElementById('btnHistoryExportTxtSimple');
  const btnHistoryExportTxt = document.getElementById('btnHistoryExportTxt');
  const btnHistoryExportCsv = document.getElementById('btnHistoryExportCsv');
  const btnHistoryUploadAll = document.getElementById('btnHistoryUploadAll');
  const btnHistoryUploadAllText = document.getElementById('btnHistoryUploadAllText');
  const btnHistoryCheckAll = document.getElementById('btnHistoryCheckAll');

  // Filter tabs
  const tabFilterAll = document.getElementById('tabFilterAll');
  const tabFilterApproved = document.getElementById('tabFilterApproved');
  const tabFilterRejected = document.getElementById('tabFilterRejected');
  const tabFilterReviewing = document.getElementById('tabFilterReviewing');
  const tabFilterUnchecked = document.getElementById('tabFilterUnchecked');

  let currentFilter = 'all'; // 'all' | 'approved' | 'rejected' | 'reviewing' | 'unchecked'
  let searchQuery = '';

  // Unified audio preview player state — Web Audio API based
  const previewPlayer = {
    source: null,         // AudioBufferSourceNode
    audioCtx: null,       // AudioContext
    playingId: null,      // item.id
    playingType: null,    // 'real_song' | 'part_preview' | 'part_real'
    playingPartNum: null, // part.partNum
    loadingId: null,      // item.id while fetching blob
    loadingType: null,
    loadingPartNum: null
  };

  function getPreviewAudioCtx() {
    if (!previewPlayer.audioCtx) {
      const Cls = window.AudioContext || window.webkitAudioContext;
      previewPlayer.audioCtx = new Cls();
    }
    if (previewPlayer.audioCtx.state === 'suspended') {
      previewPlayer.audioCtx.resume().catch(() => {});
    }
    return previewPlayer.audioCtx;
  }

  // Active in-memory upload jobs tracker: key -> { controller, timer, startTime }
  const activeUploadJobs = new Map();

  function cancelOrResetUpload(itemId, partNum) {
    const jobKey = `${itemId}_${partNum}`;
    if (activeUploadJobs.has(jobKey)) {
      const job = activeUploadJobs.get(jobKey);
      if (job.controller) {
        try { job.controller.abort(); } catch (e) {}
      }
      if (job.timer) clearTimeout(job.timer);
      activeUploadJobs.delete(jobKey);
    }
    const list = window.FHStorage.getHistory();
    const item = list.find(h => h.id === itemId);
    const part = (item?.parts || []).find(p => p.partNum === partNum);
    const fallbackMod = (part && (part.assetId || part.operationPath)) ? part.moderationStatus : 'unchecked';
    window.FHStorage.updateHistoryPart(itemId, partNum, {
      uploadStatus: 'idle',
      moderationStatus: fallbackMod
    });
    window.showToast(`Status upload Part ${partNum} di-reset ke siap upload.`);
    renderHistoryDashboard();
  }

  function renderHistoryDashboard() {
    let list = window.FHStorage.getHistory();

    // Auto-heal orphaned 'uploading' states (from previous browser sessions/reloads)
    // or phantom 'reviewing' states (items without assetId or operationPath)
    let needsSave = false;
    list.forEach(item => {
      (item.parts || []).forEach(part => {
        const jobKey = `${item.id}_${part.partNum}`;
        const isJobRunning = activeUploadJobs.has(jobKey);

        if (part.uploadStatus === 'uploading' && !isJobRunning) {
          part.uploadStatus = 'idle';
          if (!part.assetId && !part.operationPath) {
            part.moderationStatus = 'unchecked';
          }
          window.FHStorage.updateHistoryPart(item.id, part.partNum, {
            uploadStatus: 'idle',
            moderationStatus: part.moderationStatus
          });
          needsSave = true;
        } else if (part.moderationStatus === 'reviewing' && !part.assetId && !part.operationPath && part.uploadStatus !== 'uploading') {
          part.moderationStatus = 'unchecked';
          part.uploadStatus = 'idle';
          window.FHStorage.updateHistoryPart(item.id, part.partNum, {
            uploadStatus: 'idle',
            moderationStatus: 'unchecked'
          });
          needsSave = true;
        }
      });
    });

    if (needsSave) {
      list = window.FHStorage.getHistory();
    }

    // 1. Calculate REAL dynamic stats from user's history
    let totalSongs = list.length;
    let totalParts = 0;
    let totalUploaded = 0;
    let countApproved = 0;
    let countRejected = 0;
    let countReviewing = 0;
    let countUnchecked = 0;
    let unuploadedCount = 0;

    list.forEach(item => {
      (item.parts || []).forEach(part => {
        totalParts++;
        const status = part.moderationStatus || 'unchecked';
        const hasAsset = !!part.assetId;

        if (status === 'approved' || (hasAsset && status !== 'rejected')) {
          countApproved++;
          totalUploaded++;
        } else if (status === 'rejected') {
          countRejected++;
        } else if (status === 'reviewing') {
          countReviewing++;
          if (hasAsset) totalUploaded++;
        } else {
          countUnchecked++;
        }

        if (!hasAsset && status !== 'approved') {
          unuploadedCount++;
        }
      });
    });

    if (statSongs) statSongs.textContent = totalSongs;
    if (statParts) statParts.textContent = totalParts;
    if (statUploaded) statUploaded.textContent = totalUploaded;

    // Update filter badge counts
    updateBadge(tabFilterAll, totalParts);
    updateBadge(tabFilterApproved, countApproved);
    updateBadge(tabFilterRejected, countRejected);
    updateBadge(tabFilterReviewing, countReviewing);
    updateBadge(tabFilterUnchecked, countUnchecked);

    if (btnHistoryUploadAllText) {
      btnHistoryUploadAllText.textContent = `Upload all (${unuploadedCount})`;
    }

    // 2. Filter items according to active search and status filter
    let filteredList = list.filter(item => {
      const titleMatch = (item.title || '').toLowerCase().includes(searchQuery.toLowerCase());
      if (!titleMatch && searchQuery) return false;

      if (currentFilter === 'all') return true;

      return (item.parts || []).some(part => {
        const status = part.moderationStatus || 'unchecked';
        return status === currentFilter;
      });
    });

    renderCards(filteredList);
  }

  function updateBadge(tabEl, count) {
    if (!tabEl) return;
    const badge = tabEl.querySelector('.filter-badge');
    if (badge) badge.textContent = count;
  }

  const collapsedDates = new Set();

  function getItemDateInfo(item) {
    let dateObj = null;

    if (item.createdAt && typeof item.createdAt === 'number') {
      dateObj = new Date(item.createdAt);
    } else if (item.id && typeof item.id === 'string' && item.id.startsWith('hist_')) {
      const rawTs = parseInt(item.id.replace('hist_', ''), 10);
      if (!isNaN(rawTs) && rawTs > 1500000000000) {
        dateObj = new Date(rawTs);
      }
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      if (item.timestamp && typeof item.timestamp === 'string') {
        const ts = item.timestamp.trim();
        const dmyMatch = ts.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/);
        if (dmyMatch) {
          const day = parseInt(dmyMatch[1], 10);
          const month = parseInt(dmyMatch[2], 10) - 1;
          const year = parseInt(dmyMatch[3], 10);
          dateObj = new Date(year, month, day);
        } else {
          const parsed = Date.parse(ts);
          if (!isNaN(parsed)) {
            dateObj = new Date(parsed);
          }
        }
      }
    }

    if (!dateObj || isNaN(dateObj.getTime())) {
      dateObj = new Date();
    }

    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    const dateKey = `${y}-${m}-${d}`;

    const today = new Date();
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const monthNamesId = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const formattedFull = `${dateObj.getDate()} ${monthNamesId[dateObj.getMonth()]} ${dateObj.getFullYear()}`;

    let displayLabel = '';
    if (dateKey === todayKey) {
      displayLabel = `Hari Ini — ${formattedFull}`;
    } else if (dateKey === yesterdayKey) {
      displayLabel = `Kemarin — ${formattedFull}`;
    } else {
      displayLabel = formattedFull;
    }

    return {
      dateKey,
      dateObj,
      displayLabel
    };
  }

  function buildHistoryCard(item) {
    const card = document.createElement('div');
    card.className = 'history-card';

    const thumbUrl = item.thumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=60';

    card.innerHTML = `
      <div class="history-card-top">
        <div class="history-card-meta-left">
          <img src="${escapeHtml(thumbUrl)}" class="history-thumb" alt="Thumb" onerror="this.src='data:image/svg+xml;utf8,<svg xmlns=\\'http://www.w3.org/2000/svg\\' width=\\'52\\' height=\\'52\\' fill=\\'%23121825\\'><rect width=\\'100%\\' height=\\'100%\\'/></svg>'" />
          <div class="history-title-wrap">
            <div class="history-title-row">
              <span class="history-song-title" title="Klik untuk mengedit judul">${escapeHtml(item.title)}</span>
              <button type="button" class="btn-edit-title" title="Edit judul lagu">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
              </button>
            </div>
            <div class="history-alias-row">
              <span class="history-alias-badge" title="Tema Scene/Place yang dikirim ke Roblox">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                <span>Roblox Scene: <b>${escapeHtml(item.sceneAlias || 'Main_Lobby')}</b></span>
              </span>
              <button type="button" class="btn-reroll-alias" title="Acak scene/place Roblox baru untuk meloloskan moderasi">
                🎲 Ganti Scene
              </button>
              <span class="history-timestamp" style="margin-left: auto;">${escapeHtml(item.timestamp || '')}</span>
            </div>
          </div>
        </div>
        <div class="history-card-top-right">
          <button type="button" class="btn-open-in-studio" data-id="${item.id}" title="Buka master audio lagu ini ke Studio untuk atur ulang speed/volume & konversi ulang">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            <span>Buka di Studio</span>
          </button>
          <button type="button" class="btn-preview-real-song" data-id="${item.id}" title="Dengarkan lagu asli pada kecepatan normal (1.0x / Simulasi Roblox)">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
            <span>Real Song</span>
          </button>
          <button type="button" class="btn-delete-card" title="Hapus dari riwayat">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="history-params-row">
        <span class="history-param-chip">Speed: <b>${item.speed || 2.3}x</b></span>
        <span class="history-param-chip copyable btn-copy-speed" title="Klik untuk salin PlaybackSpeed">
          Set Speed in Roblox: <span class="val-gold">${item.robloxSpeed || 0.435}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </span>
        <span class="history-param-chip">Volume: <b>${item.volumeDb || -4} dB</b></span>
        <span class="history-param-chip copyable btn-copy-vol" title="Klik untuk salin Volume">
          Set Volume in Roblox: <span class="val-gold">${item.robloxVolume || 1.58}</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </span>
        <span class="history-param-chip">Quality: <b>${item.quality || 10}</b></span>
        <span class="history-param-chip">Max Part: <b>${item.maxPartDuration || 250}s</b></span>
      </div>

      <div class="history-parts-box"></div>
    `;

    // Wire edit title
    const editTitleBtn = card.querySelector('.btn-edit-title');
    const songTitleEl = card.querySelector('.history-song-title');
    const handleEditTitle = () => {
      const currentTitle = item.title || '';
      const newTitle = prompt('Ubah judul lagu:', currentTitle);
      if (newTitle && newTitle.trim() && newTitle.trim() !== currentTitle) {
        window.FHStorage.updateHistoryItem(item.id, { title: newTitle.trim() });
        renderHistoryDashboard();
        window.showToast(`Judul diubah menjadi: "${newTitle.trim()}"`);
      }
    };
    if (editTitleBtn) editTitleBtn.addEventListener('click', handleEditTitle);
    if (songTitleEl) songTitleEl.addEventListener('click', handleEditTitle);

    // Wire Reroll Scene Alias
    const rerollBtn = card.querySelector('.btn-reroll-alias');
    if (rerollBtn) {
      rerollBtn.addEventListener('click', () => {
        const updated = window.FHStorage.rerollItemScene(item.id);
        if (updated) {
          renderHistoryDashboard();
          window.showToast(`Scene Roblox diubah ke: "${updated.sceneAlias}"`);
        }
      });
    }

    // Wire Open in Studio
    const openStudioBtn = card.querySelector('.btn-open-in-studio');
    if (openStudioBtn) {
      openStudioBtn.addEventListener('click', () => {
        if (typeof window.loadTrackIntoStudio === 'function') {
          window.loadTrackIntoStudio(item);
        }
      });
    }

    // Wire Real Song preview
    const realSongBtn = card.querySelector('.btn-preview-real-song');
    if (realSongBtn) {
      realSongBtn.addEventListener('click', () => {
        playRealSongPreview(item);
      });
    }

    // Wire delete card
    card.querySelector('.btn-delete-card').addEventListener('click', () => {
      if (confirm(`Hapus "${item.title}" dari riwayat?`)) {
        window.FHStorage.deleteHistoryItem(item.id);
        renderHistoryDashboard();
        window.showToast('Item berhasil dihapus dari riwayat.');
      }
    });

    // Wire copy speed
    card.querySelector('.btn-copy-speed').addEventListener('click', () => {
      copyToClipboard((item.robloxSpeed || 0.435).toString());
      window.showToast(`PlaybackSpeed (${item.robloxSpeed}) disalin!`);
    });

    // Wire copy volume
    card.querySelector('.btn-copy-vol').addEventListener('click', () => {
      copyToClipboard((item.robloxVolume || 1.58).toString());
      window.showToast(`Roblox Volume (${item.robloxVolume}) disalin!`);
    });

    // Render parts
    const partsBox = card.querySelector('.history-parts-box');
    (item.parts || []).forEach(part => {
      const partRow = document.createElement('div');
      partRow.className = 'history-part-item';

      const status = (part.moderationStatus || 'unchecked').toLowerCase();
      const hasAssetId = !!part.assetId;
      const isUploading = part.uploadStatus === 'uploading';
      const isRejected = (status === 'rejected' || status === 'blocked');
      const isReviewing = (status === 'reviewing');

      let rightActionsHtml = '';
      if (isUploading) {
        rightActionsHtml = `
          <div style="display:inline-flex; align-items:center; gap:0.4rem;">
            <span class="status-pill reviewing" style="background: rgba(234, 179, 8, 0.15); color: #fbbf24;">
              <svg class="spin-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg>
              <span>Mengunggah...</span>
            </span>
            <button type="button" class="btn-cancel-upload" data-id="${item.id}" data-part="${part.partNum}" title="Batal atau Reset Status Upload" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.35); color: #f87171; border-radius: 6px; padding: 0.25rem 0.55rem; font-size: 0.72rem; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 0.25rem;">
              ✕ Reset
            </button>
          </div>
        `;
      } else if (isRejected) {
        rightActionsHtml = `
          ${hasAssetId ? `
            <div class="asset-id-badge btn-copy-asset" style="border-color: rgba(239, 68, 68, 0.35); background: rgba(239, 68, 68, 0.08); color: #f87171;" title="Asset ID dibuat namun ditolak moderasi Roblox">
              <span>Asset ID: ${escapeHtml(part.assetId)}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
            </div>
          ` : ''}
          <span class="status-pill rejected" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.35); font-weight: 800;">
            DITOLAK ROBLOX ✕
          </span>
          <button type="button" class="btn-part-reconvert" data-id="${item.id}" style="background: rgba(250, 204, 21, 0.15); border: 1px solid rgba(250, 204, 21, 0.35); color: #facc15; font-size: 0.8rem; font-weight: 700; padding: 0.4rem 0.85rem; border-radius: 8px; cursor: pointer;" title="Buka lagu ini ke Studio untuk ubah setting speed/volume agar lolos moderasi">↺ Buka di Studio</button>
          <button type="button" class="btn-part-upload" style="background: rgba(239, 68, 68, 0.25); border: 1px solid rgba(239, 68, 68, 0.45); color: #fff; font-size: 0.8rem; padding: 0.4rem 0.85rem;" title="Ganti nama alias scene dan upload ulang ke Roblox">🎲 Ganti Scene & Upload Ulang</button>
        `;
      } else if (hasAssetId && status === 'approved') {
        rightActionsHtml = `
          <div class="asset-id-badge btn-copy-asset" title="Klik untuk salin Asset ID">
            <span>Asset ID: ${escapeHtml(part.assetId)}</span>
            ${part.viaAccount ? `<span style="color:var(--text-dim); font-size:0.7rem;">via ${escapeHtml(part.viaAccount)}</span>` : ''}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          </div>
          <span class="status-pill approved">APPROVED ✓</span>
        `;
      } else if (isReviewing || (part.uploadStatus === 'uploaded' && !hasAssetId)) {
        rightActionsHtml = `
          ${hasAssetId ? `
            <div class="asset-id-badge btn-copy-asset" title="Asset ID sementara saat review">
              <span>ID: ${escapeHtml(part.assetId)}</span>
            </div>
          ` : ''}
          <div class="reviewing-group">
            <span class="status-pill reviewing" title="Roblox sedang meninjau audio ini. Status akan diperbarui otomatis...">
              <span class="pulse-dot"></span>
              <span>Sedang Ditinjau Roblox...</span>
            </span>
            <button type="button" class="btn-check-moderation" title="Periksa status moderasi ke Roblox">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>
              <span>Cek Status</span>
            </button>
          </div>
        `;
      } else {
        rightActionsHtml = `
          <button type="button" class="btn-part-upload">Upload to Roblox</button>
        `;
      }

      const aliasName = part.robloxAlias || part.assetName || (window.FHAlias ? window.FHAlias.generatePartAlias(item.sceneAlias || 'Main_Lobby', part.partNum, item.parts?.length || 1) : `BGM_Track_Part${part.partNum}`);

      partRow.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap;">
          <span class="part-label">Part ${part.partNum}</span>
          <span class="part-alias-pill" title="Nama aset yang dikirim ke Roblox">
            🏷️ ${escapeHtml(aliasName)}
          </span>
        </div>
        <div class="part-actions-group">
          <button type="button" class="btn-part-preview" data-id="${item.id}" data-part="${part.partNum}" title="Putar audio part (kecepatan bypass ${item.speed || 2.3}x)">Preview Part</button>
          <button type="button" class="btn-part-preview-real" data-id="${item.id}" data-part="${part.partNum}" title="Putar part ini pada kecepatan normal Roblox (1.0x)">Real 1x</button>
          <button type="button" class="btn-part-explorer">Show in Explorer</button>
          ${rightActionsHtml}
        </div>
      `;

      // Action 1: Copy asset id
      const copyAssetBtn = partRow.querySelector('.btn-copy-asset');
      if (copyAssetBtn) {
        copyAssetBtn.addEventListener('click', () => {
          copyToClipboard(part.assetId);
          window.showToast(`Asset ID (${part.assetId}) disalin ke clipboard!`);
        });
      }

      // Action 2a: Sped-Up Audio Part Preview
      const previewBtn = partRow.querySelector('.btn-part-preview');
      if (previewBtn) {
        previewBtn.addEventListener('click', () => {
          playAudioPreview(item, part);
        });
      }

      // Action 2b: Real 1x Audio Preview for this part
      const previewRealBtn = partRow.querySelector('.btn-part-preview-real');
      if (previewRealBtn) {
        previewRealBtn.addEventListener('click', () => {
          playPartRealPreview(item, part);
        });
      }

      // Action 3: REAL Show in Windows Explorer
      const explorerBtn = partRow.querySelector('.btn-part-explorer');
      if (explorerBtn) {
        explorerBtn.addEventListener('click', () => {
          showPartInExplorer(item, part);
        });
      }

      // Action 4: REAL Upload to Roblox
      const uploadBtn = partRow.querySelector('.btn-part-upload');
      if (uploadBtn) {
        uploadBtn.addEventListener('click', () => {
          executeRobloxUpload(item, part.partNum, uploadBtn);
        });
      }

      // Action 4b: Reconvert in Studio
      const reconvertPartBtn = partRow.querySelector('.btn-part-reconvert');
      if (reconvertPartBtn) {
        reconvertPartBtn.addEventListener('click', () => {
          if (typeof window.loadTrackIntoStudio === 'function') {
            window.loadTrackIntoStudio(item);
          }
        });
      }

      // Action 5: Check Moderation Status
      const checkModBtn = partRow.querySelector('.btn-check-moderation');
      if (checkModBtn) {
        checkModBtn.addEventListener('click', async () => {
          checkModBtn.disabled = true;
          checkModBtn.innerHTML = `<svg class="spin-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg> Memeriksa...`;
          await checkPartModerationStatus(item, part);
          renderHistoryDashboard();
        });
      }

      // Action 6: Cancel / Reset stuck upload
      const cancelBtn = partRow.querySelector('.btn-cancel-upload');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          cancelOrResetUpload(item.id, part.partNum);
        });
      }

      partsBox.appendChild(partRow);
    });

    return card;
  }

  function renderCards(items) {
    if (!historyListEl) return;
    historyListEl.innerHTML = '';

    if (items.length === 0) {
      historyListEl.innerHTML = `
        <div class="empty-state">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <div style="font-weight: 600; color: #94a3b8;">Belum ada riwayat konversi yang tersimpan.</div>
          <div style="font-size: 0.85rem; color: #64748b;">Silakan masukkan URL YouTube di tab <b>Bypass Audio</b> lalu klik Convert.</div>
        </div>
      `;
      return;
    }

    // 1. Group items by dateKey
    const groupsMap = new Map();
    items.forEach(item => {
      const dateInfo = getItemDateInfo(item);
      if (!groupsMap.has(dateInfo.dateKey)) {
        groupsMap.set(dateInfo.dateKey, {
          dateKey: dateInfo.dateKey,
          displayLabel: dateInfo.displayLabel,
          timestampNum: dateInfo.dateObj.getTime(),
          items: []
        });
      }
      groupsMap.get(dateInfo.dateKey).items.push(item);
    });

    // 2. Sort groups descending (newest date first)
    const sortedGroups = Array.from(groupsMap.values()).sort((a, b) => b.timestampNum - a.timestampNum);

    // 3. Render each date group
    sortedGroups.forEach(group => {
      const groupEl = document.createElement('div');
      groupEl.className = 'history-date-group';
      if (collapsedDates.has(group.dateKey)) {
        groupEl.classList.add('collapsed');
      }

      groupEl.innerHTML = `
        <div class="history-date-header" data-key="${group.dateKey}" title="Klik untuk ciutkan / buka riwayat tanggal ini">
          <div class="history-date-header-left">
            <span class="history-date-icon">📅</span>
            <span class="history-date-title">${escapeHtml(group.displayLabel)}</span>
            <span class="history-date-badge">${group.items.length} Lagu</span>
          </div>
          <div class="history-date-header-right">
            <span class="history-date-toggle-hint">Klik untuk ciutkan</span>
            <svg class="history-date-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          </div>
        </div>
        <div class="history-date-cards"></div>
      `;

      const headerEl = groupEl.querySelector('.history-date-header');
      headerEl.addEventListener('click', () => {
        groupEl.classList.toggle('collapsed');
        if (groupEl.classList.contains('collapsed')) {
          collapsedDates.add(group.dateKey);
        } else {
          collapsedDates.delete(group.dateKey);
        }
      });

      const cardsContainer = groupEl.querySelector('.history-date-cards');
      group.items.forEach(item => {
        const card = buildHistoryCard(item);
        cardsContainer.appendChild(card);
      });

      historyListEl.appendChild(groupEl);
    });

    syncPlayerButtonsUI();
  }

  // ----------------------------------------------------
  // UNIFIED ROBUST AUDIO PREVIEW PLAYER SUITE
  // ----------------------------------------------------
  function syncPlayerButtonsUI() {
    // 1. Sync all Real Song buttons
    document.querySelectorAll('.btn-preview-real-song').forEach(btn => {
      const cardId = btn.dataset.id;
      if (previewPlayer.playingId === cardId && previewPlayer.playingType === 'real_song') {
        btn.classList.add('playing');
        btn.innerHTML = `⏸ <span>Pause Real Song</span>`;
      } else if (previewPlayer.loadingId === cardId && previewPlayer.loadingType === 'real_song') {
        btn.classList.remove('playing');
        btn.innerHTML = `⏳ <span>Memuat...</span>`;
      } else {
        btn.classList.remove('playing');
        btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> <span>Real Song</span>`;
      }
    });

    // 2. Sync all Part Preview buttons
    document.querySelectorAll('.btn-part-preview').forEach(btn => {
      const cardId = btn.dataset.id;
      const partNum = parseInt(btn.dataset.part, 10);
      if (previewPlayer.playingId === cardId && previewPlayer.playingType === 'part_preview' && previewPlayer.playingPartNum === partNum) {
        btn.classList.add('playing');
        btn.textContent = '⏸ Pause';
        btn.style.backgroundColor = '#fb7185';
      } else if (previewPlayer.loadingId === cardId && previewPlayer.loadingType === 'part_preview' && previewPlayer.loadingPartNum === partNum) {
        btn.classList.remove('playing');
        btn.textContent = 'Memuat...';
        btn.style.backgroundColor = '';
      } else {
        btn.classList.remove('playing');
        btn.textContent = 'Preview Part';
        btn.style.backgroundColor = '';
      }
    });

    // 3. Sync all Part Real buttons
    document.querySelectorAll('.btn-part-preview-real').forEach(btn => {
      const cardId = btn.dataset.id;
      const partNum = parseInt(btn.dataset.part, 10);
      if (previewPlayer.playingId === cardId && previewPlayer.playingType === 'part_real' && previewPlayer.playingPartNum === partNum) {
        btn.classList.add('playing');
        btn.textContent = '⏸ Pause';
      } else if (previewPlayer.loadingId === cardId && previewPlayer.loadingType === 'part_real' && previewPlayer.loadingPartNum === partNum) {
        btn.classList.remove('playing');
        btn.textContent = 'Memuat...';
      } else {
        btn.classList.remove('playing');
        btn.textContent = 'Real 1x';
      }
    });
  }

  function stopAllPreviews() {
    if (previewPlayer.source) {
      try {
        previewPlayer.source.onended = null;
        previewPlayer.source.stop();
        previewPlayer.source.disconnect();
      } catch (e) {}
      previewPlayer.source = null;
    }
    previewPlayer.playingId = null;
    previewPlayer.playingType = null;
    previewPlayer.playingPartNum = null;
    previewPlayer.loadingId = null;
    previewPlayer.loadingType = null;
    previewPlayer.loadingPartNum = null;
    syncPlayerButtonsUI();
  }

  // Decode any blob (OGG/WAV/MP3/WEBM/OPUS) to AudioBuffer via Web Audio API
  // Returns null if decode fails (corrupt blob) — callers must handle null
  async function decodeBlobToBuffer(blob) {
    try {
      const ctx = getPreviewAudioCtx();
      const arrayBuffer = await blob.arrayBuffer();
      // decodeAudioData handles ALL formats the browser codec supports — MIME type irrelevant
      return await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
      console.warn('decodeBlobToBuffer failed:', e.message);
      return null;
    }
  }

  // Play an AudioBuffer at a given speed (1.0 = normal)
  function playDecodedBuffer(audioBuffer, playbackSpeed, itemId, itemTitle, playType, partNum) {
    if (!audioBuffer) {
      console.error('playDecodedBuffer: audioBuffer is null');
      stopAllPreviews();
      window.showToast('❌ Audio buffer kosong — tidak bisa diputar.');
      return;
    }
    const ctx = getPreviewAudioCtx();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.playbackRate.value = Math.max(0.1, Math.min(4.0, playbackSpeed || 1.0));

    source.connect(ctx.destination);

    previewPlayer.source = source;
    previewPlayer.playingId = itemId;
    previewPlayer.playingType = playType;
    previewPlayer.playingPartNum = partNum || null;
    previewPlayer.loadingId = null;
    previewPlayer.loadingType = null;
    previewPlayer.loadingPartNum = null;
    syncPlayerButtonsUI();

    source.onended = () => {
      if (previewPlayer.source !== source) return;
      previewPlayer.source = null;
      previewPlayer.playingId = null;
      previewPlayer.playingType = null;
      previewPlayer.playingPartNum = null;
      syncPlayerButtonsUI();
    };

    source.start(0);
    window.showToast(`▶ Memutar: "${(itemTitle || '').substring(0, 40)}"`);
  }

  // Helper: fetch audio from server endpoints, store raw bytes, return blob
  async function fetchRawAudioBlob(sourceUrl, onFetching) {
    const eps = [
      window.getBackendUrl ? window.getBackendUrl(`/api/fetch-audio?url=${encodeURIComponent(sourceUrl)}`) : '',
      `http://127.0.0.1:5520/api/fetch-audio?url=${encodeURIComponent(sourceUrl)}`,
      `http://localhost:5520/api/fetch-audio?url=${encodeURIComponent(sourceUrl)}`
    ].filter(Boolean);
    if (typeof onFetching === 'function') onFetching();
    for (const ep of eps) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 60000);
        const r = await fetch(ep, { signal: ctrl.signal }).catch(() => null);
        clearTimeout(t);
        if (r && r.ok) {
          const rawBuf = await r.arrayBuffer();
          if (rawBuf && rawBuf.byteLength > 1000) {
            // Raw bytes — guaranteed decodable (same bytes yt-dlp sent)
            return new Blob([rawBuf.slice(0)], { type: 'audio/octet-stream' });
          }
        }
      } catch (e) { console.warn('fetchRawAudioBlob failed on', ep, e); }
    }
    return null;
  }

  // ----------------------------------------------------
  // UNIFIED ROBUST AUDIO PREVIEW PLAYER SUITE
  // ----------------------------------------------------
  function getItemSourceUrl(item) {
    if (item.sourceUrl && typeof item.sourceUrl === 'string' && item.sourceUrl.trim()) {
      return item.sourceUrl.trim();
    }
    if (item.thumbnail && typeof item.thumbnail === 'string') {
      const m = item.thumbnail.match(/(?:vi\/|vi_webp\/)([a-zA-Z0-9_-]{11})/);
      if (m && m[1]) return `https://www.youtube.com/watch?v=${m[1]}`;
    }
    return '';
  }

  // 1. Sped-Up Part Preview — prioritizes in-memory AudioBuffer (no encode/decode)
  async function playAudioPreview(item, part) {
    if (previewPlayer.playingId === item.id && previewPlayer.playingType === 'part_preview' && previewPlayer.playingPartNum === part.partNum) {
      stopAllPreviews(); return;
    }
    if (previewPlayer.loadingId === item.id && previewPlayer.loadingType === 'part_preview' && previewPlayer.loadingPartNum === part.partNum) return;

    stopAllPreviews();
    previewPlayer.loadingId = item.id;
    previewPlayer.loadingType = 'part_preview';
    previewPlayer.loadingPartNum = part.partNum;
    syncPlayerButtonsUI();

    try {
      // PRIORITY 1: In-memory AudioBuffer from current session (no encode/decode needed!)
      const lr = window.lastRenderedResult;
      if (lr && lr.historyItem && lr.historyItem.id === item.id && lr.parts) {
        const memPart = lr.parts[part.partNum - 1];
        if (memPart && memPart.buffer) {
          playDecodedBuffer(memPart.buffer, 1.0, item.id, item.title, 'part_preview', part.partNum);
          return;
        }
      }

      // PRIORITY 2: Blob from IndexedDB → decode
      let blob = await window.FHStorage.getPartBlob(item.id, part.partNum);

      // PRIORITY 3: Original blob at bypass speed
      let playbackSpeed = 1.0;
      if (!blob) {
        blob = await window.FHStorage.getOriginalBlob(item.id);
        if (blob) playbackSpeed = item.speed || 2.3;
      }

      // PRIORITY 4: Live re-fetch
      if (!blob) {
        const sourceUrl = getItemSourceUrl(item);
        if (sourceUrl) {
          blob = await fetchRawAudioBlob(sourceUrl, () => window.showToast('⏳ Mengambil audio...'));
          if (blob) { window.FHStorage.saveOriginalBlob(item.id, blob); playbackSpeed = item.speed || 2.3; }
        }
      }

      if (previewPlayer.loadingId !== item.id || previewPlayer.loadingType !== 'part_preview' || previewPlayer.loadingPartNum !== part.partNum) return;
      if (!blob) { stopAllPreviews(); window.showToast('❌ Tidak ada audio. Convert lagu ini dulu.'); return; }

      const audioBuffer = await decodeBlobToBuffer(blob);
      if (previewPlayer.loadingId !== item.id || previewPlayer.loadingType !== 'part_preview') return;
      if (!audioBuffer) { stopAllPreviews(); window.showToast('❌ Format audio tidak didukung browser.'); return; }
      playDecodedBuffer(audioBuffer, playbackSpeed, item.id, item.title, 'part_preview', part.partNum);
    } catch (err) {
      console.error('playAudioPreview:', err);
      stopAllPreviews();
      window.showToast(`❌ Preview error: ${err.message || err}`);
    }
  }

  // 2. Part Real 1x — hear at normal pitch (Roblox playback simulation)
  async function playPartRealPreview(item, part) {
    if (previewPlayer.playingId === item.id && previewPlayer.playingType === 'part_real' && previewPlayer.playingPartNum === part.partNum) {
      stopAllPreviews(); return;
    }
    if (previewPlayer.loadingId === item.id && previewPlayer.loadingType === 'part_real' && previewPlayer.loadingPartNum === part.partNum) return;

    stopAllPreviews();
    previewPlayer.loadingId = item.id;
    previewPlayer.loadingType = 'part_real';
    previewPlayer.loadingPartNum = part.partNum;
    syncPlayerButtonsUI();

    try {
      // PRIORITY 1: sourceBuffer (original fetched audio) in memory at 1x speed
      const engine = window.FHAudioEngine;
      if (engine && engine.sourceBuffer) {
        playDecodedBuffer(engine.sourceBuffer, 1.0, item.id, `Part ${part.partNum} - ${item.title}`, 'part_real', part.partNum);
        return;
      }

      // PRIORITY 2: In-memory rendered part at Roblox restoration speed
      const lr = window.lastRenderedResult;
      if (lr && lr.historyItem && lr.historyItem.id === item.id && lr.parts) {
        const memPart = lr.parts[part.partNum - 1];
        const robloxSpeed = parseFloat(item.robloxSpeed) || (1 / (item.speed || 2.3));
        if (memPart && memPart.buffer) {
          playDecodedBuffer(memPart.buffer, robloxSpeed, item.id, `Part ${part.partNum} - ${item.title}`, 'part_real', part.partNum);
          return;
        }
      }

      // PRIORITY 3: original blob from IndexedDB at 1x
      let blob = await window.FHStorage.getOriginalBlob(item.id);
      let playbackSpeed = 1.0;

      // PRIORITY 4: part blob at Roblox restoration speed
      if (!blob) {
        blob = await window.FHStorage.getPartBlob(item.id, part.partNum);
        if (blob) playbackSpeed = parseFloat(item.robloxSpeed) || (1 / (item.speed || 2.3));
      }

      // PRIORITY 5: Live re-fetch
      if (!blob) {
        const sourceUrl = getItemSourceUrl(item);
        if (sourceUrl) {
          blob = await fetchRawAudioBlob(sourceUrl, () => window.showToast('⏳ Mengambil audio...'));
          if (blob) { window.FHStorage.saveOriginalBlob(item.id, blob); playbackSpeed = 1.0; }
        }
      }

      if (previewPlayer.loadingId !== item.id || previewPlayer.loadingType !== 'part_real' || previewPlayer.loadingPartNum !== part.partNum) return;
      if (!blob) { stopAllPreviews(); window.showToast('❌ Tidak ada audio. Convert lagu ini dulu.'); return; }

      const audioBuffer = await decodeBlobToBuffer(blob);
      if (previewPlayer.loadingId !== item.id || previewPlayer.loadingType !== 'part_real') return;
      if (!audioBuffer) { stopAllPreviews(); window.showToast('❌ Format audio tidak didukung browser.'); return; }
      playDecodedBuffer(audioBuffer, playbackSpeed, item.id, `Part ${part.partNum} - ${item.title}`, 'part_real', part.partNum);
    } catch (err) {
      console.error('playPartRealPreview:', err);
      stopAllPreviews();
      window.showToast(`❌ Real 1x error: ${err.message || err}`);
    }
  }

  // 3. Full Real Song Preview — Web Audio API (format-agnostic, no MIME issues)
  async function playRealSongPreview(item) {
    if (previewPlayer.playingId === item.id && previewPlayer.playingType === 'real_song') {
      stopAllPreviews(); return;
    }
    if (previewPlayer.loadingId === item.id && previewPlayer.loadingType === 'real_song') return;

    stopAllPreviews();
    previewPlayer.loadingId = item.id;
    previewPlayer.loadingType = 'real_song';
    previewPlayer.loadingPartNum = null;
    syncPlayerButtonsUI();

    try {
      // 1. Try original blob from IndexedDB (saved during Convert)
      let blob = await window.FHStorage.getOriginalBlob(item.id);
      let playbackSpeed = 1.0;

      // Test if cached blob is valid — if corrupt (old WASM OGG), discard and re-fetch
      if (blob) {
        const testBuf = await decodeBlobToBuffer(blob);
        if (!testBuf) {
          console.warn('Cached original blob is corrupt, discarding and re-fetching...');
          blob = null; // discard corrupt blob, will re-fetch below
        } else {
          // Valid! Use it directly — no need to decode again, pass blob to second decode
          blob = blob; // keep
        }
      }

      // 2. Fallback: live fetch from YouTube via server (also fixes corrupt cache)
      const sourceUrl = getItemSourceUrl(item);
      if (!blob && sourceUrl) {
        window.showToast('⏳ Mengambil audio asli dari YouTube... (10-30 detik)');
        const eps = [
          window.getBackendUrl ? window.getBackendUrl(`/api/fetch-audio?url=${encodeURIComponent(sourceUrl)}`) : '',
          `http://127.0.0.1:5520/api/fetch-audio?url=${encodeURIComponent(sourceUrl)}`,
          `http://localhost:5520/api/fetch-audio?url=${encodeURIComponent(sourceUrl)}`
        ].filter(Boolean);
        for (const ep of eps) {
          try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 60000);
            const resp = await fetch(ep, { signal: ctrl.signal }).catch(() => null);
            clearTimeout(t);
            if (resp && resp.ok) {
              // Store raw ArrayBuffer bytes (guaranteed valid — same as what was decoded during Fetch)
              const rawBuf = await resp.arrayBuffer();
              const rawClone = rawBuf.slice(0);
              blob = new Blob([rawClone], { type: 'audio/octet-stream' });
              window.FHStorage.saveOriginalBlob(item.id, blob); // overwrite corrupt cache
              break;
            }
          } catch (e) { console.warn('fetch-audio ep failed:', e); }
        }
        if (!blob) {
          window.showToast('❌ Gagal fetch audio. Pastikan server.py aktif (port 5520).');
        }
      }

      // 3. Fallback: use bypass part 1 at roblox restoration speed
      if (!blob) {
        blob = await window.FHStorage.getPartBlob(item.id, 1);
        if (!blob && window.lastRenderedResult && window.lastRenderedResult.blobs) {
          blob = window.lastRenderedResult.blobs[0];
        }
        if (blob) {
          playbackSpeed = parseFloat(item.robloxSpeed) || (1 / (item.speed || 2.3));
        }
      }

      if (previewPlayer.loadingId !== item.id || previewPlayer.loadingType !== 'real_song') return;

      if (!blob) {
        stopAllPreviews();
        window.showToast('❌ Tidak ada audio tersimpan. Convert lagu ini terlebih dahulu.');
        return;
      }

      // Decode via Web Audio API — handles OGG, WAV, WEBM, OPUS, MP4A, MP3 regardless of blob MIME
      window.showToast('🔄 Mendekode audio...');
      const audioBuffer = await decodeBlobToBuffer(blob);

      if (!audioBuffer) {
        stopAllPreviews();
        window.showToast('❌ Audio tidak bisa didekode. Format tidak didukung browser ini.');
        return;
      }

      if (previewPlayer.loadingId !== item.id || previewPlayer.loadingType !== 'real_song') return;

      playDecodedBuffer(audioBuffer, playbackSpeed, item.id, item.title, 'real_song', null);
    } catch (err) {
      console.error('playRealSongPreview error:', err);
      stopAllPreviews();
      window.showToast(`❌ Error: ${err.message || err}`);
    }
  }

  // ----------------------------------------------------
  // REAL SHOW IN WINDOWS EXPLORER (No Browser Download Popup)
  // ----------------------------------------------------
  async function showPartInExplorer(item, part) {
    const cleanFileName = `part_${part.partNum}_${(item.title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 25)}.ogg`;

    // 1. Get blob from IndexedDB or memory
    let blob = await window.FHStorage.getPartBlob(item.id, part.partNum);
    if (!blob && window.lastRenderedResult && window.lastRenderedResult.blobs) {
      blob = window.lastRenderedResult.blobs[part.partNum - 1];
    }

    const saveAndOpenUrl = window.getBackendUrl ? window.getBackendUrl('/api/save-and-open') : 'http://127.0.0.1:5520/api/save-and-open';

    if (blob) {
      // Send audio data to local server so Python saves it directly to Downloads and selects it in Explorer
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        try {
          const res = await fetch(saveAndOpenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              filename: cleanFileName,
              audioBase64: base64data
            })
          });
          if (res.ok) {
            window.showToast(`Membuka Windows Explorer: ${cleanFileName}`);
            return;
          }
        } catch (e) {
          console.warn('Could not call save-and-open, fallback:', e);
        }

        // Fallback open folder
        const openUrl = window.getBackendUrl ? window.getBackendUrl(`/api/open-folder?file=${encodeURIComponent(cleanFileName)}`) : `http://127.0.0.1:5520/api/open-folder?file=${encodeURIComponent(cleanFileName)}`;
        fetch(openUrl).catch(() => {});
        window.showToast(`Membuka folder Downloads: ${cleanFileName}`);
      };
    } else {
      const openUrl = window.getBackendUrl ? window.getBackendUrl(`/api/open-folder?file=${encodeURIComponent(cleanFileName)}`) : `http://127.0.0.1:5520/api/open-folder?file=${encodeURIComponent(cleanFileName)}`;
      try {
        await fetch(openUrl);
      } catch (e) {}
      window.showToast(`Membuka folder Downloads: ${cleanFileName}`);
    }
  }

  // ----------------------------------------------------
  // REAL ROBLOX OPEN CLOUD UPLOAD EXECUTOR
  // ----------------------------------------------------
  function executeRobloxUpload(item, partNum, btnEl) {
    return new Promise(async (resolve) => {
      const activeAccount = window.FHStorage.getActiveAccount();
      if (!activeAccount || !activeAccount.apiKey) {
        alert('Silakan tambahkan atau aktifkan Akun Roblox API di menu Settings terlebih dahulu.');
        window.switchTab('settings');
        return resolve({ success: false, error: 'No active account' });
      }

      const jobKey = `${item.id}_${partNum}`;
      // Clean up any existing job for this part
      if (activeUploadJobs.has(jobKey)) {
        const prevJob = activeUploadJobs.get(jobKey);
        if (prevJob.controller) {
          try { prevJob.controller.abort(); } catch (e) {}
        }
        if (prevJob.timer) clearTimeout(prevJob.timer);
        activeUploadJobs.delete(jobKey);
      }

      const controller = new AbortController();
      const timeoutTimer = setTimeout(() => {
        try { controller.abort(new Error('Upload timeout (50s)')); } catch (e) {}
        window.showToast(`Upload Roblox Part ${partNum} timeout (50 detik). Status di-reset.`);
        window.FHStorage.updateHistoryPart(item.id, partNum, {
          uploadStatus: 'idle',
          moderationStatus: 'unchecked'
        });
        activeUploadJobs.delete(jobKey);
        renderHistoryDashboard();
      }, 50000);

      activeUploadJobs.set(jobKey, {
        controller,
        timer: timeoutTimer,
        startTime: Date.now()
      });

      const cleanupJob = () => {
        clearTimeout(timeoutTimer);
        activeUploadJobs.delete(jobKey);
      };

      const currentPart = (item.parts || []).find(p => p.partNum === partNum);
      if (currentPart && (currentPart.moderationStatus === 'rejected' || currentPart.moderationStatus === 'blocked')) {
        const rerolled = window.FHStorage.rerollItemScene(item.id);
        if (rerolled) {
          item = rerolled;
        }
      }

      // Immediately persist uploading state to storage and UI
      window.FHStorage.updateHistoryPart(item.id, partNum, {
        uploadStatus: 'uploading',
        moderationStatus: 'reviewing',
        viaAccount: activeAccount.name
      });
      renderHistoryDashboard();

      // Retrieve audio blob
      let blob = await window.FHStorage.getPartBlob(item.id, partNum);
      if (!blob && window.lastRenderedResult && window.lastRenderedResult.blobs) {
        blob = window.lastRenderedResult.blobs[partNum - 1];
      }

      if (!blob) {
        cleanupJob();
        window.showToast('Audio blob tidak ditemukan di cache.');
        window.FHStorage.updateHistoryPart(item.id, partNum, {
          uploadStatus: 'idle',
          moderationStatus: 'unchecked'
        });
        renderHistoryDashboard();
        return resolve({ success: false, error: 'Blob not found' });
      }

      const reader = new FileReader();
      reader.onerror = () => {
        cleanupJob();
        window.showToast('Gagal membaca file audio.');
        window.FHStorage.updateHistoryPart(item.id, partNum, {
          uploadStatus: 'idle',
          moderationStatus: 'unchecked'
        });
        renderHistoryDashboard();
        return resolve({ success: false, error: 'File read error' });
      };

      reader.onloadend = async () => {
        const base64data = reader.result.split(',')[1];
        const targetPart = (item.parts || []).find(p => p.partNum === partNum);
        const assetName = targetPart?.robloxAlias || (window.FHSettings ? window.FHSettings.formatAssetName(item.title, partNum, item.parts?.length || 1, item) : `BGM_Track_Part${partNum}`);
        const creatorType = activeAccount.creatorType === 'group' ? 'groupId' : 'userId';
        const creatorId = activeAccount.creatorId || '0';

        const uploadApiUrl = window.getBackendUrl ? window.getBackendUrl('/api/roblox-upload') : 'http://127.0.0.1:5520/api/roblox-upload';

        try {
          const resp = await fetch(uploadApiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              apiKey: activeAccount.apiKey,
              assetName: assetName,
              creatorType: creatorType,
              creatorId: creatorId,
              audioBase64: base64data
            })
          });

          cleanupJob();

          if (!resp.ok) {
            const rawText = await resp.text().catch(() => '');
            if (resp.status === 413 || (rawText && rawText.includes('FUNCTION_PAYLOAD_TOO_LARGE')) || (rawText && rawText.includes('Payload Too Large'))) {
              const sizeMB = blob ? (blob.size / 1024 / 1024).toFixed(1) : 'Audio';
              alert(
                `Upload Cloud Vercel Ditolak (File Terlalu Besar):\n\n` +
                `Ukuran audio ini (${sizeMB} MB) melebihi batas maksimal serverless Vercel (maks 4.5 MB).\n\n` +
                `SOLUSI:\n` +
                `Buka aplikasi via server lokal PC kamu:\n` +
                `👉 http://192.168.1.3:5520 (atau http://localhost:5520)\n\n` +
                `Versi lokal PC mendukung upload audio hingga 20 MB tanpa batasan cloud!`
              );
              throw new Error(`File terlalu besar untuk Vercel (${sizeMB} MB > batas 4.5 MB). Buka via http://192.168.1.3:5520.`);
            }
            throw new Error(rawText || `Server error (${resp.status})`);
          }

          let result;
          try {
            result = await resp.json();
          } catch (parseEx) {
            throw new Error('Respon server upload tidak valid');
          }

          if (result.success) {
            const modStatus = result.status || (result.assetId ? 'reviewing' : 'unchecked');
            window.FHStorage.updateHistoryPart(item.id, partNum, {
              assetId: result.assetId || '',
              robloxAlias: assetName,
              assetName: assetName,
              viaAccount: activeAccount.name,
              moderationStatus: modStatus,
              uploadStatus: 'uploaded',
              operationPath: result.operationPath || ''
            });

            if (modStatus === 'approved') {
              window.showToast(`✓ Upload Berhasil & Lolos Moderasi! ID: ${result.assetId}`);
            } else if (modStatus === 'rejected') {
              window.showToast(`✕ Audio Ditolak (Rejected) oleh moderasi Roblox.`);
            } else {
              window.showToast(`Upload terkirim (ID: ${result.assetId || '-'})! Sedang dalam peninjauan moderasi Roblox...`);
            }
            renderHistoryDashboard();
            return resolve(result);
          } else {
            const rawErr = result.error || 'Roblox upload error';
            let userErrMsg = rawErr;
            if (rawErr.includes('RESOURCE_EXHAUSTED') || rawErr.includes('limit of 100') || rawErr.includes('quota')) {
              userErrMsg = 'Kuota upload audio bulanan dari Roblox (100 audio) untuk akun ini telah habis. Silakan gunakan atau tambahkan akun alt lain di menu Pengaturan.';
              alert(`Upload ke Roblox Ditolak:\n\n${userErrMsg}\n\nDetail: ${rawErr}`);
            } else {
              window.showToast(`Upload gagal: ${userErrMsg}`);
            }

            window.FHStorage.updateHistoryPart(item.id, partNum, {
              uploadStatus: 'idle',
              moderationStatus: 'unchecked'
            });
            renderHistoryDashboard();
            return resolve(result);
          }
        } catch (err) {
          cleanupJob();
          console.warn('Direct upload error:', err);
          const isTimeout = err.name === 'AbortError' || (err.message && err.message.includes('timeout'));
          const isConnErr = !isTimeout && (err.name === 'TypeError' || (err.message && (err.message.includes('fetch') || err.message.includes('network') || err.message.includes('Failed'))));
          
          if (isTimeout) {
            window.showToast('Upload timeout (50 detik). Status di-reset ke siap upload.');
          } else if (isConnErr) {
            window.showToast('Koneksi upload gagal: Server lokal port 5520 belum berjalan! Jalankan "Buka FH Audio.bat".', 6000);
            const wantFallback = confirm(
              'Koneksi ke server lokal (port 5520) terputus.\n\n' +
              'Penyebab: File "Buka FH Audio.bat" belum dijalankan, atau server python tertutup.\n\n' +
              'Apakah Anda ingin mengunduh script PowerShell (.ps1) untuk mengunggah audio ini secara langsung tanpa server?'
            );
            if (wantFallback && typeof window.uploadAudioPartToRoblox === 'function') {
              window.uploadAudioPartToRoblox(item, partNum, blob);
            }
          } else {
            window.showToast(`Koneksi upload gagal: ${err.message}`);
          }
          window.FHStorage.updateHistoryPart(item.id, partNum, {
            uploadStatus: 'idle',
            moderationStatus: 'unchecked'
          });
          renderHistoryDashboard();
          return resolve({ success: false, error: err.message });
        }
      };

      try {
        reader.readAsDataURL(blob);
      } catch (readErr) {
        cleanupJob();
        window.FHStorage.updateHistoryPart(item.id, partNum, {
          uploadStatus: 'idle',
          moderationStatus: 'unchecked'
        });
        renderHistoryDashboard();
        return resolve({ success: false, error: readErr.message });
      }
    });
  }
  window.executeRobloxUpload = executeRobloxUpload;

  // ----------------------------------------------------
  // CHECK MODERATION STATUS HELPER & AUTO POLLER
  // ----------------------------------------------------
  async function checkPartModerationStatus(item, part) {
    const activeAccount = window.FHStorage.getActiveAccount();
    if (!activeAccount || !activeAccount.apiKey) {
      alert('Silakan aktifkan Akun Roblox API di tab Pengaturan terlebih dahulu.');
      window.switchTab('settings');
      return;
    }
    if (!part.operationPath && !part.assetId) {
      window.showToast('Data operasi upload atau Asset ID belum tersedia.');
      return;
    }
    try {
      const url = window.getBackendUrl ? window.getBackendUrl('/api/check-operation') : 'http://127.0.0.1:5520/api/check-operation';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: activeAccount.apiKey,
          operationPath: part.operationPath || '',
          assetId: part.assetId || ''
        })
      });
      const res = await resp.json();
      if (res.success && res.done) {
        let modStatus = res.status || 'reviewing';
        if (modStatus.includes('approved')) modStatus = 'approved';
        else if (modStatus.includes('rejected') || modStatus.includes('blocked')) modStatus = 'rejected';
        else modStatus = 'reviewing';

        window.FHStorage.updateHistoryPart(item.id, part.partNum, {
          assetId: res.assetId || part.assetId || '',
          moderationStatus: modStatus,
          uploadStatus: 'uploaded'
        });
        if (modStatus === 'approved') {
          window.showToast(`✓ Moderasi Lolos (Approved)! Asset ID: ${res.assetId || part.assetId}`);
        } else if (modStatus === 'rejected') {
          window.showToast('✕ Audio ditolak (Rejected) oleh Roblox.');
        } else {
          window.showToast('⏳ Masih dalam peninjauan moderasi Roblox...');
        }
        renderHistoryDashboard();
      } else {
        window.showToast('⏳ Masih dalam peninjauan moderasi Roblox. Mohon tunggu...');
      }
    } catch (err) {
      console.warn('Check moderation error:', err);
    }
  }

  // Background Auto-Poller for reviewing items
  let autoPollerInterval = null;
  function startReviewingAutoPoller() {
    if (autoPollerInterval) clearInterval(autoPollerInterval);
    autoPollerInterval = setInterval(async () => {
      const list = window.FHStorage.getHistory();
      const statusChangedItems = [];
      for (const item of list) {
        for (const part of (item.parts || [])) {
          if (part.moderationStatus === 'reviewing' && (part.operationPath || part.assetId)) {
            const activeAccount = window.FHStorage.getActiveAccount();
            if (activeAccount && activeAccount.apiKey) {
              try {
                const url = window.getBackendUrl ? window.getBackendUrl('/api/check-operation') : 'http://127.0.0.1:5520/api/check-operation';
                const resp = await fetch(url, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    apiKey: activeAccount.apiKey,
                    operationPath: part.operationPath || '',
                    assetId: part.assetId || ''
                  })
                });
                const res = await resp.json();
                if (res.success && res.done) {
                  let modStatus = res.status || 'reviewing';
                  if (modStatus.includes('approved')) modStatus = 'approved';
                  else if (modStatus.includes('rejected') || modStatus.includes('blocked')) modStatus = 'rejected';
                  else modStatus = 'reviewing';

                  // Only notify and update if the status has actually changed from 'reviewing'
                  if (modStatus !== 'reviewing' && modStatus !== part.moderationStatus) {
                    window.FHStorage.updateHistoryPart(item.id, part.partNum, {
                      assetId: res.assetId || part.assetId || '',
                      moderationStatus: modStatus,
                      uploadStatus: 'uploaded'
                    });
                    statusChangedItems.push({
                      title: item.title || 'Audio',
                      partNum: part.partNum,
                      status: modStatus,
                      assetId: res.assetId || part.assetId || ''
                    });
                  }
                }
              } catch (e) {}
            }
          }
        }
      }
      if (statusChangedItems.length > 0) {
        renderHistoryDashboard();
        statusChangedItems.forEach(ch => {
          if (ch.status === 'approved') {
            window.showToast(`🎉 Audio "${ch.title.substring(0, 25)}..." Part ${ch.partNum} Lolos Moderasi Roblox! (Approved)`);
          } else if (ch.status === 'rejected') {
            window.showToast(`⚠️ Audio "${ch.title.substring(0, 25)}..." Part ${ch.partNum} Ditolak Moderasi Roblox.`);
          }
        });
      }
    }, 10000);
  }
  startReviewingAutoPoller();

  // Batch re-check all assets against Roblox Open Cloud API
  async function checkAllModerationStatus() {
    const activeAccount = window.FHStorage.getActiveAccount();
    if (!activeAccount || !activeAccount.apiKey) {
      alert('Silakan aktifkan Akun Roblox API di tab Pengaturan terlebih dahulu.');
      window.switchTab('settings');
      return;
    }
    const list = window.FHStorage.getHistory();
    const partsToCheck = [];
    list.forEach(item => {
      (item.parts || []).forEach(part => {
        if (part.assetId || part.operationPath) {
          partsToCheck.push({ item, part });
        }
      });
    });

    if (partsToCheck.length === 0) {
      window.showToast('Belum ada part audio yang diunggah ke Roblox.');
      return;
    }

    if (btnHistoryCheckAll) {
      btnHistoryCheckAll.disabled = true;
      btnHistoryCheckAll.innerHTML = `<svg class="spin-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10"></path></svg> <span>Memeriksa (${partsToCheck.length})...</span>`;
    }

    window.showToast(`Memeriksa status riil ${partsToCheck.length} audio langsung ke server Roblox...`);
    let changed = 0;

    for (let i = 0; i < partsToCheck.length; i++) {
      const { item, part } = partsToCheck[i];
      try {
        const url = window.getBackendUrl ? window.getBackendUrl('/api/check-operation') : 'http://127.0.0.1:5520/api/check-operation';
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey: activeAccount.apiKey,
            operationPath: part.operationPath || '',
            assetId: part.assetId || ''
          })
        });
        const res = await resp.json();
        if (res.success && res.status) {
          let modStatus = res.status;
          if (modStatus !== part.moderationStatus) {
            window.FHStorage.updateHistoryPart(item.id, part.partNum, {
              moderationStatus: modStatus,
              assetId: res.assetId || part.assetId || ''
            });
            changed++;
          }
        }
      } catch (e) {}
    }

    if (btnHistoryCheckAll) {
      btnHistoryCheckAll.disabled = false;
      btnHistoryCheckAll.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg> <span>Cek Status Roblox</span>`;
    }

    renderHistoryDashboard();
    window.showToast(`Pemeriksaan selesai! ${changed} status diperbarui sesuai database Roblox.`);
  }

  if (btnHistoryCheckAll) {
    btnHistoryCheckAll.addEventListener('click', checkAllModerationStatus);
  }

  // Setup tab filter listeners
  const filterTabs = [
    { el: tabFilterAll, name: 'all' },
    { el: tabFilterApproved, name: 'approved' },
    { el: tabFilterRejected, name: 'rejected' },
    { el: tabFilterReviewing, name: 'reviewing' },
    { el: tabFilterUnchecked, name: 'unchecked' }
  ];

  filterTabs.forEach(tab => {
    if (tab.el) {
      tab.el.addEventListener('click', () => {
        filterTabs.forEach(t => t.el && t.el.classList.remove('active'));
        tab.el.classList.add('active');
        currentFilter = tab.name;
        renderHistoryDashboard();
      });
    }
  });

  // Search input
  if (historySearchInput) {
    historySearchInput.addEventListener('input', (e) => {
      searchQuery = e.target.value.trim();
      renderHistoryDashboard();
    });
  }

  // Export TXT Simple (Title & Raw ID only)
  if (btnHistoryExportTxtSimple) {
    btnHistoryExportTxtSimple.addEventListener('click', () => {
      const ok = window.FHStorage.exportHistoryTXTSimple();
      if (ok) window.showToast('Data Judul & Raw ID berhasil diekspor ke TXT Simple!');
      else window.showToast('Tidak ada data riwayat untuk diekspor.');
    });
  }

  // Export TXT Lengkap
  if (btnHistoryExportTxt) {
    btnHistoryExportTxt.addEventListener('click', () => {
      const ok = window.FHStorage.exportHistoryTXT();
      if (ok) window.showToast('Laporan riwayat lengkap berhasil diekspor ke file TXT!');
      else window.showToast('Tidak ada data riwayat untuk diekspor.');
    });
  }

  // Export CSV
  if (btnHistoryExportCsv) {
    btnHistoryExportCsv.addEventListener('click', () => {
      const ok = window.FHStorage.exportHistoryCSV();
      if (ok) window.showToast('Data riwayat berhasil diekspor ke CSV!');
      else window.showToast('Tidak ada data riwayat untuk diekspor.');
    });
  }

  // Upload All button (sequential batch uploader)
  if (btnHistoryUploadAll) {
    btnHistoryUploadAll.addEventListener('click', async () => {
      const list = window.FHStorage.getHistory();
      const unuploadedItems = [];

      list.forEach(item => {
        (item.parts || []).forEach(part => {
          if (!part.assetId && part.moderationStatus !== 'approved') {
            unuploadedItems.push({ item, partNum: part.partNum });
          }
        });
      });

      if (unuploadedItems.length === 0) {
        window.showToast('Semua part sudah terunggah!');
        return;
      }

      btnHistoryUploadAll.disabled = true;
      window.showToast(`Memulai upload langsung ke Roblox untuk ${unuploadedItems.length} part...`);
      for (let i = 0; i < unuploadedItems.length; i++) {
        const entry = unuploadedItems[i];
        window.showToast(`Mengunggah [${i + 1}/${unuploadedItems.length}] ${entry.item.title} Part ${entry.partNum}...`);
        const res = await executeRobloxUpload(entry.item, entry.partNum, null);
        if (res && !res.success) {
          const err = res.error || '';
          if (err.includes('RESOURCE_EXHAUSTED') || err.includes('limit of 100') || err.includes('quota')) {
            break; // Stop batch uploading if quota is exhausted
          }
        }
      }
      btnHistoryUploadAll.disabled = false;
      renderHistoryDashboard();
    });
  }

  // Initial render
  renderHistoryDashboard();

  window.FHHistory = {
    renderHistoryDashboard
  };
}

function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.initHistoryModule = initHistoryModule;
