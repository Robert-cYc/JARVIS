/**
 * Speech-to-Text (STT) & Hands-Free Wake-Word Receiver for J.A.R.V.I.S.
 * Includes TTS Echo Suppression, Watchdog Session Refresh, Homophone Matching, and Multi-Turn Follow-up Window.
 */

const WAKE_WORD_REGEX =
  /(?:hey\s+|hi\s+|ok\s+|哈囉\s*|嘿\s*|喂\s*)?(?:jarvis|j\.a\.r\.v\.i\.s\.|javis|jarv|garvis|travis|chavez|賈維斯|亞維斯|加維斯|佳維斯|查維斯|家維斯|傑維斯|賈維|家維)[，,。！？!?\s:]*(.*)/i;

const FOLLOWUP_WINDOW_MS = 15000;
const WATCHDOG_INTERVAL_MS = 25000;

export class JarvisSpeechInput {
  /**
   * @param {object} callbacks
   * @param {(transcript: string, isFinal: boolean) => void} callbacks.onResult
   * @param {(listening: boolean, statusLabel?: string) => void} callbacks.onStateChange
   * @param {(errorMsg: string) => void} callbacks.onError
   * @param {(commandText: string) => void} [callbacks.onWakeWord]
   */
  constructor({ onResult, onStateChange, onError, onWakeWord }) {
    this.onResult = onResult;
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.onWakeWord = onWakeWord;

    this.isListening = false;
    this.wakeWordMode = false;
    this.pausedForTts = false;
    this.awaitingWakeFollowup = false;
    this.followupTimer = null;
    this.restartTimer = null;
    this.watchdogTimer = null;
    this.lastActivityAt = Date.now();
    this.recognition = null;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      // Use single-utterance cycle with instant auto-restart to prevent Chrome continuous-stream hangs
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.maxAlternatives = 3;
      this.recognition.lang = 'zh-TW';

      this.recognition.onstart = () => {
        this.isListening = true;
        this.lastActivityAt = Date.now();
        if (this.onStateChange) {
          this.onStateChange(true, this._getModeLabel());
        }
      };

      this.recognition.onresult = (event) => {
        this.lastActivityAt = Date.now();
        if (this.pausedForTts) return;

        let primaryTranscript = '';
        const allAlternatives = [];
        let isFinal = false;

        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const res = event.results[i];
          primaryTranscript += res[0].transcript;
          for (let a = 0; a < res.length; a += 1) {
            allAlternatives.push(res[a].transcript);
          }
          if (res.isFinal) {
            isFinal = true;
          }
        }

        const clean = primaryTranscript.trim();
        if (!clean) return;

        if (this.wakeWordMode) {
          // Check primary transcript and alternatives for wake word or homophones
          let wakeMatch = clean.match(WAKE_WORD_REGEX);
          if (!wakeMatch) {
            for (const alt of allAlternatives) {
              const m = alt.trim().match(WAKE_WORD_REGEX);
              if (m) {
                wakeMatch = m;
                break;
              }
            }
          }

          if (wakeMatch) {
            const remainder = (wakeMatch[1] || '').trim();
            if (!isFinal) {
              // Show live interim feedback in input box
              if (this.onResult) {
                this.onResult(remainder || 'JARVIS...', false);
              }
              return;
            }

            if (remainder.length > 1) {
              this._clearFollowupWindow();
              if (this.onWakeWord) this.onWakeWord(remainder);
            } else {
              this.openFollowupWindow();
              if (this.onWakeWord) this.onWakeWord('');
            }
            return;
          }

          // If within the 15s active follow-up window (after saying "JARVIS" or after JARVIS finishes answering)
          if (this.awaitingWakeFollowup) {
            this._refreshFollowupTimer();
            if (this.onResult) {
              this.onResult(clean, isFinal);
            }
            if (isFinal) {
              this._clearFollowupWindow();
            }
          }
          return;
        }

        if (this.onResult) {
          this.onResult(clean, isFinal);
        }
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        if (
          this.onError &&
          event.error !== 'aborted' &&
          event.error !== 'no-speech'
        ) {
          this.onError(`Vocal input sensor alert: ${event.error}`);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.wakeWordMode && !this.pausedForTts) {
          this._scheduleRestart(120);
        } else if (this.onStateChange) {
          this.onStateChange(false, this._getModeLabel());
        }
      };
    }
  }

  _getModeLabel() {
    if (this.pausedForTts) return 'MUTED FOR TTS';
    if (this.awaitingWakeFollowup) return 'ACTIVE FOLLOW-UP (15S)';
    if (this.wakeWordMode) return 'WAKE WORD STANDBY';
    return 'MANUAL MIC';
  }

  _scheduleRestart(delayMs = 150) {
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
    }
    this.restartTimer = setTimeout(() => {
      if (this.wakeWordMode && !this.pausedForTts && !this.isListening) {
        try {
          this.recognition.start();
        } catch {
          // Ignore if already starting
        }
      }
    }, delayMs);
  }

  _startWatchdog() {
    this._stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      if (!this.wakeWordMode || this.pausedForTts) return;
      const idleMs = Date.now() - this.lastActivityAt;
      if (!this.isListening || idleMs > WATCHDOG_INTERVAL_MS) {
        this.lastActivityAt = Date.now();
        try {
          this.recognition.abort();
        } catch {
          // Ignore abort errors
        }
        this._scheduleRestart(180);
      }
    }, 10000);
  }

  _stopWatchdog() {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
    }
  }

  /**
   * Opens a 15-second active conversation window where the user can speak without repeating "JARVIS".
   */
  openFollowupWindow() {
    this.awaitingWakeFollowup = true;
    this._refreshFollowupTimer();
    if (this.onStateChange) {
      this.onStateChange(this.isListening, this._getModeLabel());
    }
  }

  _refreshFollowupTimer() {
    if (this.followupTimer) {
      clearTimeout(this.followupTimer);
    }
    this.followupTimer = setTimeout(() => {
      this.awaitingWakeFollowup = false;
      if (this.onStateChange) {
        this.onStateChange(this.isListening, this._getModeLabel());
      }
    }, FOLLOWUP_WINDOW_MS);
  }

  _clearFollowupWindow() {
    this.awaitingWakeFollowup = false;
    if (this.followupTimer) {
      clearTimeout(this.followupTimer);
      this.followupTimer = null;
    }
  }

  /**
   * Temporarily pauses microphone recognition while J.A.R.V.I.S. is speaking to prevent self-triggering echo.
   */
  pauseForTts() {
    if (!this.recognition || !this.wakeWordMode) return;
    this.pausedForTts = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    if (this.isListening) {
      try {
        this.recognition.abort();
      } catch {
        // Ignore abort errors
      }
    }
  }

  /**
   * Resumes microphone recognition immediately after J.A.R.V.I.S. finishes speaking
   * and opens a 15-second follow-up window for natural multi-turn conversation.
   */
  resumeAfterTts() {
    if (!this.recognition || !this.wakeWordMode) return;
    this.pausedForTts = false;
    this.openFollowupWindow();
    this._scheduleRestart(220);
  }

  isSupported() {
    return Boolean(this.recognition);
  }

  setLanguage(langMode) {
    if (!this.recognition) return;
    if (langMode === 'en-GB') {
      this.recognition.lang = 'en-GB';
    } else {
      this.recognition.lang = 'zh-TW';
    }
  }

  setWakeWordMode(enabled) {
    if (!this.recognition) {
      if (this.onError) {
        this.onError('Speech recognition is not supported in this browser, Sir.');
      }
      return false;
    }

    this.wakeWordMode = Boolean(enabled);
    this.pausedForTts = false;
    this._clearFollowupWindow();

    if (this.wakeWordMode) {
      this._startWatchdog();
      if (!this.isListening) {
        try {
          this.recognition.start();
        } catch {
          // Ignore start race
        }
      }
    } else {
      this._stopWatchdog();
      if (this.restartTimer) {
        clearTimeout(this.restartTimer);
        this.restartTimer = null;
      }
      if (this.isListening) {
        try {
          this.recognition.stop();
        } catch {
          // Ignore stop race
        }
      }
    }

    return this.wakeWordMode;
  }

  toggle() {
    if (!this.recognition) {
      if (this.onError) {
        this.onError('Speech recognition is not supported in this browser, Sir.');
      }
      return;
    }

    if (this.isListening || this.wakeWordMode) {
      this.setWakeWordMode(false);
    } else {
      try {
        this.recognition.start();
      } catch {
        // Ignore rapid re-trigger errors
      }
    }
  }
}
