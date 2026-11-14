(function (global) {
  'use strict';

  class RelativisticAudioEngine {
    constructor() {
      this.ctx = null;
      this.enabled = false;
      this.masterGain = null;
      this.droneOsc1 = null;
      this.droneOsc2 = null;
      this.noiseFilter = null;
      this.droneGain = null;
      this.lastTickTau = 0;
      this.lastTickBodyId = null;
    }

    _ensureInit() {
      if (this.ctx) return;
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0;
      master.connect(ctx.destination);
      this.masterGain = master;

      // Sub-harmonic accretion drone
      const droneGain = ctx.createGain();
      droneGain.gain.value = 0.22;
      droneGain.connect(master);
      this.droneGain = droneGain;

      const osc1 = ctx.createOscillator();
      osc1.type = 'sine';
      osc1.frequency.value = 52;
      const g1 = ctx.createGain();
      g1.gain.value = 0.45;
      osc1.connect(g1);
      g1.connect(droneGain);
      osc1.start();
      this.droneOsc1 = osc1;

      const osc2 = ctx.createOscillator();
      osc2.type = 'triangle';
      osc2.frequency.value = 78;
      const filter2 = ctx.createBiquadFilter();
      filter2.type = 'lowpass';
      filter2.frequency.value = 180;
      const g2 = ctx.createGain();
      g2.gain.value = 0.22;
      osc2.connect(filter2);
      filter2.connect(g2);
      g2.connect(droneGain);
      osc2.start();
      this.droneOsc2 = osc2;

      // Pink-filtered plasma wind buffer
      const bufLen = ctx.sampleRate * 3;
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      let b0 = 0, b1 = 0, b2 = 0;
      for (let i = 0; i < bufLen; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.99765 * b0 + white * 0.099046;
        b1 = 0.96300 * b1 + white * 0.2965164;
        b2 = 0.57000 * b2 + white * 1.0526913;
        data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.11;
      }

      const noiseSrc = ctx.createBufferSource();
      noiseSrc.buffer = noiseBuf;
      noiseSrc.loop = true;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 190;
      noiseFilter.Q.value = 1.6;
      this.noiseFilter = noiseFilter;

      const noiseGain = ctx.createGain();
      noiseGain.gain.value = 0.35;

      noiseSrc.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(droneGain);
      noiseSrc.start();
    }

    async toggle() {
      this._ensureInit();
      if (!this.ctx) return false;
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
      }
      this.enabled = !this.enabled;
      const now = this.ctx.currentTime;
      this.masterGain.gain.cancelScheduledValues(now);
      this.masterGain.gain.setTargetAtTime(this.enabled ? 0.42 : 0.0, now, 0.18);
      return this.enabled;
    }

    update(sim, camRadius) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;

      const prox = Math.max(0.1, Math.min(1.0, 14.0 / Math.max(4.5, camRadius)));
      const baseFreq = 46 + sim.spin * 16 + prox * 10;
      this.droneOsc1.frequency.setTargetAtTime(baseFreq, now, 0.12);
      this.droneOsc2.frequency.setTargetAtTime(baseFreq * 1.498, now, 0.12);
      this.noiseFilter.frequency.setTargetAtTime(110 + sim.diskDensity * 140 * prox + sim.jetPower * 90, now, 0.15);

      // Relativistic proper-time clock ping on selected body
      const sel = sim.getSelectedBody();
      if (sel && !sim.paused) {
        // New selection or preset reload: restart the tick clock from this body's tau
        if (sel.id !== this.lastTickBodyId || sel.tau < this.lastTickTau) {
          this.lastTickBodyId = sel.id;
          this.lastTickTau = sel.tau;
        }
        if (sel.tau - this.lastTickTau >= 1.15) {
          this.lastTickTau = sel.tau;
          this._playTimeTick(sel.lastGammaInv);
        }
      }
    }

    _playTimeTick(gammaInv) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const freq = 320 + gammaInv * 460;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.85, now + 0.09);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.055, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.12);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.14);
    }

    playLaunchChime(status) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startFreq = status === 'plunge' ? 240 : status === 'tidal' ? 380 : 520;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(startFreq * 1.4, now + 0.14);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.11, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 0.22);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.25);
    }

    playMergerChirp(isBinary) {
      if (!this.enabled || !this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      // Exponential upward chirp followed by horizon ringdown drop
      osc.frequency.setValueAtTime(48, now);
      osc.frequency.exponentialRampToValueAtTime(isBinary ? 290 : 185, now + 0.34);
      osc.frequency.exponentialRampToValueAtTime(54, now + 1.25);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(isBinary ? 0.32 : 0.18, now + 0.30);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + 1.35);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 1.40);
    }
  }

  global.HorizonAudio = {
    RelativisticAudioEngine,
  };
})(window);
