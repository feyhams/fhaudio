/**
 * FH Audio V2 - Tracklist & Album Splitter Module
 * Automatically parses tracklist timestamps (e.g. "00:00 | Silhouettes", "03:21 | Pen Y Fan"),
 * slices long compilation/album audio into individual songs, applies Roblox Stealth Bypass,
 * and saves them directly to History and user Downloads.
 */

(function () {
  'use strict';

  function parseTime(str) {
    if (!str) return 0;
    const parts = str.trim().replace(/[\[\]\(\)]/g, '').split(':').map(Number);
    if (parts.length === 2) return (parts[0] * 60) + parts[1];
    if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    return 0;
  }

  function formatTime(sec) {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function parseTracklistText(rawText, totalAudioDuration = 0) {
    if (!rawText) return [];
    const lines = rawText.split('\n');
    const tracks = [];
    // Regex matches: 00:00, [00:00], 0:00, 01:23:45, [01:23:45]
    const timeRegex = /(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?)/;

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;
      const match = line.match(timeRegex);
      if (match) {
        const timeStr = match[1];
        const timeSec = parseTime(timeStr);
        // Clean title: remove time, brackets, dividers (| - : – —), and leading numbering (1. / 01.)
        let title = line
          .replace(match[0], '')
          .replace(/^[\s\|\:\–\—\-\.\/]+\s*/, '')
          .replace(/[\s\|\:\–\—\-\.\/]+\s*$/, '')
          .trim();
        title = title.replace(/^\d+[\.\)\-]\s*/, '').trim();
        if (!title) title = `Track at ${timeStr}`;

        tracks.push({
          rawTime: timeStr,
          startSec: timeSec,
          title
        });
      }
    }

    // Sort chronologically by startSec
    tracks.sort((a, b) => a.startSec - b.startSec);

    // Filter duplicates at same timestamp
    const uniqueTracks = [];
    tracks.forEach(t => {
      if (!uniqueTracks.some(u => u.startSec === t.startSec)) {
        uniqueTracks.push(t);
      }
    });

    // Compute endSec and durationSec for each track
    for (let i = 0; i < uniqueTracks.length; i++) {
      const curr = uniqueTracks[i];
      if (i < uniqueTracks.length - 1) {
        curr.endSec = uniqueTracks[i + 1].startSec;
      } else {
        // Last track
        if (totalAudioDuration > curr.startSec) {
          curr.endSec = totalAudioDuration;
        } else {
          curr.endSec = curr.startSec + 210; // 3.5 min default
        }
      }
      curr.durationSec = Math.max(1, curr.endSec - curr.startSec);
      curr.timeRangeFormatted = `${formatTime(curr.startSec)} - ${formatTime(curr.endSec)}`;
    }

    return uniqueTracks;
  }

  function initTracklistModule() {
    const btnToggleTracklist = document.getElementById('btnToggleTracklist');
    const tracklistPanel = document.getElementById('tracklistPanel');
    const btnCloseTracklist = document.getElementById('btnCloseTracklist');
    const tracklistInput = document.getElementById('tracklistInput');
    const tracklistPreviewBox = document.getElementById('tracklistPreviewBox');
    const tracklistCountLabel = document.getElementById('tracklistCountLabel');
    const tracklistItemsList = document.getElementById('tracklistItemsList');
    const btnProcessTracklist = document.getElementById('btnProcessTracklist');
    const tracklistProgressBox = document.getElementById('tracklistProgressBox');
    const tracklistProgressStatus = document.getElementById('tracklistProgressStatus');
    const tracklistProgressPercent = document.getElementById('tracklistProgressPercent');
    const tracklistProgressBar = document.getElementById('tracklistProgressBar');

    // Auto Chapters Banner Elements
    const chaptersAlertBanner = document.getElementById('chaptersAlertBanner');
    const chaptersAlertTitle = document.getElementById('chaptersAlertTitle');
    const chaptersAlertSub = document.getElementById('chaptersAlertSub');
    const btnApplyAutoChapters = document.getElementById('btnApplyAutoChapters');
    const btnDismissChapters = document.getElementById('btnDismissChapters');

    let currentParsedTracks = [];
    let pendingChapters = [];

    function showAutoChaptersPrompt(chapters) {
      if (!Array.isArray(chapters) || chapters.length === 0) return;
      pendingChapters = chapters;
      if (chaptersAlertTitle) {
        chaptersAlertTitle.textContent = `✨ Terdeteksi ${chapters.length} Lagu (Chapters) Otomatis di Video Ini!`;
      }
      if (chaptersAlertSub) {
        chaptersAlertSub.textContent = `YouTube telah menyediakan pembagian bab untuk setiap lagu. Ingin potong otomatis menjadi ${chapters.length} lagu terpisah?`;
      }
      if (btnApplyAutoChapters) {
        btnApplyAutoChapters.textContent = `⚡ Ya, Potong Jadi ${chapters.length} Lagu Terpisah`;
      }
      if (chaptersAlertBanner) {
        chaptersAlertBanner.style.display = 'flex';
      }
    }

    function hideAutoChaptersPrompt() {
      if (chaptersAlertBanner) {
        chaptersAlertBanner.style.display = 'none';
      }
    }

    if (btnApplyAutoChapters) {
      btnApplyAutoChapters.addEventListener('click', () => {
        if (!pendingChapters || pendingChapters.length === 0) {
          hideAutoChaptersPrompt();
          return;
        }
        const lines = pendingChapters.map(ch => {
          const m = Math.floor(ch.start_time / 60);
          const s = Math.floor(ch.start_time % 60);
          const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
          return `${timeStr} | ${ch.title}`;
        });
        if (tracklistInput) {
          tracklistInput.value = lines.join('\n');
        }
        toggleTracklist(true);
        updatePreview();
        hideAutoChaptersPrompt();

        if (tracklistPanel) {
          tracklistPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
        if (typeof window.showToast === 'function') {
          window.showToast(`✨ Tracklist ${pendingChapters.length} lagu berhasil dimuat dari YouTube!`);
        }
      });
    }

    if (btnDismissChapters) {
      btnDismissChapters.addEventListener('click', () => {
        hideAutoChaptersPrompt();
      });
    }

    function toggleTracklist(show = null) {
      if (!tracklistPanel) return;
      const willShow = (show !== null) ? show : (tracklistPanel.style.display === 'none');
      tracklistPanel.style.display = willShow ? 'block' : 'none';
      if (btnToggleTracklist) {
        btnToggleTracklist.classList.toggle('active', willShow);
      }
      if (willShow && tracklistInput) {
        tracklistInput.focus();
        updatePreview();
      }
    }

    function getActiveBuffer() {
      if (!window.FHAudioEngine) return null;
      return window.FHAudioEngine.loadedAudioBuffer || window.FHAudioEngine.sourceBuffer || null;
    }

    function updatePreview() {
      if (!tracklistInput || !tracklistItemsList) return;
      const text = tracklistInput.value.trim();
      const activeBuf = getActiveBuffer();
      const totalDur = activeBuf ? activeBuf.duration : 0;

      currentParsedTracks = parseTracklistText(text, totalDur);

      if (currentParsedTracks.length === 0) {
        if (tracklistPreviewBox) tracklistPreviewBox.style.display = 'none';
        if (btnProcessTracklist) {
          btnProcessTracklist.disabled = true;
          btnProcessTracklist.textContent = '⚡ Potong & Bypass Semua Lagu (0 Track)';
        }
        return;
      }

      if (tracklistPreviewBox) tracklistPreviewBox.style.display = 'block';
      if (tracklistCountLabel) {
        tracklistCountLabel.textContent = `Daftar Lagu Terdeteksi (${currentParsedTracks.length} Track)`;
      }

      tracklistItemsList.innerHTML = '';
      currentParsedTracks.forEach((t, idx) => {
        const itemRow = document.createElement('div');
        itemRow.className = 'tracklist-item-row';
        const scene = window.FHAlias ? window.FHAlias.getDeterministicScene(t.title) : 'Cyber_City';
        const alias = `BGM_${scene}_Part1`;

        itemRow.innerHTML = `
          <div class="tracklist-item-left">
            <span class="tracklist-item-num">#${idx + 1}</span>
            <div class="tracklist-item-info">
              <span class="tracklist-item-title">${escapeHtml(t.title)}</span>
              <span class="tracklist-item-time">⏱️ ${t.timeRangeFormatted} (${formatTime(t.durationSec)})</span>
            </div>
          </div>
          <div class="tracklist-item-right">
            <span class="tracklist-alias-pill" title="Alias Roblox Stealth">🏷️ ${escapeHtml(alias)}</span>
          </div>
        `;
        tracklistItemsList.appendChild(itemRow);
      });

      const hasAudio = !!activeBuf;
      if (btnProcessTracklist) {
        btnProcessTracklist.disabled = !hasAudio;
        btnProcessTracklist.textContent = hasAudio
          ? `⚡ Potong & Bypass Semua Lagu (${currentParsedTracks.length} Track) ➔ History`
          : `⚠️ Muat Audio / Video YouTube Terlebih Dahulu (${currentParsedTracks.length} Track)`;
      }
    }

    if (btnToggleTracklist) btnToggleTracklist.addEventListener('click', () => toggleTracklist());
    if (btnCloseTracklist) btnCloseTracklist.addEventListener('click', () => toggleTracklist(false));
    if (tracklistInput) tracklistInput.addEventListener('input', updatePreview);

    // Process all tracks
    if (btnProcessTracklist) {
      btnProcessTracklist.addEventListener('click', async () => {
        const sourceBuffer = getActiveBuffer();
        if (!sourceBuffer) {
          alert('Silakan muat file audio atau tunggu proses unduh YouTube selesai terlebih dahulu.');
          return;
        }

        if (currentParsedTracks.length === 0) {
          alert('Tidak ada lagu yang terdeteksi dari tracklist. Pastikan format ada timestamp (contoh: 00:00 | Judul Lagu).');
          return;
        }

        const confirmMsg = `Mulai memotong ${currentParsedTracks.length} lagu dari audio ini dan otomatis menerapkan Roblox Stealth Bypass?`;
        if (!confirm(confirmMsg)) return;

        btnProcessTracklist.disabled = true;
        if (tracklistProgressBox) tracklistProgressBox.style.display = 'block';

        const speed = parseFloat(document.getElementById('sliderSpeed')?.value) || 2.3;
        const ampDb = parseFloat(document.getElementById('sliderAmp')?.value) || -4;
        const qRaw = parseFloat(document.getElementById('sliderQuality')?.value);
        const quality = Number.isFinite(qRaw) ? qRaw : 5;
        const maxDurationSec = parseFloat(document.getElementById('sliderMaxDuration')?.value) || 250;
        const robloxSpeed = (1 / speed).toFixed(3);
        const linearGain = Math.pow(10, ampDb / 20);
        const robloxVol = (1 / linearGain).toFixed(2);

        const totalTracks = currentParsedTracks.length;
        const processedItems = [];

        for (let i = 0; i < totalTracks; i++) {
          const track = currentParsedTracks[i];
          const pct = Math.round(((i) / totalTracks) * 100);
          if (tracklistProgressPercent) tracklistProgressPercent.textContent = `${pct}%`;
          if (tracklistProgressBar) tracklistProgressBar.style.width = `${pct}%`;
          if (tracklistProgressStatus) {
            tracklistProgressStatus.textContent = `[${i + 1}/${totalTracks}] Memotong & mem-bypass: "${track.title}"...`;
          }

          try {
            // 1. Slice audio segment
            const slicedBuf = window.FHAudioEngine.sliceAudioBuffer(sourceBuffer, track.startSec, track.endSec);

            // 2. Render bypass buffer (speed-up + amp)
            const bypassedBuf = await window.FHAudioEngine.renderBypassBuffer(slicedBuf, {
              speed: speed,
              ampDb: ampDb
            });

            // 3. Split into parts if duration > maxDurationSec
            const parts = window.FHAudioEngine.splitBufferIntoParts(bypassedBuf, maxDurationSec);
            const historyId = 'hist_' + Date.now() + '_' + i;
            const scene = window.FHAlias ? window.FHAlias.getRandomScene() : 'Cyber_City';

            const historyParts = [];

            for (let pIdx = 0; pIdx < parts.length; pIdx++) {
              const part = parts[pIdx];
              const pNum = part.partNum || (pIdx + 1);
              const alias = window.FHAlias
                ? window.FHAlias.generatePartAlias(scene, pNum, parts.length, 'BGM')
                : `BGM_${scene}_Part${pNum}`;

              // Encode to OGG Vorbis
              const oggBlob = await window.FHAudioEngine.encodeToFormat(part.buffer, 'ogg', quality);

              // Save to IndexedDB and server cache
              await window.FHStorage.savePartBlob(historyId, pNum, oggBlob);

              // Auto-download file to user's Downloads folder
              triggerDownload(oggBlob, `${alias}.ogg`);

              historyParts.push({
                partNum: pNum,
                duration: formatTime(part.duration),
                durationSec: part.duration,
                assetId: '',
                viaAccount: '',
                moderationStatus: 'unchecked',
                uploadStatus: 'idle',
                robloxAlias: alias,
                assetName: alias
              });
            }

            // Save original un-sped-up sliced audio for "Real Song" preview in History
            try {
              const origBlob = await window.FHAudioEngine.encodeToFormat(slicedBuf, 'ogg', 6);
              await window.FHStorage.saveOriginalBlob(historyId, origBlob);
            } catch (e) {}

            // Add item to History
            const historyItem = {
              id: historyId,
              title: track.title,
              sceneAlias: scene,
              sourceUrl: document.getElementById('urlInput')?.value.trim() || '',
              thumbnail: document.getElementById('sourceThumb')?.src || '',
              timestamp: new Date().toLocaleString(),
              speed: speed,
              robloxSpeed: parseFloat(robloxSpeed),
              volumeDb: ampDb,
              robloxVolume: parseFloat(robloxVol),
              quality: quality,
              maxPartDuration: maxDurationSec,
              parts: historyParts
            };

            window.FHStorage.addHistoryItem(historyItem);
            processedItems.push(historyItem);

          } catch (err) {
            console.error(`Error processing track ${track.title}:`, err);
          }
        }

        // Complete
        if (tracklistProgressPercent) tracklistProgressPercent.textContent = '100%';
        if (tracklistProgressBar) tracklistProgressBar.style.width = '100%';
        if (tracklistProgressStatus) {
          tracklistProgressStatus.textContent = `✓ Selesai! ${processedItems.length} Lagu berhasil dipotong & di-bypass!`;
        }

        window.showToast(`🎉 Berhasil! ${processedItems.length} Lagu tersimpan ke Riwayat & diunduh ke folder Downloads.`);

        setTimeout(() => {
          btnProcessTracklist.disabled = false;
          if (tracklistProgressBox) tracklistProgressBox.style.display = 'none';
          // Switch to History tab so user immediately sees all the songs ready
          if (typeof window.switchTab === 'function') {
            window.switchTab('history');
          }
        }, 1200);
      });
    }

    function triggerDownload(blob, filename) {
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      } catch (e) {}
    }

    // Expose helpers globally
    window.FHTags = {
      openWithTracklist: (text) => {
        if (tracklistInput) tracklistInput.value = text;
        toggleTracklist(true);
        updatePreview();
      },
      showAutoChaptersPrompt,
      hideAutoChaptersPrompt,
      updatePreview
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  window.initTracklistModule = initTracklistModule;
})();
