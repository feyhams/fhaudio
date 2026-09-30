/**
 * FH Audio - Interactive Canvas Waveform & Precision Trimmer
 * Renders real audio buffer waveform in gold style with interactive cut handles.
 */

class WaveformTrimmer {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    if (!this.canvas) return;
    this.ctx = this.canvas.getContext('2d');

    // State
    this.audioBuffer = null;
    this.totalDuration = 0; // in seconds
    this.startTime = 0;     // cut start (s)
    this.endTime = 0;       // cut end (s)
    this.currentTime = 0;   // playhead position (s)
    this.isPlaying = false;

    // Interaction state
    this.dragTarget = null; // 'start' | 'end' | 'middle' | null
    this.dragStartX = 0;
    this.dragInitialStart = 0;
    this.dragInitialEnd = 0;

    // Cached waveform peaks
    this.peaks = [];
    this.sampleCount = 180;

    // Listeners callback
    this.onTrimChange = null;
    this.onSeek = null;

    this.initEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => {
      this.resizeCanvas();
      this.draw();
      this.renderRuler('waveformRuler');
    });

    if (window.ResizeObserver && this.container) {
      this.resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          const cr = entry.contentRect;
          if (cr && cr.width > 0 && cr.height > 0) {
            this.resizeCanvas();
            this.draw();
            this.renderRuler('waveformRuler');
          }
        }
      });
      this.resizeObserver.observe(this.container);
    }
  }

  resizeCanvas() {
    if (!this.canvas || !this.container) return false;
    const rect = this.container.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;

    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  loadAudioBuffer(audioBuffer) {
    this.audioBuffer = audioBuffer;
    this.totalDuration = audioBuffer.duration;
    this.startTime = 0;
    this.endTime = audioBuffer.duration;
    this.currentTime = 0;

    // Extract peaks with automatic normalization
    this.extractPeaks();
    this.resizeCanvas();
    this.renderRuler('waveformRuler');
    this.draw();
    this.triggerTrimChange();

    // Redraw on subsequent animation frames to guarantee layout reflow
    requestAnimationFrame(() => {
      this.resizeCanvas();
      this.draw();
      this.renderRuler('waveformRuler');
    });
    setTimeout(() => {
      this.resizeCanvas();
      this.draw();
      this.renderRuler('waveformRuler');
    }, 80);
    setTimeout(() => {
      this.resizeCanvas();
      this.draw();
      this.renderRuler('waveformRuler');
    }, 250);
  }

  renderRuler(rulerId = 'waveformRuler') {
    const el = document.getElementById(rulerId);
    if (!el || !this.totalDuration) return;

    el.innerHTML = '';
    const interval = this.totalDuration > 360 ? 60 : (this.totalDuration > 120 ? 30 : 15);
    const count = Math.floor(this.totalDuration / interval);

    for (let i = 0; i <= count; i++) {
      const sec = i * interval;
      const span = document.createElement('span');
      const m = Math.floor(sec / 60);
      const s = Math.floor(sec % 60);
      span.textContent = `${m}:${s < 10 ? '0' + s : s}`;
      el.appendChild(span);
    }
  }

  extractPeaks() {
    if (!this.audioBuffer) return;
    const channelData = this.audioBuffer.getChannelData(0);
    const step = Math.max(1, Math.floor(channelData.length / this.sampleCount));
    this.peaks = [];

    let overallMax = 0.001;
    for (let i = 0; i < this.sampleCount; i++) {
      const start = i * step;
      let max = 0;
      const subStep = Math.max(1, Math.floor(step / 20));
      for (let j = 0; j < step && (start + j) < channelData.length; j += subStep) {
        const val = Math.abs(channelData[start + j] || 0);
        if (val > max) max = val;
      }
      if (max > overallMax) overallMax = max;
      this.peaks.push(max);
    }

    // Normalize so waveform is visually punchy and never flat/invisible
    const normFactor = 1 / overallMax;
    for (let i = 0; i < this.peaks.length; i++) {
      this.peaks[i] = Math.min(1, this.peaks[i] * normFactor);
    }
  }

  timeToX(time) {
    if (!this.totalDuration) return 0;
    return (time / this.totalDuration) * this.width;
  }

  xToTime(x) {
    if (!this.width || !this.totalDuration) return 0;
    const pct = Math.max(0, Math.min(1, x / this.width));
    return pct * this.totalDuration;
  }

  formatTime(sec) {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const rem = (s % 60).toFixed(1);
    const remStr = rem < 10 ? '0' + rem : rem;
    return `${m}:${remStr}`;
  }

  setStartTime(time) {
    this.startTime = Math.max(0, Math.min(time, this.endTime - 0.5));
    this.draw();
    this.triggerTrimChange();
  }

  setEndTime(time) {
    this.endTime = Math.min(this.totalDuration, Math.max(time, this.startTime + 0.5));
    this.draw();
    this.triggerTrimChange();
  }

  setPlayheadTime(time) {
    this.currentTime = Math.max(0, Math.min(this.totalDuration, time));
    this.draw();
  }

  triggerTrimChange() {
    if (typeof this.onTrimChange === 'function') {
      this.onTrimChange({
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.endTime - this.startTime,
        formattedStart: this.formatTime(this.startTime),
        formattedEnd: this.formatTime(this.endTime),
        formattedDuration: this.formatTime(this.endTime - this.startTime)
      });
    }
  }

  draw() {
    if (!this.ctx) return;
    if (!this.width || !this.height || this.width <= 0 || this.height <= 0) {
      if (!this.resizeCanvas()) return;
    }
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Background gradient
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, '#0d131d');
    bgGrad.addColorStop(1, '#090d14');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    const startX = this.timeToX(this.startTime);
    const endX = this.timeToX(this.endTime);
    const playheadX = this.timeToX(this.currentTime);

    // Draw Dimmed Outside Left
    ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
    ctx.fillRect(0, 0, startX, h);

    // Draw Dimmed Outside Right
    ctx.fillRect(endX, 0, w - endX, h);

    // Draw Selected Area Background Highlight
    ctx.fillStyle = 'rgba(250, 204, 21, 0.05)';
    ctx.fillRect(startX, 0, endX - startX, h);

    // Draw Waveform Bars
    if (this.peaks.length > 0) {
      const barSpacing = w / this.peaks.length;
      const barWidth = Math.max(2, barSpacing - 1.5);
      const centerY = h / 2;

      for (let i = 0; i < this.peaks.length; i++) {
        const x = i * barSpacing;
        const peak = this.peaks[i] || 0.05;
        const barH = Math.max(4, peak * (h * 0.85));

        // Is bar inside selected region?
        const isSelected = x >= startX && x <= endX;

        if (isSelected) {
          ctx.fillStyle = '#facc15'; // Vibrant gold
        } else {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.2)'; // Dim gold
        }

        ctx.beginPath();
        if (ctx.roundRect) {
          ctx.roundRect(x, centerY - barH / 2, barWidth, barH, 2);
        } else {
          ctx.rect(x, centerY - barH / 2, barWidth, barH);
        }
        ctx.fill();
      }
    } else {
      // Empty waveform placeholder line
      ctx.strokeStyle = '#212e42';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    }

    // Draw Cut Selection Border Box
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, 0, endX - startX, h);

    // Draw START Handle (Yellow vertical line + top timestamp badge)
    this.drawHandle(startX, '#facc15', 'start', this.startTime);

    // Draw END Handle
    this.drawHandle(endX, '#facc15', 'end', this.endTime);

    // Draw Playhead
    if (this.totalDuration > 0) {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(playheadX, 0);
      ctx.lineTo(playheadX, h);
      ctx.stroke();

      // Playhead top triangle indicator
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(playheadX - 5, 0);
      ctx.lineTo(playheadX + 5, 0);
      ctx.lineTo(playheadX, 8);
      ctx.closePath();
      ctx.fill();
    }
  }

  drawHandle(x, color, type, timeSec = 0) {
    const ctx = this.ctx;
    const h = this.height;

    // Line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();

    // Top timestamp badge (matching reference screenshot)
    const timeText = this.formatTime(timeSec);
    ctx.font = 'bold 11px monospace';
    const textMetrics = ctx.measureText(timeText);
    const badgeW = Math.max(46, textMetrics.width + 10);
    const badgeH = 17;
    const badgeY = 0;

    let badgeX;
    if (type === 'start') {
      badgeX = Math.max(0, x);
    } else {
      badgeX = Math.min(this.width - badgeW, x - badgeW);
    }

    ctx.fillStyle = color;
    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 2);
      ctx.fill();
    } else {
      ctx.fillRect(badgeX, badgeY, badgeW, badgeH);
    }

    // Badge text in dark obsidian
    ctx.fillStyle = '#0b0f17';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(timeText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

    // Handle grip box in center of vertical line
    ctx.fillStyle = color;
    const gripW = 12;
    const gripH = 26;
    const gripY = (h - gripH) / 2;
    const gripX = x - (gripW / 2);

    if (ctx.roundRect) {
      ctx.beginPath();
      ctx.roundRect(gripX, gripY, gripW, gripH, 3);
      ctx.fill();
    } else {
      ctx.fillRect(gripX, gripY, gripW, gripH);
    }

    // Grip notches
    ctx.fillStyle = '#0b0f17';
    ctx.fillRect(gripX + 3, gripY + 7, gripW - 6, 2);
    ctx.fillRect(gripX + 3, gripY + 12, gripW - 6, 2);
    ctx.fillRect(gripX + 3, gripY + 17, gripW - 6, 2);
  }

  initEvents() {
    if (!this.canvas) return;

    const handlePointerDown = (e) => {
      if (!this.audioBuffer) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const startX = this.timeToX(this.startTime);
      const endX = this.timeToX(this.endTime);

      const hitDist = 15;

      if (Math.abs(x - startX) <= hitDist) {
        this.dragTarget = 'start';
      } else if (Math.abs(x - endX) <= hitDist) {
        this.dragTarget = 'end';
      } else if (x > startX && x < endX) {
        this.dragTarget = 'middle';
        this.dragStartX = x;
        this.dragInitialStart = this.startTime;
        this.dragInitialEnd = this.endTime;
      } else {
        // Seek playhead directly
        const clickedTime = this.xToTime(x);
        this.currentTime = clickedTime;
        if (typeof this.onSeek === 'function') {
          this.onSeek(clickedTime);
        }
        this.draw();
        return;
      }

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp);
    };

    const handlePointerMove = (e) => {
      if (!this.dragTarget) return;
      const rect = this.canvas.getBoundingClientRect();
      const x = Math.max(0, Math.min(this.width, e.clientX - rect.left));
      const targetTime = this.xToTime(x);

      if (this.dragTarget === 'start') {
        this.startTime = Math.max(0, Math.min(targetTime, this.endTime - 0.5));
      } else if (this.dragTarget === 'end') {
        this.endTime = Math.min(this.totalDuration, Math.max(targetTime, this.startTime + 0.5));
      } else if (this.dragTarget === 'middle') {
        const deltaX = x - this.dragStartX;
        const deltaTime = (deltaX / this.width) * this.totalDuration;
        const dur = this.dragInitialEnd - this.dragInitialStart;

        let newStart = this.dragInitialStart + deltaTime;
        let newEnd = this.dragInitialEnd + deltaTime;

        if (newStart < 0) {
          newStart = 0;
          newEnd = dur;
        } else if (newEnd > this.totalDuration) {
          newEnd = this.totalDuration;
          newStart = this.totalDuration - dur;
        }

        this.startTime = newStart;
        this.endTime = newEnd;
      }

      this.draw();
      this.triggerTrimChange();
    };

    const handlePointerUp = () => {
      this.dragTarget = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    this.canvas.addEventListener('pointerdown', handlePointerDown);
  }
}

window.WaveformTrimmer = WaveformTrimmer;
