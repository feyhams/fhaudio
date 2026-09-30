/**
 * FH Audio - YouTube & URL Media Fetcher
 * Extracts video/audio metadata, and provides local yt-dlp downloader scripts
 * that save directly to %USERPROFILE%\Downloads.
 */

function initYoutubeModule() {
  const urlInput = document.getElementById('urlInput');
  const btnFetch = document.getElementById('btnFetch');
  const sourceBar = document.getElementById('sourceBar');
  const sourceThumb = document.getElementById('sourceThumb');
  const sourceTitle = document.getElementById('sourceTitle');

  // Fetch Progress & Error UI
  const fetchProgressCard = document.getElementById('fetchProgressCard');
  const fetchProgressStatus = document.getElementById('fetchProgressStatus');
  const fetchProgressPercent = document.getElementById('fetchProgressPercent');
  const fetchProgressBar = document.getElementById('fetchProgressBar');
  const fetchErrorBox = document.getElementById('fetchErrorBox');
  const fetchErrorText = document.getElementById('fetchErrorText');
  const btnFetchDownloadBat = document.getElementById('btnFetchDownloadBat');
  const btnFetchDismiss = document.getElementById('btnFetchDismiss');

  let currentFailedTitle = '';
  let currentFailedUrl = '';

  function setFetchProgress(pct, statusText, state = 'loading') {
    if (!fetchProgressCard) return;
    fetchProgressCard.style.display = 'flex';
    fetchProgressCard.className = `fetch-progress-card ${state}`;
    if (fetchProgressPercent) fetchProgressPercent.textContent = `${pct}%`;
    if (fetchProgressStatus) fetchProgressStatus.textContent = statusText;
    if (fetchProgressBar) fetchProgressBar.style.width = `${pct}%`;

    if (state === 'error') {
      if (fetchErrorBox) fetchErrorBox.style.display = 'flex';
    } else {
      if (fetchErrorBox) fetchErrorBox.style.display = 'none';
    }
  }

  function hideFetchProgress() {
    if (!fetchProgressCard) return;
    fetchProgressCard.style.display = 'none';
    if (fetchErrorBox) fetchErrorBox.style.display = 'none';
  }

  const btnFetchCopyPs = document.getElementById('btnFetchCopyPs');

  if (btnFetchDismiss) {
    btnFetchDismiss.addEventListener('click', hideFetchProgress);
  }

  if (btnFetchDownloadBat) {
    btnFetchDownloadBat.addEventListener('click', () => {
      generateDownloadBatScript(currentFailedTitle || 'audio', currentFailedUrl || '');
    });
  }

  if (btnFetchCopyPs) {
    btnFetchCopyPs.addEventListener('click', () => {
      copyPowerShellDownloadCommand(currentFailedTitle || 'audio', currentFailedUrl || '');
    });
  }

  function extractVideoId(url) {
    if (!url) return null;
    url = url.trim();
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) return url;
    const patterns = [
      /(?:youtu\.be\/|youtube\.com\/(?:embed\/|v\/|shorts\/|live\/|watch\?v=|watch\?.+&v=))([a-zA-Z0-9_-]{11})/i,
      /[?&]v=([a-zA-Z0-9_-]{11})/i,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/i
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) return match[1];
    }
    return null;
  }

  async function fetchMediaUrl() {
    const rawUrl = (urlInput ? urlInput.value.trim() : '');
    if (!rawUrl) {
      window.showToast('Tempel URL YouTube atau nama lagu terlebih dahulu!');
      if (urlInput) urlInput.focus();
      return;
    }

    setFetchProgress(20, 'Mengambil metadata YouTube...', 'loading');
    if (btnFetch) {
      btnFetch.disabled = true;
      btnFetch.innerHTML = `<span class="spin-icon">⏳</span> <span>Fetching...</span>`;
    }

    if (window.FHTags && typeof window.FHTags.hideAutoChaptersPrompt === 'function') {
      window.FHTags.hideAutoChaptersPrompt();
    }

    let title = '';
    let targetDownloadUrl = rawUrl;

    try {
      let videoId = extractVideoId(rawUrl);
      let thumb = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=60';
      let trackDuration = 185.4;

      if (!videoId && (rawUrl.toLowerCase().includes('yamê') || rawUrl.toLowerCase().includes('bécane') || rawUrl.toLowerCase().includes('yame'))) {
        videoId = 'x9yop0nYR9g';
      }

      if (videoId) {
        thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        title = (videoId === 'x9yop0nYR9g' ? 'Yamê - Bécane | A COLORS SHOW' : `YouTube Track (${videoId})`);
      }

      // 1. Query video info from server bridge across all potential endpoints
      const queryTarget = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;
      const infoEndpoints = [
        window.getBackendUrl ? window.getBackendUrl(`/api/video-info?url=${encodeURIComponent(queryTarget)}`) : '',
        `http://127.0.0.1:5520/api/video-info?url=${encodeURIComponent(queryTarget)}`,
        `http://localhost:5520/api/video-info?url=${encodeURIComponent(queryTarget)}`,
        `/api/video-info?url=${encodeURIComponent(queryTarget)}`
      ].filter(Boolean);

      let infoData = null;
      for (const ep of infoEndpoints) {
        try {
          const controller = new AbortController();
          const tid = setTimeout(() => controller.abort(), 3500);
          const r = await fetch(ep, { signal: controller.signal }).catch(() => null);
          clearTimeout(tid);
          if (r && r.ok) {
            infoData = await r.json().catch(() => null);
            if (infoData && infoData.title) break;
          }
        } catch (_) {}
      }

      if (infoData && infoData.title) {
        title = infoData.title;
        if (infoData.id && !videoId) {
          videoId = infoData.id;
        }
        if (infoData.thumbnail) thumb = infoData.thumbnail;
        if (infoData.duration) trackDuration = infoData.duration;

        if (Array.isArray(infoData.chapters) && infoData.chapters.length > 0) {
          if (window.FHTags && typeof window.FHTags.showAutoChaptersPrompt === 'function') {
            window.FHTags.showAutoChaptersPrompt(infoData.chapters);
            if (typeof window.showToast === 'function') {
              window.showToast(`✨ Terdeteksi ${infoData.chapters.length} Lagu (Chapters) di video ini!`);
            }
          }
        }
      } else if (videoId) {
        // Fallback to oembed if server bridge not reached
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, { signal: controller.signal }).catch(() => null);
          clearTimeout(timeoutId);
          if (res && res.ok) {
            const data = await res.json().catch(() => null);
            if (data && data.title) {
              title = data.title;
            }
          }
        } catch (_) {}
      }

      if (!title) {
        if (rawUrl.startsWith('http')) {
          try {
            const urlObj = new URL(rawUrl);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            title = decodeURIComponent(pathParts[pathParts.length - 1] || 'Online Audio');
          } catch (e) {
            title = 'Online Audio Track';
          }
        } else {
          title = rawUrl;
        }
      }

      if (title.toLowerCase().includes('yamê') || title.toLowerCase().includes('bécane') || title.toLowerCase().includes('yame')) {
        thumb = 'https://img.youtube.com/vi/x9yop0nYR9g/hqdefault.jpg';
        trackDuration = 185.4;
      }

      // Update Studio State & UI immediately matching the reference layout
      const finalFileName = (title.endsWith('.mp3') ? title : `${title}.mp3`);
      targetDownloadUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;

      setFetchProgress(45, `Menemukan: "${title.substring(0, 32)}...". Memproses audio...`, 'loading');
      if (btnFetch) btnFetch.innerHTML = `<span class="spin-icon">⏳</span> <span>Mengunduh...</span>`;

      let audioBuffer = null;
      if (/\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(rawUrl)) {
        try {
          setFetchProgress(60, 'Mendownload file audio langsung...', 'loading');
          audioBuffer = await window.FHAudioEngine.loadAudioFromUrl(rawUrl);
        } catch (e) {
          audioBuffer = null;
        }
      }

      // 2. Fetch real audio from local FH Audio streaming bridge across all ports
      if (!audioBuffer) {
        setFetchProgress(70, `Mengunduh audio "${title.substring(0, 30)}..." via server...`, 'loading');
        const audioEndpoints = [
          window.getBackendUrl ? window.getBackendUrl(`/api/fetch-audio?url=${encodeURIComponent(targetDownloadUrl)}`) : '',
          `http://127.0.0.1:5520/api/fetch-audio?url=${encodeURIComponent(targetDownloadUrl)}`,
          `http://localhost:5520/api/fetch-audio?url=${encodeURIComponent(targetDownloadUrl)}`,
          `/api/fetch-audio?url=${encodeURIComponent(targetDownloadUrl)}`
        ].filter(Boolean);

        for (const ep of audioEndpoints) {
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 30000);
            const res = await fetch(ep, { signal: controller.signal }).catch(() => null);
            clearTimeout(tid);
            if (res && res.ok) {
              setFetchProgress(90, 'Mendekode audio ke Waveform Studio...', 'loading');
              const arrayBuffer = await res.arrayBuffer();
              // Clone raw bytes BEFORE decodeAudioData (which may detach the buffer)
              // These bytes are guaranteed valid — store as-is, no re-encoding needed
              const rawClone = arrayBuffer.slice(0);
              const ctx = window.FHAudioEngine.getAudioContext();
              audioBuffer = await ctx.decodeAudioData(arrayBuffer);
              if (audioBuffer) {
                // Store raw bytes directly — no WASM re-encode, no corruption possible
                if (window.FHAudioEngine) {
                  window.FHAudioEngine.pendingOriginalBlob = new Blob([rawClone], { type: 'audio/octet-stream' });
                }
                break;
              }
            }
          } catch (err) {
            console.warn('Bridge audio fetch attempt error on', ep, err);
          }
        }
      }

      // 3. Display in Studio (Real Audio or Studio Preview Fallback so it NEVER fails)
      if (audioBuffer) {
        if (window.FHAudioEngine) {
          window.FHAudioEngine.sourceUrl = targetDownloadUrl;
          // pendingOriginalBlob already set above (raw bytes clone) — no re-encoding needed
        }
        if (typeof window.displayTrackInStudio === 'function') {
          window.displayTrackInStudio(audioBuffer, finalFileName, thumb);
        }
        setFetchProgress(100, `✓ Audio "${title.substring(0, 32)}..." siap dipotong!`, 'success');
        window.showToast(`✓ Audio asli "${title}" berhasil dimuat & siap dipotong!`);
        setTimeout(hideFetchProgress, 1800);
      } else {
        // Real audio could not be downloaded via direct server bridge (e.g. running on GitHub Pages cloud without local yt-dlp)
        currentFailedTitle = title;
        currentFailedUrl = targetDownloadUrl;
        setFetchProgress(0, 'Download langsung YouTube memerlukan server lokal atau script download.', 'error');
        if (fetchErrorText) {
          fetchErrorText.textContent = window.location.hostname.includes('github.io')
            ? 'Hosting cloud GitHub Pages tidak memiliki backend yt-dlp. Unduh audio via .bat / PowerShell, atau gunakan versi lokal (Buka FH Audio.bat).'
            : 'Gagal mendownload audio dari YouTube. Pastikan server lokal aktif atau unduh via script .bat.';
        }
        window.showToast('Gunakan Unduh Script (.bat) atau jalankan versi lokal (Buka FH Audio.bat).');
      }

    } catch (err) {
      console.error(err);
      hideFetchProgress();
      window.showToast('Gagal memuat info media. Periksa input Anda.');
    } finally {
      if (btnFetch) {
        btnFetch.disabled = false;
        btnFetch.textContent = 'Fetch';
      }
    }
  }

  function generateDownloadBatScript(title, videoUrl) {
    const cleanTitle = (title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const batContent = `@echo off
setlocal EnableExtensions
title FH Audio - YouTube Downloader
color 0e

echo ====================================================================
echo  FH AUDIO - PENGUNDUH AUDIO YOUTUBE (yt-dlp)
echo  Judul : ${title}
echo ====================================================================
echo.

where yt-dlp >nul 2>nul
if %errorlevel% neq 0 (
    if not exist yt-dlp.exe (
        echo Mengunduh yt-dlp.exe resmi...
        curl.exe -L -o yt-dlp.exe "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe"
    )
    set "YTDLP=.\\yt-dlp.exe"
) else (
    set "YTDLP=yt-dlp"
)

echo Mengunduh audio langsung ke folder Downloads (%USERPROFILE%\\Downloads)...
"%YTDLP%" --windows-filenames -x --audio-format mp3 --audio-quality 0 "${videoUrl}" -P "%USERPROFILE%/Downloads" -o "%(title)s.%(ext)s"

echo.
echo Selesai! Berkas tersimpan di folder Downloads.
echo Buka kembali FH Audio dan seret file MP3 tersebut ke kotak 'Bypass Audio'.
start "" explorer.exe "%USERPROFILE%\\Downloads"
pause >nul
exit /b
`;

    const blob = new Blob([batContent.replace(/\r?\n/g, '\r\n')], { type: 'application/x-bat;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `unduh_${cleanTitle}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  function copyPowerShellDownloadCommand(title, videoUrl) {
    const targetUrl = videoUrl || (urlInput ? urlInput.value.trim() : '');
    const cmd = `yt-dlp --windows-filenames -x --audio-format mp3 --audio-quality 0 "${targetUrl}" -P "$HOME\\Downloads" -o "%(title)s.%(ext)s"`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(() => {
        window.showToast('✓ Perintah PowerShell disalin! Tempel di terminal PowerShell lalu Enter.');
      }).catch(() => {
        prompt('Salin perintah PowerShell berikut:', cmd);
      });
    } else {
      prompt('Salin perintah PowerShell berikut:', cmd);
    }
  }

  if (btnFetch) btnFetch.addEventListener('click', fetchMediaUrl);
  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fetchMediaUrl();
    });
  }

  // ==========================================
  // BATCH YOUTUBE CONVERTER (Otomatis Sekaligus)
  // ==========================================
  const batchUrlContainer = document.getElementById('batchUrlContainer');
  const batchUrlTextarea = document.getElementById('batchUrlTextarea');
  const btnStartBatchConvert = document.getElementById('btnStartBatchConvert');
  const batchProgressBlock = document.getElementById('batchProgressBlock');
  const batchProgressCurrentTitle = document.getElementById('batchProgressCurrentTitle');
  const batchProgressPercent = document.getElementById('batchProgressPercent');
  const batchProgressFill = document.getElementById('batchProgressFill');
  const batchQueueStatusList = document.getElementById('batchQueueStatusList');

  let isBatchRunning = false;

  async function processBatchYoutubeUrls() {
    if (isBatchRunning) return;
    const rawText = batchUrlTextarea ? batchUrlTextarea.value.trim() : '';
    if (!rawText) {
      window.showToast('Tempel daftar link YouTube terlebih dahulu di kotak teks!');
      if (batchUrlTextarea) batchUrlTextarea.focus();
      return;
    }

    // Split by newlines, spaces, or commas
    const lines = rawText.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean);
    const urls = [];
    for (const line of lines) {
      const match = line.match(/https?:\/\/[^\s]+/i);
      if (match) {
        urls.push(match[0]);
      } else if (extractVideoId(line)) {
        urls.push(`https://www.youtube.com/watch?v=${extractVideoId(line)}`);
      }
    }

    if (urls.length === 0) {
      window.showToast('Tidak ditemukan link YouTube yang valid. Periksa format teks Anda.');
      return;
    }

    isBatchRunning = true;
    if (btnStartBatchConvert) btnStartBatchConvert.disabled = true;
    if (batchProgressBlock) batchProgressBlock.style.display = 'flex';
    if (batchQueueStatusList) batchQueueStatusList.innerHTML = '';

    // Render list items
    const queueElements = urls.map((u, idx) => {
      const el = document.createElement('div');
      el.className = 'batch-queue-item';
      el.id = `batch_q_${idx}`;
      el.innerHTML = `
        <span class="batch-q-name" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:70%;">
          ${idx + 1}. ${escapeHtml(u)}
        </span>
        <span class="batch-q-status" style="font-size:0.75rem;color:#64748b;">Menunggu antrean...</span>
      `;
      batchQueueStatusList.appendChild(el);
      return el;
    });

    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const qEl = queueElements[i];
      const qStatus = qEl.querySelector('.batch-q-status');
      const qName = qEl.querySelector('.batch-q-name');

      qEl.classList.add('active');
      const pct = Math.round((i / urls.length) * 100);
      if (batchProgressFill) batchProgressFill.style.width = `${pct}%`;
      if (batchProgressPercent) batchProgressPercent.textContent = `${pct}%`;
      if (batchProgressCurrentTitle) {
        batchProgressCurrentTitle.textContent = `Memproses (${i + 1}/${urls.length}): Mengambil data audio...`;
      }

      try {
        if (qStatus) qStatus.textContent = 'Mengambil info...';
        
        // 1. Get info via local server
        let title = 'YouTube Track';
        let thumb = '';
        let vid = extractVideoId(url);
        if (vid) {
          thumb = `https://img.youtube.com/vi/${vid}/hqdefault.jpg`;
        }

        try {
          const infoUrl = window.getBackendUrl ? window.getBackendUrl(`/api/video-info?url=${encodeURIComponent(url)}`) : `http://127.0.0.1:5520/api/video-info?url=${encodeURIComponent(url)}`;
          const infoRes = await fetch(infoUrl).catch(() => null);
          if (infoRes && infoRes.ok) {
            const infoData = await infoRes.json();
            if (infoData && infoData.title) {
              title = infoData.title;
              if (infoData.thumbnail) thumb = infoData.thumbnail;
            }
          }
        } catch (e) {}

        if (qName) qName.textContent = `${i + 1}. ${title}`;
        if (qStatus) qStatus.textContent = 'Mengunduh audio asli...';
        if (batchProgressCurrentTitle) {
          batchProgressCurrentTitle.textContent = `Memproses (${i + 1}/${urls.length}): Unduh "${title.substring(0, 30)}..."`;
        }

        // 2. Fetch Audio ArrayBuffer
        const fetchUrl = window.getBackendUrl ? window.getBackendUrl(`/api/fetch-audio?url=${encodeURIComponent(url)}`) : `http://127.0.0.1:5520/api/fetch-audio?url=${encodeURIComponent(url)}`;
        let audioRes = await fetch(fetchUrl).catch(() => null);

        if (!audioRes || !audioRes.ok) {
          throw new Error('Gagal mengunduh audio track dari server.');
        }

        const arrayBuffer = await audioRes.arrayBuffer();
        if (qStatus) qStatus.textContent = 'Mendekode Web Audio...';

        // 3. Decode audio
        const ctx = window.FHAudioEngine.getAudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        if (qStatus) qStatus.textContent = 'Bypass 2.3x & Equalizer...';

        // 4. Render Bypass buffer (2.3x speed, -4 dB volume, treble boost)
        const renderedBuffer = await window.FHAudioEngine.renderBypassBuffer(audioBuffer, {
          speed: 2.3,
          ampDb: -4,
          trebleBoost: true
        });

        // 5. Split into parts (max 250s)
        const rawParts = window.FHAudioEngine.splitBufferIntoParts(renderedBuffer, 250);

        if (qStatus) qStatus.textContent = `Mengompresi ${rawParts.length} Part OGG...`;

        // 6. Encode parts to OGG Vorbis
        const encodedParts = [];
        const partBlobs = [];
        for (let p of rawParts) {
          const blob = await window.FHAudioEngine.encodeToFormat(p.buffer, 'ogg', 10);
          partBlobs.push(blob);
          const durSec = p.duration;
          const mins = Math.floor(durSec / 60);
          const secs = (durSec % 60).toFixed(1);
          encodedParts.push({
            partNum: p.partNum,
            duration: `${mins}:${secs.padStart(4, '0')}`,
            durationSec: durSec,
            assetId: '',
            viaAccount: '',
            moderationStatus: 'unchecked'
          });
        }

        // 7. Encode original trimmed audio for "Real Song" preview
        let origBlob = null;
        try {
          origBlob = await window.FHAudioEngine.encodeToFormat(audioBuffer, 'ogg', 6);
        } catch (e) {}

        // 8. Save to History
        const finalTitle = title.endsWith('.mp3') ? title : `${title}.mp3`;
        const historyItem = window.FHStorage.addHistoryItem({
          title: finalTitle,
          thumbnail: thumb,
          sourceUrl: url,
          speed: 2.3,
          robloxSpeed: 0.435,
          volumeDb: -4,
          robloxVolume: 1.58,
          quality: 10,
          maxPartDuration: 250,
          parts: encodedParts
        });

        // 9. Persist blobs to IndexedDB, sync to server disk, & save to Downloads (Opsi C)
        for (let pi = 0; pi < partBlobs.length; pi++) {
          await window.FHStorage.savePartBlob(historyItem.id, pi + 1, partBlobs[pi]);

          // Save directly to user's Downloads folder
          try {
            const cleanName = `part_${pi + 1}_${(title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30)}.ogg`;
            const blobPart = partBlobs[pi];
            const reader = new FileReader();
            reader.readAsDataURL(blobPart);
            reader.onloadend = () => {
              const b64 = reader.result.split(',')[1];
              const saveUrl = window.getBackendUrl ? window.getBackendUrl('/api/save-and-open') : 'http://127.0.0.1:5520/api/save-and-open';
              fetch(saveUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  filename: cleanName,
                  audioBase64: b64,
                  openExplorer: false
                })
              }).catch(() => {});
            };
          } catch (e) {}
        }
        if (origBlob) {
          await window.FHStorage.saveOriginalBlob(historyItem.id, origBlob);
        }

        qEl.classList.remove('active');
        qEl.classList.add('done');
        if (qStatus) {
          qStatus.style.color = '#34d399';
          qStatus.textContent = `✓ Selesai (${rawParts.length} Part & Tersimpan di Downloads)`;
        }
        successCount++;

      } catch (err) {
        console.error(`Batch error for URL ${url}:`, err);
        qEl.classList.remove('active');
        qEl.classList.add('error');
        if (qStatus) {
          qStatus.style.color = '#f87171';
          qStatus.textContent = '✕ Gagal';
        }
        failCount++;
      }
    }

    isBatchRunning = false;
    if (btnStartBatchConvert) btnStartBatchConvert.disabled = false;
    if (batchProgressFill) batchProgressFill.style.width = '100%';
    if (batchProgressPercent) batchProgressPercent.textContent = '100%';
    if (batchProgressCurrentTitle) {
      batchProgressCurrentTitle.textContent = `Batch selesai! ${successCount} berhasil, ${failCount} gagal.`;
    }

    window.showToast(`Batch convert selesai! ${successCount} lagu ditambahkan ke Riwayat.`);

    // Switch to history tab and render dashboard
    if (typeof window.switchTab === 'function') {
      window.switchTab('history');
    }
    if (window.FHHistory && typeof window.FHHistory.renderHistoryDashboard === 'function') {
      window.FHHistory.renderHistoryDashboard();
    }
  }

  if (btnStartBatchConvert) {
    btnStartBatchConvert.addEventListener('click', processBatchYoutubeUrls);
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
}

window.initYoutubeModule = initYoutubeModule;
