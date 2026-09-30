/**
 * FH Audio - High Performance Audio Processing Engine (Web Audio API + WASM)
 * Supports: Trim, Pitch/Speed Bypass, Headroom/Amplification, Treble EQ, Auto-Split Multi-part,
 * WASM OGG/MP3/WAV Encoding, and Roblox In-game Simulation Player.
 */

class AudioEngine {
  constructor() {
    this.audioCtx = null;
    this.sourceBuffer = null;
    this.sourceFileName = '';
    this.sourceThumbnail = '';

    // Active playback node
    this.playbackSource = null;
    this.isPlaying = false;
    this.playbackStartTime = 0;
    this.playbackOffset = 0;
    this.animFrameId = null;

    // Simulation playback
    this.simSource = null;
    this.isSimPlaying = false;
  }

  getAudioContext() {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  async loadAudioFile(file) {
    const ctx = this.getAudioContext();
    const arrayBuffer = await file.arrayBuffer();
    this.sourceBuffer = await ctx.decodeAudioData(arrayBuffer);
    this.sourceFileName = file.name;
    return this.sourceBuffer;
  }

  async loadAudioFromUrl(url) {
    const ctx = this.getAudioContext();
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    this.sourceBuffer = await ctx.decodeAudioData(arrayBuffer);
    return this.sourceBuffer;
  }

  createSyntheticBuffer(durationSec = 185.4, title = 'Yamê - Bécane | A COLORS SHOW') {
    const ctx = this.getAudioContext();
    const sampleRate = ctx.sampleRate || 44100;
    const channels = 2;
    const length = Math.max(1, Math.floor(durationSec * sampleRate));
    const buffer = ctx.createBuffer(channels, length, sampleRate);

    // Generate rich musical waveform envelope and pleasant melodic preview
    for (let c = 0; c < channels; c++) {
      const data = buffer.getChannelData(c);
      for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const beat = Math.sin(2 * Math.PI * 2.0 * t); // 120 bpm
        const bass = Math.sin(2 * Math.PI * 110 * t) * (beat > 0.6 ? 0.35 : 0.08);
        const chord = (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 554.37 * t)) * 0.08;
        const progress = t / durationSec;
        const songStructure = (progress < 0.1) ? 0.4 : (progress > 0.9 ? 0.3 : (0.7 + 0.3 * Math.sin(progress * 16)));
        data[i] = (bass + chord) * songStructure * (0.85 + 0.15 * Math.sin(t * 80));
      }
    }

