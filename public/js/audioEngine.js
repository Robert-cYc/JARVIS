/**
 * Stark Industries J.A.R.V.I.S. Vocal Modulation & Web Audio Sci-Fi DSP Engine
 */
export class JarvisAudioEngine {
  constructor() {
    this.synth = window.speechSynthesis || null;
    this.audioCtx = null;
    this.voices = [];
    this.selectedVoiceURI = '';
    this.pitch = 0.92;
    this.rate = 1.04;
    this.voiceEnabled = true;
    this.sfxEnabled = true;
    this.sciFiResonanceEnabled = true;
    this.isSpeaking = false;
    this.speechEnergy = 0;
    this.resonanceNodes = null;
    this.onSpeakingStateChange = null;

    if (this.synth) {
      this._loadVoices();
      if (typeof this.synth.onvoiceschanged !== 'undefined') {
        this.synth.onvoiceschanged = () => this._loadVoices();
      }
    }
  }

  _ensureAudioContext() {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  _loadVoices() {
    if (!this.synth) return [];
    const available = this.synth.getVoices() || [];
    if (available.length > 0) {
      this.voices = available;
    }
    return this.voices;
  }

  getAvailableVoices() {
    return this._loadVoices();
  }

  /**
   * Selects the best matching voice for JARVIS (prioritizing British English Male or Traditional Chinese).
   * @param {string} text
   * @returns {SpeechSynthesisVoice | null}
   */
  resolveBestVoice(text) {
    const voices = this._loadVoices();
    if (!voices.length) return null;

    if (this.selectedVoiceURI) {
      const manual = voices.find((v) => v.voiceURI === this.selectedVoiceURI);
      if (manual) return manual;
    }

    const hasChinese = /[\u4e00-\u9fff]/.test(text);

    if (hasChinese) {
      const zhPreferred = [
        (v) => v.lang === 'zh-TW' && /yun-?jhe|male|hsiao|google/i.test(v.name),
        (v) => v.lang === 'zh-TW',
        (v) => v.lang === 'zh-HK',
        (v) => v.lang.startsWith('zh')
      ];
      for (const matcher of zhPreferred) {
        const match = voices.find(matcher);
        if (match) return match;
      }
    }

    const enGbPreferred = [
      (v) => /Google UK English Male/i.test(v.name),
      (v) => /Microsoft (George|Ryan|Oliver)/i.test(v.name),
      (v) => /Daniel|Arthur|Oliver/i.test(v.name) && v.lang.startsWith('en'),
      (v) => v.lang === 'en-GB' && /male/i.test(v.name),
      (v) => v.lang === 'en-GB',
      (v) => v.lang.startsWith('en')
    ];

    for (const matcher of enGbPreferred) {
      const match = voices.find(matcher);
      if (match) return match;
    }

    return voices[0];
  }

  /**
   * Synthesizes a futuristic HUD click sound.
   */
  playHudClick(freq = 1850) {
    if (!this.sfxEnabled) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, now + 0.045);

    gain.gain.setValueAtTime(0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.055);
  }

