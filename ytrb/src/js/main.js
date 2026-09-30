/**
 * FH Audio - Main App Orchestrator
 * Wires together Waveform Trimmer, Sliders, Presets, Audio Engine,
 * Conversion Pipeline, and Module Initializers.
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize modular subsystems
  if (typeof window.initNavigation === 'function') window.initNavigation();
  if (typeof window.initSettingsModule === 'function') window.initSettingsModule();
  if (typeof window.initHistoryModule === 'function') window.initHistoryModule();
  if (typeof window.initYoutubeModule === 'function') window.initYoutubeModule();
  if (typeof window.initTracklistModule === 'function') window.initTracklistModule();
  if (window.FHStorage && typeof window.FHStorage.syncWithServer === 'function') {
    window.FHStorage.syncWithServer();
  }

  // Server Health Checker & Status Badge
  async function checkServerHealth(quiet = true) {
    const badge = document.getElementById('sidebarServerStatus');
    const text = document.getElementById('serverStatusText');
    if (!badge || !text) return;

    if (!quiet) {
      badge.className = 'server-status-pill checking';
      text.textContent = 'Memeriksa...';
    }

    try {
      const url = window.getBackendUrl ? window.getBackendUrl('/api/settings') : '/api/settings';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);
      const resp = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (resp.ok) {
        badge.className = 'server-status-pill online';
        text.textContent = 'Server: Terhubung';
        badge.title = 'Server lokal port 5500 aktif! Siap download YouTube & upload Roblox 1-klik.';
        if (!quiet) window.showToast('✓ Server lokal aktif di port 5500!');
      } else {
        throw new Error();
      }
    } catch (e) {
      badge.className = 'server-status-pill offline';
      text.textContent = 'Mode Standalone';
      badge.title = 'Server lokal belum aktif. Klik untuk mencoba menghubungkan kembali.';
      if (!quiet) window.showToast('Server lokal port 5500 belum aktif. Berjalan di Mode Standalone.');
    }
  }

  const sidebarServerStatus = document.getElementById('sidebarServerStatus');
  if (sidebarServerStatus) {
    sidebarServerStatus.addEventListener('click', () => {
      checkServerHealth(false);
    });
  }
  checkServerHealth(true);
  window.checkServerHealth = checkServerHealth;

  // Elements
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const sourceBar = document.getElementById('sourceBar');
  const sourceThumb = document.getElementById('sourceThumb');
  const sourceTitle = document.getElementById('sourceTitle');
  const sourceTitleInput = document.getElementById('sourceTitleInput');
  const btnEditSourceTitle = document.getElementById('btnEditSourceTitle');
  const waveformCard = document.getElementById('waveformCard');

  // Sliders & Value tags
  const sliderSpeed = document.getElementById('sliderSpeed');
  const valSpeed = document.getElementById('valSpeed');
  const sliderAmp = document.getElementById('sliderAmp');
  const valAmp = document.getElementById('valAmp');
  const sliderQuality = document.getElementById('sliderQuality');
  const valQuality = document.getElementById('valQuality');
  const sliderMaxDuration = document.getElementById('sliderMaxDuration');
  const valMaxDuration = document.getElementById('valMaxDuration');

  // Trimmer controls
  const btnCirclePlay = document.getElementById('btnCirclePlay');
  const playIcon = document.getElementById('playIcon');
  const pauseIcon = document.getElementById('pauseIcon');
  const trimmerCurrTime = document.getElementById('trimmerCurrTime');
  const trimmerTotalTime = document.getElementById('trimmerTotalTime');
  const inputStartTime = document.getElementById('inputStartTime');
  const inputEndTime = document.getElementById('inputEndTime');
  const btnSnapStart = document.getElementById('btnSnapStart');
  const btnSnapEnd = document.getElementById('btnSnapEnd');
  const calcStatusText = document.getElementById('calcStatusText');

  // Conversion actions
  const btnConvert = document.getElementById('btnConvert');
  const convertProgressWrap = document.getElementById('convertProgressWrap');
  const convertProgressFill = document.getElementById('convertProgressFill');
  const convertProgressStatus = document.getElementById('convertProgressStatus');
  const resultCard = document.getElementById('resultCard');
  const resultMetaSpeed = document.getElementById('resultMetaSpeed');
  const resultMetaRobloxSpeed = document.getElementById('resultMetaRobloxSpeed');
  const resultMetaVol = document.getElementById('resultMetaVol');
  const resultMetaParts = document.getElementById('resultMetaParts');
  const btnDownloadResultAudio = document.getElementById('btnDownloadResultAudio');
  const btnUploadResultRoblox = document.getElementById('btnUploadResultRoblox');
  const btnOpenInHistory = document.getElementById('btnOpenInHistory');

  // New Clean Audio Enhancement Toggles (Filter Treble, Headroom Limiter, Auto-Split)
  const toggleTreble = document.getElementById('toggleTreble');
  const toggleLimiter = document.getElementById('toggleLimiter');
  const toggleAutoSplit = document.getElementById('toggleAutoSplit');

  // Preview Mode State ('original' | 'bypass' | 'roblox')
  let currentPreviewMode = 'original';
  const btnPreviewModes = document.querySelectorAll('.btn-preview-mode');

  // State
  let loadedBuffer = null;
  let lastRenderedResult = null; // { parts, historyItem, oggBlobs }

  // 1. Initialize Waveform Trimmer
  const trimmer = new window.WaveformTrimmer('waveformCanvas', 'waveformContainer');

  trimmer.onTrimChange = (info) => {
    if (inputStartTime) inputStartTime.value = info.formattedStart;
    if (inputEndTime) inputEndTime.value = info.formattedEnd;
    updateCalculationSummary();
  };

  trimmer.onSeek = (timeSec) => {
    if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(timeSec);
  };

  function updateCalculationSummary() {
    if (!loadedBuffer || !calcStatusText) return;
    const cutDur = trimmer.endTime - trimmer.startTime;
    const speed = parseFloat(sliderSpeed.value) || 2.3;
    const isAutoSplit = toggleAutoSplit ? toggleAutoSplit.checked : true;
    const maxDur = isAutoSplit ? (parseFloat(sliderMaxDuration.value) || 250) : 999999;

    const afterSpeedUp = cutDur / speed;
    const partCount = isAutoSplit ? Math.max(1, Math.ceil(afterSpeedUp / maxDur)) : 1;

    calcStatusText.innerHTML = `Selected: <b>${trimmer.formatTime(cutDur)}</b> → about <b>${trimmer.formatTime(afterSpeedUp)}</b> after speed-up, <b>${partCount} part${partCount > 1 ? 's' : ''}</b>`;
  }

  // Preview Mode Buttons Wiring
  btnPreviewModes.forEach(btn => {
    btn.addEventListener('click', () => {
      btnPreviewModes.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentPreviewMode = btn.dataset.mode || 'original';
      if (isTrimmerPlaying) {
        startTrimmerPlayback();
      }
    });
  });

  // 2. Play/Pause Trimmer Audio
  let isTrimmerPlaying = false;

  function startTrimmerPlayback() {
    if (!loadedBuffer) return;
    const start = trimmer.currentTime >= trimmer.endTime ? trimmer.startTime : Math.max(trimmer.startTime, trimmer.currentTime);
    setPlayState(true);

    const speed = parseFloat(sliderSpeed ? sliderSpeed.value : 2.3) || 2.3;
    const ampDb = parseFloat(sliderAmp ? sliderAmp.value : -4) || -4;
    const enableTreble = toggleTreble ? toggleTreble.checked : false;
    const enableLimiter = toggleLimiter ? toggleLimiter.checked : true;

    window.FHAudioEngine.playAudio(
      loadedBuffer,
      start,
      {
        mode: currentPreviewMode,
        speed,
        ampDb,
        enableTreble,
        enableLimiter
      },
      (curr) => {
        trimmer.setPlayheadTime(curr);
        if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(curr);
        if (curr >= trimmer.endTime) {
          window.FHAudioEngine.stopPlayback();
          setPlayState(false);
        }
      },
      () => {
        setPlayState(false);
      }
    );
  }

  if (btnCirclePlay) {
    btnCirclePlay.addEventListener('click', () => {
      if (!loadedBuffer) return;
      if (isTrimmerPlaying) {
        window.FHAudioEngine.stopPlayback();
        setPlayState(false);
      } else {
        startTrimmerPlayback();
      }
    });
  }

  function setPlayState(playing) {
    isTrimmerPlaying = playing;
    if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
  }

  // Snap to playhead buttons
  if (btnSnapStart) {
    btnSnapStart.addEventListener('click', () => {
      trimmer.setStartTime(trimmer.currentTime);
      window.showToast('Start cut diatur ke posisi playhead');
    });
  }
  if (btnSnapEnd) {
    btnSnapEnd.addEventListener('click', () => {
      trimmer.setEndTime(trimmer.currentTime);
      window.showToast('End cut diatur ke posisi playhead');
    });
  }

  // Manual time input changes
  if (inputStartTime) {
    inputStartTime.addEventListener('change', (e) => {
      const sec = parseTimecode(e.target.value);
      trimmer.setStartTime(sec);
    });
  }
  if (inputEndTime) {
    inputEndTime.addEventListener('change', (e) => {
      const sec = parseTimecode(e.target.value);
      trimmer.setEndTime(sec);
    });
  }

  function parseTimecode(str) {
    const parts = str.trim().split(':');
    if (parts.length === 2) {
      return (parseFloat(parts[0]) || 0) * 60 + (parseFloat(parts[1]) || 0);
    }
    return parseFloat(str) || 0;
  }

  // 3. Audio File Loading (Drag & Drop + File input)
  if (dropZone) {
    dropZone.addEventListener('click', () => {
      if (fileInput) fileInput.click();
    });

    ['dragenter', 'dragover'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      dropZone.addEventListener(name, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });

    dropZone.addEventListener('drop', async (e) => {
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        await handleAudioFile(files[0]);
      }
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      if (e.target.files.length > 0) {
        await handleAudioFile(e.target.files[0]);
      }
    });
  }

  function displayTrackInStudio(buffer, fileName, thumbnail) {
    loadedBuffer = buffer;
    window.FHAudioEngine.sourceBuffer = buffer;
    window.FHAudioEngine.sourceFileName = fileName;
    if (thumbnail) window.FHAudioEngine.sourceThumbnail = thumbnail;

    // 1. Update DropZone UI to active state matching reference
    if (dropZone) {
      dropZone.classList.add('has-file');
      const emptyContent = document.getElementById('dropzoneEmptyContent');
      const loadedContent = document.getElementById('dropzoneLoadedContent');
      const fileNameEl = document.getElementById('dropzoneFileName');
      if (emptyContent) emptyContent.style.display = 'none';
      if (loadedContent) loadedContent.style.display = 'flex';
      if (fileNameEl) fileNameEl.textContent = fileName;
    }

    // 2. Update Source Bar
    if (sourceBar) sourceBar.style.display = 'flex';
    if (sourceTitle) {
      sourceTitle.textContent = fileName;
      sourceTitle.style.display = 'inline-block';
    }
    if (sourceTitleInput) {
      sourceTitleInput.value = fileName;
      sourceTitleInput.style.display = 'none';
    }
    if (btnEditSourceTitle) btnEditSourceTitle.style.display = 'inline-flex';
    if (sourceThumb) {
      sourceThumb.src = thumbnail || window.FHAudioEngine.sourceThumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=60';
    }

    // 3. Show Waveform Card & Load Trimmer
    if (waveformCard) waveformCard.style.display = 'flex';
    trimmer.loadAudioBuffer(loadedBuffer);

    // 4. Update Time Displays & Inputs
    const durFormatted = trimmer.formatTime(loadedBuffer.duration);
    if (trimmerTotalTime) {
      const parts = durFormatted.split('.');
      trimmerTotalTime.textContent = parts[0] || '0:00';
    }
    if (inputStartTime) inputStartTime.value = '0:00.0';
    if (inputEndTime) inputEndTime.value = durFormatted;
    if (trimmerCurrTime) trimmerCurrTime.textContent = '0:00.0';

    // 5. Update Calculation Status & Enable Convert Button
    updateCalculationSummary();
    if (btnConvert) btnConvert.disabled = false;
    if (resultCard) resultCard.style.display = 'none';
    if (window.FHTags && typeof window.FHTags.updatePreview === 'function') {
      window.FHTags.updatePreview();
    }
  }

  window.displayTrackInStudio = displayTrackInStudio;

  // Source Title Inline Edit Handlers
  function enableSourceTitleEdit() {
    if (!sourceTitle || !sourceTitleInput) return;
    sourceTitleInput.value = window.FHAudioEngine.sourceFileName || sourceTitle.textContent || '';
    sourceTitle.style.display = 'none';
    if (btnEditSourceTitle) btnEditSourceTitle.style.display = 'none';
    sourceTitleInput.style.display = 'inline-block';
    sourceTitleInput.focus();
    sourceTitleInput.select();
  }

  function saveSourceTitleEdit() {
    if (!sourceTitle || !sourceTitleInput) return;
    const val = sourceTitleInput.value.trim();
    if (val) {
      sourceTitle.textContent = val;
      window.FHAudioEngine.sourceFileName = val;
      window.showToast(`Judul diubah: "${val}"`);
    }
    sourceTitleInput.style.display = 'none';
    sourceTitle.style.display = 'inline-block';
    if (btnEditSourceTitle) btnEditSourceTitle.style.display = 'inline-flex';
  }

  if (btnEditSourceTitle) {
    btnEditSourceTitle.addEventListener('click', (e) => {
      e.stopPropagation();
      enableSourceTitleEdit();
    });
  }

  if (sourceTitle) {
    sourceTitle.addEventListener('click', () => {
      enableSourceTitleEdit();
    });
  }

  if (sourceTitleInput) {
    sourceTitleInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        saveSourceTitleEdit();
      } else if (e.key === 'Escape') {
        sourceTitleInput.style.display = 'none';
        sourceTitle.style.display = 'inline-block';
        if (btnEditSourceTitle) btnEditSourceTitle.style.display = 'inline-flex';
      }
    });
    sourceTitleInput.addEventListener('blur', saveSourceTitleEdit);
  }

  async function handleAudioFile(file) {
    try {
      window.showToast(`Memuat berkas: ${file.name}...`);
      const buf = await window.FHAudioEngine.loadAudioFile(file);
      displayTrackInStudio(buf, file.name);
      window.showToast('Audio siap dipotong & dikonversi!');
    } catch (err) {
      console.error(err);
      alert('Gagal mendekode audio. Pastikan format file adalah MP3, WAV, atau OGG.');
    }
  }

  // 4. Presets (Speed & Amplification)
  const presetPills = document.querySelectorAll('.btn-preset-pill');
  presetPills.forEach(pill => {
    pill.addEventListener('click', () => {
      presetPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const speedVal = parseFloat(pill.dataset.speed);
      const ampVal = parseFloat(pill.dataset.amp);

      if (sliderSpeed && speedVal) {
        sliderSpeed.value = speedVal;
        if (valSpeed) valSpeed.textContent = `${speedVal.toFixed(1)}x`;
      }
      if (sliderAmp && ampVal !== undefined) {
        sliderAmp.value = ampVal;
        if (valAmp) valAmp.textContent = `${ampVal} dB`;
      }
      updateCalculationSummary();
    });
  });

  // 5. Audio Quality Presets (Max Duration)
  const qualityPills = document.querySelectorAll('.btn-quality-pill');
  qualityPills.forEach(pill => {
    pill.addEventListener('click', () => {
      qualityPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const maxDur = parseInt(pill.dataset.duration, 10);
      if (sliderMaxDuration && maxDur) {
        sliderMaxDuration.value = maxDur;
        if (valMaxDuration) valMaxDuration.textContent = `${maxDur}s`;
      }
      updateCalculationSummary();
    });
  });

  // 6. Sliders Event Wiring
  if (sliderSpeed) {
    sliderSpeed.addEventListener('input', (e) => {
      const v = parseFloat(e.target.value);
      if (valSpeed) valSpeed.textContent = `${v.toFixed(1)}x`;
      presetPills.forEach(p => p.classList.remove('active'));
      updateCalculationSummary();
    });
  }

  if (sliderAmp) {
    sliderAmp.addEventListener('input', (e) => {
      const v = parseInt(e.target.value, 10);
      if (valAmp) valAmp.textContent = `${v} dB`;
      presetPills.forEach(p => p.classList.remove('active'));
    });
  }

  if (sliderQuality) {
    sliderQuality.addEventListener('input', (e) => {
      if (valQuality) valQuality.textContent = e.target.value;
    });
  }

  if (sliderMaxDuration) {
    sliderMaxDuration.addEventListener('input', (e) => {
      if (valMaxDuration) valMaxDuration.textContent = `${e.target.value}s`;
      qualityPills.forEach(p => p.classList.remove('active'));
      updateCalculationSummary();
    });
  }

  // 6b. Audio Enhancement Toggles Listeners
  if (toggleTreble) {
    toggleTreble.addEventListener('change', () => {
      window.showToast(`Filter Treble: ${toggleTreble.checked ? 'AKTIF (+1.5 dB Subtle)' : 'MATI'}`);
      if (isTrimmerPlaying && currentPreviewMode !== 'original') startTrimmerPlayback();
    });
  }

  if (toggleLimiter) {
    toggleLimiter.addEventListener('change', () => {
      window.showToast(`Headroom Limiter: ${toggleLimiter.checked ? 'AKTIF (Threshold -1.5 dB)' : 'MATI'}`);
      if (isTrimmerPlaying && currentPreviewMode !== 'original') startTrimmerPlayback();
    });
  }

  if (toggleAutoSplit) {
    toggleAutoSplit.addEventListener('change', () => {
      window.showToast(`Auto-Split (> 6 Menit): ${toggleAutoSplit.checked ? 'AKTIF' : 'MATI'}`);
      updateCalculationSummary();
    });
  }

  // 7. Conversion Pipeline Execution
  if (btnConvert) {
    btnConvert.addEventListener('click', async () => {
      if (!loadedBuffer) return;

      btnConvert.disabled = true;
      if (convertProgressWrap) convertProgressWrap.style.display = 'flex';
      if (convertProgressFill) convertProgressFill.style.width = '10%';
      if (convertProgressStatus) convertProgressStatus.textContent = 'Memotong audio sesuai seleksi...';

      try {
        // Step 1: Slice trimmed region
        const trimmedBuffer = window.FHAudioEngine.sliceAudioBuffer(
          loadedBuffer,
          trimmer.startTime,
          trimmer.endTime
        );

        if (convertProgressFill) convertProgressFill.style.width = '35%';
        if (convertProgressStatus) convertProgressStatus.textContent = 'Mempercepat (Bypass) & menerapkan Limiter / Filter...';

        const speed = parseFloat(sliderSpeed.value) || 2.3;
        const ampDb = parseFloat(sliderAmp.value) || -4;
        const quality = parseInt(sliderQuality.value, 10) || 6;
        const isAutoSplit = toggleAutoSplit ? toggleAutoSplit.checked : true;
        const maxDurationSec = isAutoSplit ? (parseInt(sliderMaxDuration.value, 10) || 360) : 999999;
        const enableTreble = toggleTreble ? toggleTreble.checked : false;
        const enableLimiter = toggleLimiter ? toggleLimiter.checked : true;

        // Step 2: Render bypass audio with gain, limiter, and subtle treble EQ (44.1 kHz standardized)
        const renderedBuffer = await window.FHAudioEngine.renderBypassBuffer(trimmedBuffer, {
          speed,
          ampDb,
          enableTreble,
          enableLimiter
        });

        if (convertProgressFill) convertProgressFill.style.width = '60%';
        if (convertProgressStatus) convertProgressStatus.textContent = 'Memeriksa durasi & auto-split multipart (> 6 Menit)...';

        // Step 3: Split into parts if needed
        const rawParts = window.FHAudioEngine.splitBufferIntoParts(renderedBuffer, maxDurationSec, isAutoSplit);

        if (convertProgressFill) convertProgressFill.style.width = '80%';
        if (convertProgressStatus) convertProgressStatus.textContent = 'Mengompresi ke format OGG Vorbis (Roblox)...';

        // Step 4: Encode each part to OGG
        const encodedParts = [];
        const partBlobs = [];

        for (let i = 0; i < rawParts.length; i++) {
          const p = rawParts[i];
          const blob = await window.FHAudioEngine.encodeToFormat(p.buffer, 'ogg', quality);
          partBlobs.push(blob);
          encodedParts.push({
            partNum: p.partNum,
            duration: trimmer.formatTime(p.duration),
            durationSec: p.duration,
            assetId: '',
            viaAccount: '',
            moderationStatus: 'unchecked'
          });
        }

        if (convertProgressFill) convertProgressFill.style.width = '100%';
        if (convertProgressStatus) convertProgressStatus.textContent = 'Selesai!';

        // Step 5: Calculate Roblox playback parameters
        // Target PlaybackSpeed in Roblox = 1 / speed
        const robloxPlaybackSpeed = (1 / speed).toFixed(3);
        // Linear volume inverse compensation for Roblox sound object
        const robloxVolumeComp = (1 / Math.pow(10, ampDb / 20)).toFixed(2);

        // Step 6: Save to History
        const songTitle = window.FHAudioEngine.sourceFileName || 'FH Audio Track.mp3';
        const historyItem = window.FHStorage.addHistoryItem({
          title: songTitle,
          thumbnail: window.FHAudioEngine.sourceThumbnail || 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=100&auto=format&fit=crop&q=60',
          speed: speed,
          robloxSpeed: parseFloat(robloxPlaybackSpeed),
          volumeDb: ampDb,
          robloxVolume: parseFloat(robloxVolumeComp),
          quality: quality,
          maxPartDuration: maxDurationSec,
          parts: encodedParts
        });

        // Save part blobs to IndexedDB so Preview and Upload work even after page refresh
        for (let i = 0; i < partBlobs.length; i++) {
          await window.FHStorage.savePartBlob(historyItem.id, i + 1, partBlobs[i]);
        }

        // Save original trimmed blob for "Preview Real Song" in History
        try {
          const origBlob = await window.FHAudioEngine.encodeToFormat(trimmedBuffer, 'ogg', 6);
          await window.FHStorage.saveOriginalBlob(historyItem.id, origBlob);
        } catch (e) {
          console.warn('Could not save original blob:', e);
        }

        lastRenderedResult = {
          parts: rawParts,
          blobs: partBlobs,
          historyItem: historyItem
        };
        window.lastRenderedResult = lastRenderedResult;

        // Reset Roblox upload button state on result card
        if (btnUploadResultRoblox) {
          btnUploadResultRoblox.dataset.assetId = '';
          btnUploadResultRoblox.title = 'Upload ke Roblox Open Cloud';
          btnUploadResultRoblox.disabled = false;
          btnUploadResultRoblox.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="16 16 12 12 8 16"></polyline><line x1="12" y1="12" x2="12" y2="21"></line><path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"></path><polyline points="16 16 12 12 8 16"></polyline></svg> Upload ke Roblox`;
          btnUploadResultRoblox.style.background = '';
          btnUploadResultRoblox.style.borderColor = '';
          btnUploadResultRoblox.style.color = '';
        }

        // Step 7: Show Result Card
        if (resultCard) {
          resultCard.style.display = 'flex';
          if (resultMetaSpeed) resultMetaSpeed.textContent = `${speed}x`;
          if (resultMetaRobloxSpeed) resultMetaRobloxSpeed.textContent = robloxPlaybackSpeed;
          if (resultMetaVol) resultMetaVol.textContent = `${ampDb} dB`;
          if (resultMetaParts) resultMetaParts.textContent = `${encodedParts.length} Part`;
        }

        window.showToast('Audio berhasil diproses & disimpan ke History!');

        // Check if auto upload checkbox is checked
        const chkAutoUpload = document.getElementById('chkAutoUpload');
        if (chkAutoUpload && chkAutoUpload.checked) {
          if (typeof window.executeRobloxUpload === 'function') {
            const res = await window.executeRobloxUpload(historyItem, 1, btnUploadResultRoblox);
            if (res && res.assetId) {
              btnUploadResultRoblox.dataset.assetId = res.assetId;
            }
          }
        }

      } catch (err) {
        console.error(err);
        alert('Terjadi kesalahan saat memproses audio.');
      } finally {
        btnConvert.disabled = false;
        setTimeout(() => {
          if (convertProgressWrap) convertProgressWrap.style.display = 'none';
        }, 1500);
      }
    });
  }

  // 8. Result Card Actions
  if (btnDownloadResultAudio) {
    btnDownloadResultAudio.addEventListener('click', () => {
      if (!lastRenderedResult || !lastRenderedResult.blobs.length) return;
      lastRenderedResult.blobs.forEach((blob, idx) => {
        const cleanName = (lastRenderedResult.historyItem.title || 'audio').replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `part_${idx + 1}_${cleanName}.ogg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      });
      window.showToast('Berkas audio berhasil diunduh!');
    });
  }

  if (btnUploadResultRoblox) {
    btnUploadResultRoblox.addEventListener('click', async () => {
      if (!lastRenderedResult) return;

      // 1. If already uploaded and has asset ID, copy the asset ID instead of re-uploading!
      if (btnUploadResultRoblox.dataset.assetId) {
        const assetId = btnUploadResultRoblox.dataset.assetId;
        try {
          await navigator.clipboard.writeText(assetId);
          window.showToast(`Asset ID (${assetId}) berhasil disalin ke clipboard!`);
        } catch (e) {
          window.showToast(`Asset ID: ${assetId}`);
        }

        const prevHtml = btnUploadResultRoblox.innerHTML;
        btnUploadResultRoblox.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg> ✓ Disalin!`;
        setTimeout(() => {
          btnUploadResultRoblox.innerHTML = prevHtml;
        }, 1500);
        return;
      }

      // 2. Otherwise perform upload
      if (typeof window.executeRobloxUpload === 'function') {
        const res = await window.executeRobloxUpload(lastRenderedResult.historyItem, 1, btnUploadResultRoblox);
        if (res && res.assetId) {
          btnUploadResultRoblox.dataset.assetId = res.assetId;
          btnUploadResultRoblox.title = "Klik untuk menyalin Asset ID ke clipboard";
        }
      }
    });
  }

  if (btnOpenInHistory) {
    btnOpenInHistory.addEventListener('click', () => {
      window.switchTab('history');
    });
  }
});