    this.sourceBuffer = buffer;
    this.sourceFileName = (title.endsWith('.mp3') ? title : title + '.mp3');
    return buffer;
  }

  // Slices an AudioBuffer from startTime to endTime
  sliceAudioBuffer(buffer, startTime, endTime) {
    const ctx = this.getAudioContext();
    const sampleRate = buffer.sampleRate;
    const channels = buffer.numberOfChannels;

    const startOffset = Math.max(0, Math.floor(startTime * sampleRate));
    const endOffset = Math.min(buffer.length, Math.floor(endTime * sampleRate));
    const frameCount = Math.max(1, endOffset - startOffset);

    const slicedBuffer = ctx.createBuffer(channels, frameCount, sampleRate);
    for (let c = 0; c < channels; c++) {
      const sourceData = buffer.getChannelData(c);
      const targetData = slicedBuffer.getChannelData(c);
      targetData.set(sourceData.subarray(startOffset, endOffset));
    }
    return slicedBuffer;
  }

  /**
   * Processes audio buffer with speed-up (Bypass), amplification gain, subtle treble EQ, and headroom limiter.
   * Standardizes sample rate to 44.1 kHz (Roblox native standard).
   * @param {AudioBuffer} inputBuffer 
   * @param {Object} options { speed: 2.3, ampDb: -4, enableTreble: false, enableLimiter: true }
   */
  async renderBypassBuffer(inputBuffer, options = {}) {
    const speed = parseFloat(options.speed) || 2.3;
    const ampDb = parseFloat(options.ampDb) || -4;
    // Default Filter Treble: OFF (Mati)
    const enableTreble = !!options.enableTreble;
    // Default Headroom Limiter: ON (Aktif)
    const enableLimiter = options.enableLimiter !== false;
    // Metal & Rock Anti-Cempreng Shield
    const enableMetalMode = !!options.enableMetalMode;

    // Roblox native standard: 44.1 kHz
    const targetSampleRate = 44100;
    const channels = inputBuffer.numberOfChannels;
    // Duration reduced by speed factor
    const targetDurationSec = (inputBuffer.length / inputBuffer.sampleRate) / speed;
    const targetLength = Math.max(1, Math.round(targetDurationSec * targetSampleRate));

    const offlineCtx = new OfflineAudioContext(channels, targetLength, targetSampleRate);

    // Buffer source
    const sourceNode = offlineCtx.createBufferSource();
    sourceNode.buffer = inputBuffer;
    sourceNode.playbackRate.value = speed;

    let lastNode = sourceNode;

    // 1. Metal & Rock Mode: De-Harshing, Bass Punch, and Air Smoothing
    if (enableMetalMode) {
      // a. Anti-Harsh Peaking Filter (-2.5 dB @ 3800 Hz) - Meredam "suara lebah" distorsi gitar
      const deHarsh = offlineCtx.createBiquadFilter();
      deHarsh.type = 'peaking';
      deHarsh.frequency.value = 3800;
      deHarsh.Q.value = 1.2;
      deHarsh.gain.value = -2.5;
      lastNode.connect(deHarsh);
      lastNode = deHarsh;

      // b. Bass Punch Low-Shelf (+2.0 dB @ 90 Hz) - Mengokohkan kick drum & bass
      const bassPunch = offlineCtx.createBiquadFilter();
      bassPunch.type = 'lowshelf';
      bassPunch.frequency.value = 90;
      bassPunch.gain.value = 2.0;
      lastNode.connect(bassPunch);
      lastNode = bassPunch;

      // c. Top-End Air Smoothing (12 kHz Low-Pass) - Mencegah hashing simbal kasar
      const smoothing = offlineCtx.createBiquadFilter();
      smoothing.type = 'lowpass';
      smoothing.frequency.value = 12000;
      lastNode.connect(smoothing);
      lastNode = smoothing;
    }

    // 2. Filter Treble (+1.5 dB Subtle @ 8000 Hz) - Opsional (Default: OFF, diabaikan jika Metal Mode aktif)
    if (enableTreble && !enableMetalMode) {
      const highShelf = offlineCtx.createBiquadFilter();
      highShelf.type = 'highshelf';
      highShelf.frequency.value = 8000;
      highShelf.gain.value = 1.5;
      lastNode.connect(highShelf);
      lastNode = highShelf;
    }

    // 2. Headroom Gain Node
    const gainNode = offlineCtx.createGain();
    const linearGain = Math.pow(10, ampDb / 20);
    gainNode.gain.value = linearGain;
    lastNode.connect(gainNode);
    lastNode = gainNode;

    // 3. Headroom Limiter (True DynamicsCompressor: threshold -1.5 dB, ratio 20:1) - Default: ON
    // Mencegah lonjakan melewati 0 dBFS agar bebas dari suara kresek/clipping pada bass atau jedag-jedug
    if (enableLimiter) {
      const compressor = offlineCtx.createDynamicsCompressor();
      compressor.threshold.value = -1.5;
      compressor.ratio.value = 20.0;
      compressor.knee.value = 3.0;
      compressor.attack.value = 0.002;
      compressor.release.value = 0.050;
      lastNode.connect(compressor);
      lastNode = compressor;
    }

    lastNode.connect(offlineCtx.destination);
    sourceNode.start(0);

    const renderedBuffer = await offlineCtx.startRendering();
    return renderedBuffer;
  }

  /**
   * Splits rendered buffer into parts if duration exceeds maxDurationSec (Roblox limit).
   * @param {AudioBuffer} buffer
   * @param {number} maxDurationSec (default 360s / 6 minutes)
   * @param {boolean} enableAutoSplit (default true)
   */
  splitBufferIntoParts(buffer, maxDurationSec = 360, enableAutoSplit = true) {
    const totalDuration = buffer.duration;
    if (!enableAutoSplit || totalDuration <= maxDurationSec) {
      return [{ partNum: 1, buffer: buffer, duration: totalDuration }];
    }

    const parts = [];
    let start = 0;
    let partIndex = 1;

    while (start < totalDuration) {
      const end = Math.min(totalDuration, start + maxDurationSec);
      const partBuf = this.sliceAudioBuffer(buffer, start, end);
      parts.push({
        partNum: partIndex,
        buffer: partBuf,
        duration: end - start
      });
      start = end;
      partIndex++;
    }

    return parts;
  }

  /**
   * Encode AudioBuffer to OGG Vorbis / MP3 / WAV using wasm-media-encoders.
   * Standardized Vorbis encoding at VBR ~192 kbps (quality 0.6) at 44.1 kHz.
   */
  async encodeToFormat(audioBuffer, format = 'ogg', quality = 6) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const length = audioBuffer.length;

    // WAV Fallback encoder (Native pure client-side WAV encoding)
    if (format === 'wav') {
      return this.encodeWav(audioBuffer);
    }

    // Use WasmMediaEncoder if available in window
    if (window.WasmMediaEncoder) {
      try {
        let encoder;
        if (format === 'ogg') {
          // Standardisasi Vorbis quality (0 to 10 scale, default ~160-192 kbps VBR)
          let vorbisQ = 5;
          if (typeof quality === 'number') {
            if (quality >= 0 && quality <= 1) {
              vorbisQ = Math.round(quality * 10);
            } else {
              vorbisQ = Math.min(10, Math.max(0, Math.round(quality)));
            }
          }

          // Try local wasm first if served via HTTP, otherwise fallback to default unpkg
          const oggWasmUrl = (window.location.protocol.startsWith('http'))
            ? './src/libs/ogg.wasm'
            : 'https://unpkg.com/wasm-media-encoders@0.7.0/wasm/ogg.wasm';

          try {
            encoder = await window.WasmMediaEncoder.createEncoder('audio/ogg', oggWasmUrl);
          } catch (loadErr) {
            encoder = await window.WasmMediaEncoder.createOggEncoder();
          }

          encoder.configure({
            channels: numChannels,
            sampleRate: sampleRate,
            vbrQuality: vorbisQ
          });
        } else if (format === 'mp3') {
          const mp3WasmUrl = (window.location.protocol.startsWith('http'))
            ? './src/libs/mp3.wasm'
            : 'https://unpkg.com/wasm-media-encoders@0.7.0/wasm/mp3.wasm';

          try {
            encoder = await window.WasmMediaEncoder.createEncoder('audio/mpeg', mp3WasmUrl);
          } catch (loadErr) {
            encoder = await window.WasmMediaEncoder.createMp3Encoder();
          }

          encoder.configure({
            channels: numChannels,
            sampleRate: sampleRate,
            bitrate: 192
          });
        }

        if (encoder) {
          const channelData = [];
          for (let c = 0; c < numChannels; c++) {
            channelData.push(audioBuffer.getChannelData(c));
          }

          const chunks = [];
          const chunkSize = 44100;
          for (let i = 0; i < length; i += chunkSize) {
            const end = Math.min(i + chunkSize, length);
            const slice = [];
            for (let c = 0; c < numChannels; c++) {
              slice.push(channelData[c].subarray(i, end));
            }
            const encOut = encoder.encode(slice);
            if (encOut && encOut.length > 0) {
              chunks.push(new Uint8Array(encOut));
            }
          }

          const finalChunks = encoder.finalize();
          if (finalChunks && finalChunks.length > 0) {
            chunks.push(new Uint8Array(finalChunks));
          }

          const mimeType = format === 'ogg' ? 'audio/ogg' : 'audio/mpeg';
          return new Blob(chunks, { type: mimeType });
        }
      } catch (err) {
        console.warn('Wasm encoder error, falling back to WAV:', err);
      }
    }

    // Default to clean lossless WAV blob if WASM encoder is busy or unavailable
    return this.encodeWav(audioBuffer);
  }

  // Pure JavaScript PCM WAV encoder
  encodeWav(audioBuffer) {
    const numChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const samples = [];
    for (let c = 0; c < numChannels; c++) {
      samples.push(audioBuffer.getChannelData(c));
    }

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    const dataSize = audioBuffer.length * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // RIFF chunk
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    this.writeString(view, 8, 'WAVE');

    // fmt sub-chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);

    // data sub-chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, dataSize, true);

    // Write interleaved 16-bit PCM samples
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let c = 0; c < numChannels; c++) {
        let sample = samples[c][i];
        sample = Math.max(-1, Math.min(1, sample));
        const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, intSample, true);
        offset += 2;
      }
    }

    return new Blob([view], { type: 'audio/wav' });
  }

  writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // Playback control for audio trimmer with live DSP preview modes
  playAudio(buffer, startSec, optionsOrProgress, onProgressOrEnded, maybeEnded) {
    let options = {};
    let onProgress = null;
    let onEnded = null;

    if (typeof optionsOrProgress === 'function') {
      onProgress = optionsOrProgress;
      onEnded = onProgressOrEnded;
    } else {
      options = optionsOrProgress || {};
      onProgress = onProgressOrEnded;
      onEnded = maybeEnded;
    }

    this.stopPlayback();
    const ctx = this.getAudioContext();

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    this.playbackSource = ctx.createBufferSource();
    this.playbackSource.buffer = buffer;

    // Create persistent DSP filter chain for live real-time adjustments
    this.activeDeHarsh = ctx.createBiquadFilter();
    this.activeDeHarsh.type = 'peaking';
    this.activeDeHarsh.frequency.value = 3800;
    this.activeDeHarsh.Q.value = 1.2;
    this.activeDeHarsh.gain.value = 0;

    this.activeBassPunch = ctx.createBiquadFilter();
    this.activeBassPunch.type = 'lowshelf';
    this.activeBassPunch.frequency.value = 90;
    this.activeBassPunch.gain.value = 0;

    this.activeSmoothing = ctx.createBiquadFilter();
    this.activeSmoothing.type = 'lowpass';
    this.activeSmoothing.frequency.value = 22050;

    this.activeTreble = ctx.createBiquadFilter();
    this.activeTreble.type = 'highshelf';
    this.activeTreble.frequency.value = 8000;
    this.activeTreble.gain.value = 0;

    this.activeGain = ctx.createGain();
    this.activeGain.gain.value = 1.0;

    this.activeCompressor = ctx.createDynamicsCompressor();
    this.activeCompressor.threshold.value = 0;
    this.activeCompressor.ratio.value = 20.0;
    this.activeCompressor.knee.value = 3.0;
    this.activeCompressor.attack.value = 0.002;
    this.activeCompressor.release.value = 0.050;

    // Connect chain: source -> deHarsh -> bassPunch -> smoothing -> treble -> gain -> compressor -> destination
    try {
      this.playbackSource.connect(this.activeDeHarsh);
      this.activeDeHarsh.connect(this.activeBassPunch);
      this.activeBassPunch.connect(this.activeSmoothing);
      this.activeSmoothing.connect(this.activeTreble);
      this.activeTreble.connect(this.activeGain);
      this.activeGain.connect(this.activeCompressor);
      this.activeCompressor.connect(ctx.destination);
    } catch (graphErr) {
      console.warn('DSP graph connection error:', graphErr);
      try {
        this.playbackSource.connect(ctx.destination);
      } catch (e) {}
    }

    // Apply active options to the graph
    this.applyLiveDSP(options);

    const safeStart = Math.max(0, Math.min(buffer.duration - 0.05, isFinite(startSec) ? Number(startSec) : 0));
    this.currentTrackPosition = safeStart;
    this.lastClockTime = ctx.currentTime;
    this.isPlaying = true;

    const currentSource = this.playbackSource;
    currentSource.onended = () => {
      if (this.playbackSource !== currentSource) return;
      this.isPlaying = false;
      if (this.animFrameId) {
        cancelAnimationFrame(this.animFrameId);
        this.animFrameId = null;
      }
      if (typeof onEnded === 'function') onEnded();
    };

    try {
      this.playbackSource.start(0, safeStart);
    } catch (startErr) {
      console.error('Audio start error:', startErr);
      this.isPlaying = false;
      if (typeof onEnded === 'function') onEnded();
      return;
    }

    const updateLoop = () => {
      if (!this.isPlaying || this.playbackSource !== currentSource) return;
      const now = ctx.currentTime;
      const deltaClock = Math.max(0, now - this.lastClockTime);
      this.lastClockTime = now;
      const rate = (this.playbackSource && this.playbackSource.playbackRate) ? this.playbackSource.playbackRate.value : 1.0;
      this.currentTrackPosition += deltaClock * rate;
      if (typeof onProgress === 'function') onProgress(this.currentTrackPosition);
      this.animFrameId = requestAnimationFrame(updateLoop);
    };
    this.animFrameId = requestAnimationFrame(updateLoop);
  }

  applyLiveDSP(options = {}) {
    const ctx = this.getAudioContext();
    const now = ctx.currentTime;
    const ramp = 0.03; // Smooth 30ms transition to avoid audio clicks

    const mode = options.mode || 'original'; // 'original' | 'bypass' | 'roblox'
    const speed = parseFloat(options.speed) || 2.3;
    const ampDb = parseFloat(options.ampDb) || -4;
    const enableTreble = !!options.enableTreble;
    const enableLimiter = options.enableLimiter !== false;
    const enableMetalMode = !!options.enableMetalMode;

    if (mode === 'bypass') {
      // 1. Sped-up bypass audio (chipmunk sound for upload)
      if (this.playbackSource && this.playbackSource.playbackRate) {
        this.playbackSource.playbackRate.setTargetAtTime(speed, now, ramp);
      }

      // 2. Gain compensation (-4 dB etc.)
      if (this.activeGain && this.activeGain.gain) {
        const linearGain = Math.pow(10, ampDb / 20);
        this.activeGain.gain.setTargetAtTime(linearGain, now, ramp);
      }

      // 3. Metal Mode (De-harsh, Bass punch, Smoothing)
      if (enableMetalMode) {
        if (this.activeDeHarsh) this.activeDeHarsh.gain.setTargetAtTime(-2.5, now, ramp);
        if (this.activeBassPunch) this.activeBassPunch.gain.setTargetAtTime(2.0, now, ramp);
        if (this.activeSmoothing) this.activeSmoothing.frequency.setTargetAtTime(12000, now, ramp);
      } else {
        if (this.activeDeHarsh) this.activeDeHarsh.gain.setTargetAtTime(0, now, ramp);
        if (this.activeBassPunch) this.activeBassPunch.gain.setTargetAtTime(0, now, ramp);
        if (this.activeSmoothing) this.activeSmoothing.frequency.setTargetAtTime(22050, now, ramp);
      }

      // 4. Treble filter (+1.5 dB @ 8000 Hz)
      if (enableTreble && !enableMetalMode) {
        if (this.activeTreble) this.activeTreble.gain.setTargetAtTime(1.5, now, ramp);
      } else {
        if (this.activeTreble) this.activeTreble.gain.setTargetAtTime(0, now, ramp);
      }

      // 5. Headroom limiter
      if (this.activeCompressor && this.activeCompressor.threshold) {
        this.activeCompressor.threshold.setTargetAtTime(enableLimiter ? -1.5 : 0, now, ramp);
      }

    } else if (mode === 'roblox') {
      // Simulasi Roblox:
      // Di dalam game Roblox, PlaybackSpeed diatur ke (1 / speed) sehingga tempo kembali ke normal 1.0x,
      // dan Sound.Volume dikompensasi ke normal.
      // Suara yang didengar pemain adalah tempo normal yang telah melewati pemrosesan DSP Roblox.
      if (this.playbackSource && this.playbackSource.playbackRate) {
        this.playbackSource.playbackRate.setTargetAtTime(1.0, now, ramp);
      }

      if (this.activeGain && this.activeGain.gain) {
        this.activeGain.gain.setTargetAtTime(1.0, now, ramp);
      }

      if (enableMetalMode) {
        if (this.activeDeHarsh) this.activeDeHarsh.gain.setTargetAtTime(-2.5, now, ramp);
        if (this.activeBassPunch) this.activeBassPunch.gain.setTargetAtTime(2.0, now, ramp);
        if (this.activeSmoothing) this.activeSmoothing.frequency.setTargetAtTime(12000, now, ramp);
      } else {
        if (this.activeDeHarsh) this.activeDeHarsh.gain.setTargetAtTime(0, now, ramp);
        if (this.activeBassPunch) this.activeBassPunch.gain.setTargetAtTime(0, now, ramp);
        if (this.activeSmoothing) this.activeSmoothing.frequency.setTargetAtTime(22050, now, ramp);
      }

      if (enableTreble && !enableMetalMode) {
        if (this.activeTreble) this.activeTreble.gain.setTargetAtTime(1.5, now, ramp);
      } else {
        if (this.activeTreble) this.activeTreble.gain.setTargetAtTime(0, now, ramp);
      }

      if (this.activeCompressor && this.activeCompressor.threshold) {
        this.activeCompressor.threshold.setTargetAtTime(enableLimiter ? -1.5 : 0, now, ramp);
      }

    } else {
      // Original: 1.0x flat, no filters, no gain reduction
      if (this.playbackSource && this.playbackSource.playbackRate) {
        this.playbackSource.playbackRate.setTargetAtTime(1.0, now, ramp);
      }

      if (this.activeGain && this.activeGain.gain) {
        this.activeGain.gain.setTargetAtTime(1.0, now, ramp);
      }

      if (this.activeDeHarsh) this.activeDeHarsh.gain.setTargetAtTime(0, now, ramp);
      if (this.activeBassPunch) this.activeBassPunch.gain.setTargetAtTime(0, now, ramp);
      if (this.activeSmoothing) this.activeSmoothing.frequency.setTargetAtTime(22050, now, ramp);
      if (this.activeTreble) this.activeTreble.gain.setTargetAtTime(0, now, ramp);
      if (this.activeCompressor && this.activeCompressor.threshold) {
        this.activeCompressor.threshold.setTargetAtTime(0, now, ramp);
      }
    }
  }

  updateLivePlaybackParams(options = {}) {
    if (!this.isPlaying || !this.playbackSource) return;
    this.applyLiveDSP(options);
  }

  stopPlayback() {
    if (this.playbackSource) {
      try {
        // Critical: Detach onended before calling stop so ended event is not fired for old nodes!
        this.playbackSource.onended = null;
        this.playbackSource.stop();
      } catch (e) {}
      this.playbackSource = null;
    }
    this.isPlaying = false;
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }
}

window.FHAudioEngine = new AudioEngine();
