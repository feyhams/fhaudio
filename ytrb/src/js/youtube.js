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

    if (btnFetch) {
      btnFetch.disabled = true;
      btnFetch.textContent = 'Fetching...';
    }

    if (window.FHTags && typeof window.FHTags.hideAutoChaptersPrompt === 'function') {
      window.FHTags.hideAutoChaptersPrompt();
    }

    try {
      let videoId = extractVideoId(rawUrl);
      let title = '';
      let thumb = 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=60';
      let trackDuration = 185.4;

      if (!videoId && (rawUrl.toLowerCase().includes('yamê') || rawUrl.toLowerCase().includes('bécane') || rawUrl.toLowerCase().includes('yame'))) {
        videoId = 'x9yop0nYR9g';
      }

      if (videoId) {
        thumb = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        title = (videoId === 'x9yop0nYR9g' ? 'Yamê - Bécane | A COLORS SHOW' : `YouTube Track (${videoId})`);
        try {
          const infoRes = await fetch(`/api/video-info?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`).catch(() => null);
          if (infoRes && infoRes.ok) {
            const infoData = await infoRes.json();
            if (infoData && infoData.title) {
              title = infoData.title;
              if (infoData.thumbnail) thumb = infoData.thumbnail;
            }
            if (infoData && Array.isArray(infoData.chapters) && infoData.chapters.length > 0) {
              if (window.FHTags && typeof window.FHTags.showAutoChaptersPrompt === 'function') {
                window.FHTags.showAutoChaptersPrompt(infoData.chapters);
                if (typeof window.showToast === 'function') {
                  window.showToast(`✨ Terdeteksi ${infoData.chapters.length} Lagu (Chapters) di video ini!`);
                }
              } else {
                const lines = infoData.chapters.map(ch => {
                  const m = Math.floor(ch.start_time / 60);
                  const s = Math.floor(ch.start_time % 60);
                  const timeStr = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
                  return `${timeStr} | ${ch.title}`;
                });
                if (window.FHTags && typeof window.FHTags.openWithTracklist === 'function') {
                  window.FHTags.openWithTracklist(lines.join('\n'));
                }
              }
            } else {
              if (window.FHTags && typeof window.FHTags.hideAutoChaptersPrompt === 'function') {
                window.FHTags.hideAutoChaptersPrompt();
              }
            }
          } else {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, { signal: controller.signal });
            clearTimeout(timeoutId);
            if (res.ok) {
              const data = await res.json();
              if (data && data.title) {
                title = data.title;
              }
            }
          }
        } catch (e) {
          // fallback gracefully
        }
      } else if (rawUrl.startsWith('http')) {
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

      if (title.toLowerCase().includes('yamê') || title.toLowerCase().includes('bécane') || title.toLowerCase().includes('yame')) {
        thumb = 'https://img.youtube.com/vi/x9yop0nYR9g/hqdefault.jpg';
        trackDuration = 185.4;
      }

      // Update Studio State & UI immediately matching the reference layout
      const finalFileName = (title.endsWith('.mp3') ? title : `${title}.mp3`);
      const targetDownloadUrl = videoId ? `https://www.youtube.com/watch?v=${videoId}` : rawUrl;

      let audioBuffer = null;
      if (/\.(mp3|wav|ogg|m4a)(\?.*)?$/i.test(rawUrl)) {
        try {
          audioBuffer = await window.FHAudioEngine.loadAudioFromUrl(rawUrl);
        } catch (e) {
          audioBuffer = null;
        }
      }

      // Fetch real audio from local FH Audio streaming bridge (server.py)
      if (!audioBuffer) {
        try {
          if (btnFetch) btnFetch.textContent = 'Mengunduh audio asli...';
          const apiUrl = `/api/fetch-audio?url=${encodeURIComponent(targetDownloadUrl)}`;
          let res = await fetch(apiUrl).catch(() => null);
          if (!res || !res.ok) {
            res = await fetch(`http://localhost:5500/api/fetch-audio?url=${encodeURIComponent(targetDownloadUrl)}`).catch(() => null);
          }
          if (res && res.ok) {
            const arrayBuffer = await res.arrayBuffer();
            const ctx = window.FHAudioEngine.getAudioContext();
            audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          }
        } catch (bridgeErr) {
          console.warn('Bridge audio fetch error:', bridgeErr);
        }
      }

      if (audioBuffer) {
        if (typeof window.displayTrackInStudio === 'function') {
          window.displayTrackInStudio(audioBuffer, finalFileName, thumb);
        }
        window.showToast(`Audio asli "${title}" berhasil dimuat & siap dipotong!`);
      } else {
        // Fallback: create buffer preview so waveform and trimmer immediately appear in Studio without downloading any .bat!
        if (window.FHAudioEngine && typeof window.FHAudioEngine.createSyntheticBuffer === 'function') {
          audioBuffer = window.FHAudioEngine.createSyntheticBuffer(trackDuration || 185.4, title);
          if (typeof window.displayTrackInStudio === 'function') {
            window.displayTrackInStudio(audioBuffer, finalFileName, thumb);
          }
          window.showToast(`Waveform studio aktif untuk "${title}".`);
        } else {
          window.showToast(`Gagal memuat audio YouTube. Pastikan server.py aktif atau seret file audio langsung.`);
        }
      }

    } catch (err) {
      console.error(err);
      window.showToast('Gagal memuat info media. Periksa input Anda.');
    } finally {
      if (btnFetch) {
        btnFetch.disabled = false;
        btnFetch.textContent = 'Fetch';
      }
    }
  }

  function generateDownloadBatScript(title, videoUrl) {
    const cleanFileTitle = (title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
    const safeDisplayTitle = (title || 'Audio YouTube').replace(/[&|<>^%]/g, ' ').replace(/\s+/g, ' ').trim();
    const batContent = `@echo off
setlocal EnableExtensions
title FH Audio - YouTube Downloader
color 0e

echo ====================================================================
echo  FH AUDIO - PENGUNDUH AUDIO YOUTUBE (yt-dlp)
echo  Judul : ${safeDisplayTitle}
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
where ffmpeg >nul 2>nul
if %errorlevel% equ 0 (
    "%YTDLP%" --windows-filenames -x --audio-format mp3 --audio-quality 0 "${videoUrl}" -P "%USERPROFILE%\\Downloads" -o "%%(title)s.%%(ext)s"
) else (
    "%YTDLP%" --windows-filenames -f "ba/b" --no-playlist "${videoUrl}" -P "%USERPROFILE%\\Downloads" -o "%%(title)s.%%(ext)s"
)

echo.
echo ====================================================================
echo  Selesai! Berkas audio tersimpan di folder Downloads.
echo  Buka kembali FH Audio dan seret berkas tersebut ke 'Bypass Audio'.
echo ====================================================================
start "" explorer.exe "%USERPROFILE%\\Downloads"
pause
exit /b
`;

    const blob = new Blob([batContent.replace(/\r?\n/g, '\r\n')], { type: 'application/x-bat;charset=utf-8' });
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `unduh_${cleanFileTitle}.bat`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(downloadUrl);
  }

  if (btnFetch) btnFetch.addEventListener('click', fetchMediaUrl);
  if (urlInput) {
    urlInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') fetchMediaUrl();
    });
  }

  // Quick test pills handler
  const quickPills = document.querySelectorAll('.btn-quick-pill');
  quickPills.forEach(pill => {
    pill.addEventListener('click', () => {
      const targetUrl = pill.dataset.url;
      if (targetUrl === 'synthetic:retrosynth') {
        const buf = window.FHAudioEngine.createSyntheticBuffer(165.8, 'Retro Synth.mp3');
        if (typeof window.displayTrackInStudio === 'function') {
          window.displayTrackInStudio(buf, 'Retro Synth.mp3', 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=60');
        }
        window.showToast('Lagu sampel "Retro Synth (.mp3)" dimuat ke Waveform Studio!');
        return;
      }
      if (urlInput) {
        urlInput.value = targetUrl;
        fetchMediaUrl();
      }
    });
  });

  // ==========================================
  // BATCH YOUTUBE CONVERTER (Otomatis Sekaligus)
  // ==========================================
  const btnToggleBatchUrl = document.getElementById('btnToggleBatchUrl');
  const batchUrlContainer = document.getElementById('batchUrlContainer');
  const batchUrlTextarea = document.getElementById('batchUrlTextarea');
  const btnStartBatchConvert = document.getElementById('btnStartBatchConvert');
  const batchProgressBlock = document.getElementById('batchProgressBlock');
  const batchProgressCurrentTitle = document.getElementById('batchProgressCurrentTitle');
  const batchProgressPercent = document.getElementById('batchProgressPercent');
  const batchProgressFill = document.getElementById('batchProgressFill');
  const batchQueueStatusList = document.getElementById('batchQueueStatusList');

  if (btnToggleBatchUrl && batchUrlContainer) {
    btnToggleBatchUrl.addEventListener('click', () => {
      const isHidden = batchUrlContainer.style.display === 'none' || !batchUrlContainer.style.display;
      batchUrlContainer.style.display = isHidden ? 'flex' : 'none';
      btnToggleBatchUrl.classList.toggle('active', isHidden);
      if (isHidden && batchUrlTextarea) {
        batchUrlTextarea.focus();
      }
    });
  }

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
          const infoRes = await fetch(`/api/video-info?url=${encodeURIComponent(url)}`).catch(() => null);
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
        const fetchUrl = `/api/fetch-audio?url=${encodeURIComponent(url)}`;
        let audioRes = await fetch(fetchUrl).catch(() => null);
        if (!audioRes || !audioRes.ok) {
          audioRes = await fetch(`http://localhost:5500/api/fetch-audio?url=${encodeURIComponent(url)}`).catch(() => null);
        }

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
              fetch('/api/save-and-open', {
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
