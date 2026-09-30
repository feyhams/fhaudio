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
      const endpoints = [
        window.getBackendUrl ? window.getBackendUrl('/api/settings') : '',
        'http://127.0.0.1:5520/api/settings',
        'http://localhost:5520/api/settings',
        '/api/settings'
      ].filter(Boolean);

      let isOnline = false;
      for (const u of endpoints) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 1500);
          const resp = await fetch(u, { signal: controller.signal }).catch(() => null);
          clearTimeout(timeoutId);
          if (resp && resp.ok) {
            isOnline = true;
            break;
          }
        } catch (_) {}
      }

      if (isOnline) {
        badge.className = 'server-status-pill online';
        text.textContent = 'Server: Terhubung';
        badge.title = 'Server lokal port 5520 aktif! Siap download YouTube & upload Roblox 1-klik.';
        if (!quiet) window.showToast('✓ Server lokal aktif di port 5520!');
      } else {
        badge.className = 'server-status-pill offline';
        text.textContent = 'Mode Standalone';
        badge.title = 'Server lokal port 5520 belum aktif. Berjalan di Mode Standalone.';
        if (!quiet) window.showToast('Server lokal port 5520 belum aktif. Berjalan di Mode Standalone.');
      }
    } catch (e) {
      badge.className = 'server-status-pill offline';
      text.textContent = 'Mode Standalone';
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
  const toggleMetalMode = document.getElementById('toggleMetalMode');

  // Preview Mode State ('original' | 'bypass' | 'roblox')
  let currentPreviewMode = 'original';
  const btnPreviewModes = document.querySelectorAll('.btn-preview-mode');

  // State
  let loadedBuffer = null;
  let lastRenderedResult = null; // { parts, historyItem, oggBlobs }

  // 1. Initialize Waveform Trimmer
  const trimmer = new window.WaveformTrimmer('waveformCanvas', 'waveformContainer');
  window.trimmerInstance = trimmer;

  trimmer.onTrimChange = (info) => {
    if (inputStartTime) inputStartTime.value = info.formattedStart;
    if (inputEndTime) inputEndTime.value = info.formattedEnd;
    updateCalculationSummary();
  };

  trimmer.onSeek = (timeSec) => {
    trimmer.currentTime = timeSec;
    if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(timeSec);
    if (isTrimmerPlaying) {
      startTrimmerPlayback();
    }
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

  function startTrimmerPlayback(forcedStartTime) {
    if (!loadedBuffer) return;

    let start;
    if (typeof forcedStartTime === 'number' && isFinite(forcedStartTime)) {
      start = forcedStartTime;
      trimmer.setPlayheadTime(start);
    } else {
      // If playhead is at or past end, or before start, start cleanly at trimmer.startTime
      start = (trimmer.currentTime >= trimmer.endTime || trimmer.currentTime < trimmer.startTime)
        ? trimmer.startTime
        : trimmer.currentTime;
    }

    setPlayState(true);

    const speed = parseFloat(sliderSpeed ? sliderSpeed.value : 2.3) || 2.3;
    const ampDb = parseFloat(sliderAmp ? sliderAmp.value : -4) || -4;
    const enableTreble = toggleTreble ? toggleTreble.checked : false;
    const enableLimiter = toggleLimiter ? toggleLimiter.checked : true;
    const enableMetalMode = toggleMetalMode ? toggleMetalMode.checked : false;

    window.FHAudioEngine.playAudio(
      loadedBuffer,
      start,
      {
        mode: currentPreviewMode,
        speed,
        ampDb,
        enableTreble,
        enableLimiter,
        enableMetalMode
      },
      (curr) => {
        trimmer.setPlayheadTime(curr);
        if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(curr);
        if (curr >= trimmer.endTime) {
          window.FHAudioEngine.stopPlayback();
          setPlayState(false);
          // Automatically reset playhead back to START handle so next playback starts cleanly from start!
          trimmer.setPlayheadTime(trimmer.startTime);
          if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(trimmer.startTime);
        }
      },
      () => {
        setPlayState(false);
      }
    );
  }

  if (btnCirclePlay) {
    btnCirclePlay.addEventListener('click', () => {
      if (!loadedBuffer) {
        window.showToast('Pilih atau unduh file audio terlebih dahulu!');
        return;
      }
      if (isTrimmerPlaying) {
        window.FHAudioEngine.stopPlayback();
        setPlayState(false);
      } else {
        // If playhead was sitting at or past endTime, or before startTime, ensure play starts from startTime
        if (trimmer.currentTime >= trimmer.endTime || trimmer.currentTime < trimmer.startTime) {
          trimmer.setPlayheadTime(trimmer.startTime);
          if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(trimmer.startTime);
        }
        startTrimmerPlayback();
      }
    });
  }

  const btnRestartStart = document.getElementById('btnRestartStart');
  if (btnRestartStart) {
    btnRestartStart.addEventListener('click', () => {
      if (!loadedBuffer) {
        window.showToast('Pilih atau unduh file audio terlebih dahulu!');
        return;
      }
      trimmer.setPlayheadTime(trimmer.startTime);
      if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(trimmer.startTime);
      startTrimmerPlayback(trimmer.startTime);
      window.showToast('▶ Memutar dari awal (Start Handle)');
    });
  }

  function setPlayState(playing) {
    isTrimmerPlaying = playing;
    if (playIcon) playIcon.style.display = playing ? 'none' : 'block';
    if (pauseIcon) pauseIcon.style.display = playing ? 'block' : 'none';
  }

  // Keyboard Shortcuts (Space: Play/Pause, Home/R: Restart from Start Cut)
  window.addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!loadedBuffer) {
        window.showToast('Pilih atau unduh file audio terlebih dahulu!');
        return;
      }
      if (isTrimmerPlaying) {
        window.FHAudioEngine.stopPlayback();
        setPlayState(false);
      } else {
        if (trimmer.currentTime >= trimmer.endTime || trimmer.currentTime < trimmer.startTime) {
          trimmer.setPlayheadTime(trimmer.startTime);
        }
        startTrimmerPlayback();
      }
    } else if (e.code === 'Home' || e.key === 'r' || e.key === 'R') {
      if (!loadedBuffer) return;
      trimmer.setPlayheadTime(trimmer.startTime);
      if (trimmerCurrTime) trimmerCurrTime.textContent = trimmer.formatTime(trimmer.startTime);
      startTrimmerPlayback(trimmer.startTime);
      window.showToast('▶ Memutar dari awal (Start Handle)');
    }
  });

  // Snap to playhead buttons
  if (btnSnapStart) {
    btnSnapStart.addEventListener('click', () => {
      if (!loadedBuffer) {
        window.showToast('Pilih atau unduh file audio terlebih dahulu!');
        return;
      }
      trimmer.setStartTime(trimmer.currentTime);
      window.showToast(`Start cut diatur ke ${trimmer.formatTime(trimmer.startTime)}`);
    });
  }
  if (btnSnapEnd) {
    btnSnapEnd.addEventListener('click', () => {
      if (!loadedBuffer) {
        window.showToast('Pilih atau unduh file audio terlebih dahulu!');
        return;
      }
      trimmer.setEndTime(trimmer.currentTime);
      window.showToast(`End cut diatur ke ${trimmer.formatTime(trimmer.endTime)}`);
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
    if (waveformCard) {
      waveformCard.style.display = 'flex';
    }
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
    trimmer.setPlayheadTime(0);

    // 5. Update Calculation Status & Enable Convert Button
    updateCalculationSummary();
    if (btnConvert) btnConvert.disabled = false;
    if (resultCard) resultCard.style.display = 'none';
    if (window.FHTags && typeof window.FHTags.updatePreview === 'function') {
      window.FHTags.updatePreview();
    }

    // Explicit redraw passes to guarantee layout reflow on canvas
    requestAnimationFrame(() => {
      trimmer.resizeCanvas();
      trimmer.draw();
      trimmer.renderRuler('waveformRuler');
    });
    setTimeout(() => {
      trimmer.resizeCanvas();
      trimmer.draw();
      trimmer.renderRuler('waveformRuler');
    }, 100);
  }

  window.displayTrackInStudio = displayTrackInStudio;

  async function loadTrackIntoStudio(historyItem) {
    if (!historyItem) return false;
    try {
      window.showToast(`⏳ Mengambil audio master "${historyItem.title || 'Track'}"...`);
      const blob = await window.FHStorage.getOriginalBlob(historyItem.id);
      if (!blob) {
        alert('Berkas audio master asli tidak ditemukan di penyimpanan lokal.');
        return false;
      }
      const ctx = window.FHAudioEngine.getAudioContext();
      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      if (window.FHAudioEngine) {
        window.FHAudioEngine.pendingOriginalBlob = blob;
        window.FHAudioEngine.sourceUrl = historyItem.sourceUrl || '';
      }

      if (sliderSpeed && historyItem.speed) {
        sliderSpeed.value = historyItem.speed;
        if (valSpeed) valSpeed.textContent = `${parseFloat(historyItem.speed).toFixed(1)}x`;
      }
      if (sliderAmp && historyItem.volumeDb !== undefined) {
        sliderAmp.value = historyItem.volumeDb;
        if (valAmp) valAmp.textContent = `${historyItem.volumeDb} dB`;
      }
      if (sliderQuality && historyItem.quality) {
        sliderQuality.value = historyItem.quality;
        if (valQuality) valQuality.textContent = `${historyItem.quality}`;
      }
      if (sliderMaxDuration && historyItem.maxPartDuration) {
        sliderMaxDuration.value = historyItem.maxPartDuration;
        if (valMaxDuration) valMaxDuration.textContent = `${historyItem.maxPartDuration}s`;
      }

      // Switch tab FIRST before displayTrackInStudio so DOM is visible & container has non-zero size!
      if (typeof window.switchTab === 'function') {
        window.switchTab('bypass');
      }

      // Ensure Single mode panel is active and visible
      const btnModeSingle = document.getElementById('btnModeSingle');
      const btnModeMass = document.getElementById('btnModeMass');
      const singleConvertPanel = document.getElementById('singleConvertPanel');
      const massConvertPanel = document.getElementById('massConvertPanel');
      if (btnModeSingle && singleConvertPanel) {
        btnModeSingle.classList.add('active');
        if (btnModeMass) btnModeMass.classList.remove('active');
        singleConvertPanel.style.display = 'flex';
        if (massConvertPanel) massConvertPanel.classList.remove('active');
      }

      displayTrackInStudio(audioBuffer, historyItem.title || 'Audio Track', historyItem.thumbnail);

      // Force multiple rAF/timeouts to guarantee canvas render after CSS transitions
      requestAnimationFrame(() => {
        if (trimmer) {
          trimmer.resizeCanvas();
          trimmer.draw();
          trimmer.renderRuler('waveformRuler');
        }
      });
      setTimeout(() => {
        if (trimmer) {
          trimmer.resizeCanvas();
          trimmer.draw();
          trimmer.renderRuler('waveformRuler');
        }
      }, 100);

      const waveEl = document.getElementById('waveformCard');
      if (waveEl) {
        waveEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      window.showToast(`✓ Master "${historyItem.title}" dibuka di Studio! Ubah speed atau volume lalu klik Convert & Split.`);
      return true;
    } catch (err) {
      console.error('Error loading track into studio:', err);
      alert('Gagal membuka audio ke studio: ' + (err.message || err));
      return false;
    }
  }

  window.loadTrackIntoStudio = loadTrackIntoStudio;

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

  if (toggleMetalMode) {
    toggleMetalMode.addEventListener('change', () => {
      const isMetal = toggleMetalMode.checked;
      if (isMetal) {
        // Auto-optimize recommended parameters for Metal & Heavy Rock
        if (toggleTreble) toggleTreble.checked = false; // Turn off treble boost to prevent razor sibilance
        if (toggleLimiter) toggleLimiter.checked = true; // Ensure limiter is active
        
        // Auto-select Slow 2.1x sweet spot for maximum cymbal & top-end preservation
        const pill21 = document.querySelector('.btn-preset-pill[data-speed="2.1"]');
        if (pill21) pill21.click();

        // Safe -5 dB headroom for dense metal masters
        if (sliderAmp) {
          sliderAmp.value = -5;
          if (valAmp) valAmp.textContent = '-5 dB';
        }

        window.showToast('🎸 Mode Metal & Rock AKTIF: De-Harsh (-2.5 dB @ 3.8kHz) & Bass Punch (+2 dB @ 90Hz)!', 5500);
      } else {
        window.showToast('Mode Metal & Rock dinonaktifkan (Kurva EQ Standar).');
      }

      if (isTrimmerPlaying && currentPreviewMode !== 'original') {
        startTrimmerPlayback();
      }
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
        const enableMetalMode = toggleMetalMode ? toggleMetalMode.checked : false;

        // Step 2: Render bypass audio with gain, limiter, metal de-harshing, and subtle treble EQ (44.1 kHz standardized)
        const renderedBuffer = await window.FHAudioEngine.renderBypassBuffer(trimmedBuffer, {
          speed,
          ampDb,
          enableTreble,
          enableLimiter,
          enableMetalMode
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
          sourceUrl: window.FHAudioEngine.sourceUrl || '',
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
        // Priority: pendingOriginalBlob = raw bytes from yt-dlp (guaranteed decodable)
        // Fallback: WAV encode (pure JS, always valid) \u2014 NOT OGG WASM (can produce corrupt data)
        try {
          const pendingBlob = window.FHAudioEngine.pendingOriginalBlob;
          if (pendingBlob && pendingBlob.size > 1000) {
            await window.FHStorage.saveOriginalBlob(historyItem.id, pendingBlob);
            window.FHAudioEngine.pendingOriginalBlob = null;
          } else {
            // Local file: encode trimmed region to WAV (pure JS, never corrupt)
            const origBlob = window.FHAudioEngine.encodeWav(trimmedBuffer);
            await window.FHStorage.saveOriginalBlob(historyItem.id, origBlob);
          }
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