  /**
   * Synthesizes the Stark HUD boot-up harmonic sequence.
   */
  playBootSequence() {
    if (!this.sfxEnabled) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [220, 330, 440, 660, 880];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'sine' : 'triangle';
      osc.frequency.setValueAtTime(freq * 0.5, now + idx * 0.06);
      osc.frequency.exponentialRampToValueAtTime(freq, now + idx * 0.06 + 0.18);

      gain.gain.setValueAtTime(0.001, now + idx * 0.06);
      gain.gain.linearRampToValueAtTime(0.045, now + idx * 0.06 + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0008, now + idx * 0.06 + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.48);
    });
  }

  /**
   * Plays a subtle telemetry computation chirp when transmitting to LLM.
   */
  playTelemetryChirp() {
    if (!this.sfxEnabled) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [1320, 1760, 2093].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.045);

      gain.gain.setValueAtTime(0.035, now + idx * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.045 + 0.04);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.045);
      osc.stop(now + idx * 0.045 + 0.045);
    });
  }

  /**
   * Starts/stops a subtle sci-fi helmet-comm carrier modulation hum while JARVIS speaks.
   */
  _setVocalResonanceCarrier(active) {
    if (!this.sciFiResonanceEnabled || !this.sfxEnabled) return;
    const ctx = this._ensureAudioContext();
    if (!ctx) return;

    if (active && !this.resonanceNodes) {
      const now = ctx.currentTime;
      const carrier = ctx.createOscillator();
      const sub = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      carrier.type = 'sawtooth';
      carrier.frequency.setValueAtTime(118, now);

      sub.type = 'sine';
      sub.frequency.setValueAtTime(59, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(920, now);
      filter.Q.setValueAtTime(6.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.012, now + 0.08);

      carrier.connect(filter);
      sub.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      carrier.start(now);
      sub.start(now);

      this.resonanceNodes = { carrier, sub, gain };
    } else if (!active && this.resonanceNodes) {
      try {
        const now = ctx.currentTime;
        const { carrier, sub, gain } = this.resonanceNodes;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
        carrier.stop(now + 0.09);
        sub.stop(now + 0.09);
      } catch {
        // Ignore already stopped oscillator
      }
      this.resonanceNodes = null;
    }
  }

  /**
   * Pulse the sci-fi vocal carrier on word boundaries for authentic JARVIS modulation.
   */
  _pulseWordModulation() {
    this.speechEnergy = 0.75 + Math.random() * 0.25;
    if (!this.sciFiResonanceEnabled || !this.sfxEnabled || !this.audioCtx) return;

    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const filter = this.audioCtx.createBiquadFilter();
      const gain = this.audioCtx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(195 + Math.random() * 65, now);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1450, now);
      filter.Q.setValueAtTime(8, now);

      gain.gain.setValueAtTime(0.012, now);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + 0.045);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audioCtx.destination);

      osc.start(now);
      osc.stop(now + 0.05);
    } catch {
      // Ignore audio context edge cases
    }
  }

  stopSpeaking() {
    if (this.synth) {
      this.synth.cancel();
    }
    this.isSpeaking = false;
    this.speechEnergy = 0;
    this._setVocalResonanceCarrier(false);
    if (this.onSpeakingStateChange) {
      this.onSpeakingStateChange(false);
    }
  }

  /**
   * Speaks the text with JARVIS's cadence and sci-fi HUD acoustic filter.
   * @param {string} rawText
   */
  speak(rawText) {
    if (!this.voiceEnabled || !this.synth || !rawText) return;

    this.stopSpeaking();

    const segments = rawText
      .split(/(?<=[.!?。！？\n])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (segments.length === 0) return;

    const voice = this.resolveBestVoice(rawText);
    this.isSpeaking = true;
    this._setVocalResonanceCarrier(true);
    if (this.onSpeakingStateChange) {
      this.onSpeakingStateChange(true);
    }

    segments.forEach((segment, index) => {
      const utterance = new SpeechSynthesisUtterance(segment);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
      utterance.pitch = this.pitch;
      utterance.rate = this.rate;
      utterance.volume = 1.0;

      utterance.onboundary = () => {
        this._pulseWordModulation();
      };

      utterance.onstart = () => {
        this.isSpeaking = true;
        this.speechEnergy = 0.65;
      };

      utterance.onend = () => {
        if (index === segments.length - 1) {
          this.isSpeaking = false;
          this.speechEnergy = 0;
          this._setVocalResonanceCarrier(false);
          if (this.onSpeakingStateChange) {
            this.onSpeakingStateChange(false);
          }
        }
      };

      utterance.onerror = () => {
        this.isSpeaking = false;
        this.speechEnergy = 0;
        this._setVocalResonanceCarrier(false);
        if (this.onSpeakingStateChange) {
          this.onSpeakingStateChange(false);
        }
      };

      this.synth.speak(utterance);
    });
  }

  /**
   * Queues a single sentence chunk during live SSE streaming without cancelling active speech.
   * @param {string} segmentText
   */
  enqueueSpeechSegment(segmentText) {
    if (!this.voiceEnabled || !this.synth || !segmentText) return;
    const clean = segmentText
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*#`_~]/g, '')
      .trim();
    if (!clean) return;

    const voice = this.resolveBestVoice(clean);
    const utterance = new SpeechSynthesisUtterance(clean);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.pitch = this.pitch;
    utterance.rate = this.rate;
    utterance.volume = 1.0;

    utterance.onboundary = () => {
      this._pulseWordModulation();
    };

    utterance.onstart = () => {
      this.isSpeaking = true;
      this.speechEnergy = 0.65;
      this._setVocalResonanceCarrier(true);
      if (this.onSpeakingStateChange) {
        this.onSpeakingStateChange(true);
      }
    };

    utterance.onend = () => {
      if (!this.synth.speaking && !this.synth.pending) {
        this.isSpeaking = false;
        this.speechEnergy = 0;
        this._setVocalResonanceCarrier(false);
        if (this.onSpeakingStateChange) {
          this.onSpeakingStateChange(false);
        }
      }
    };

    utterance.onerror = () => {
      if (!this.synth.speaking && !this.synth.pending) {
        this.isSpeaking = false;
        this.speechEnergy = 0;
        this._setVocalResonanceCarrier(false);
        if (this.onSpeakingStateChange) {
          this.onSpeakingStateChange(false);
        }
      }
    };

    this.synth.speak(utterance);
  }

  /**
   * Returns current normalized vocal energy (0.0 to 1.0) for the Arc Reactor visualizer.
   */
  sampleEnergy() {
    if (!this.isSpeaking) {
      this.speechEnergy *= 0.85;
      return this.speechEnergy < 0.01 ? 0 : this.speechEnergy;
    }
    // Smooth oscillation while speaking even if browser doesn't fire word boundary events
    const syntheticWave = 0.45 + 0.35 * Math.abs(Math.sin(performance.now() * 0.012));
    this.speechEnergy = Math.max(this.speechEnergy * 0.92, syntheticWave);
    return this.speechEnergy;
  }
}
