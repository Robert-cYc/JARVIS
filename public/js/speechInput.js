/**
 * Speech-to-Text (STT) & Hands-Free Wake-Word Receiver for J.A.R.V.I.S.
 */
export class JarvisSpeechInput {
  /**
   * @param {object} callbacks
   * @param {(transcript: string, isFinal: boolean) => void} callbacks.onResult
   * @param {(listening: boolean) => void} callbacks.onStateChange
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
    this.awaitingWakeFollowup = false;
    this.recognition = null;

    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = true;
      this.recognition.lang = 'zh-TW';

      this.recognition.onstart = () => {
        this.isListening = true;
        if (this.onStateChange) this.onStateChange(true);
      };

      this.recognition.onresult = (event) => {
        let transcript = '';
        let isFinal = false;
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            isFinal = true;
          }
        }

        const clean = transcript.trim();
        if (!clean) return;

        if (this.wakeWordMode) {
          const wakeRegex = /(?:hey\s+|hi\s+|哈囉\s*|嘿\s*)?(?:jarvis|j\.a\.r\.v\.i\.s\.|賈維斯|亞維斯)[，,:\s]*(.*)/i;
          const match = clean.match(wakeRegex);

          if (match) {
            const remainder = (match[1] || '').trim();
            if (isFinal) {
              if (remainder.length > 1) {
                this.awaitingWakeFollowup = false;
                if (this.onWakeWord) this.onWakeWord(remainder);
              } else {
                this.awaitingWakeFollowup = true;
                if (this.onWakeWord) this.onWakeWord('');
              }
            }
            return;
          }

          if (this.awaitingWakeFollowup) {
            if (this.onResult) this.onResult(clean, isFinal);
            if (isFinal) {
              this.awaitingWakeFollowup = false;
            }
            return;
          }
          return;
        }

        if (this.onResult) {
          this.onResult(clean, isFinal);
        }
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange(false);
        if (this.onError && event.error !== 'aborted' && event.error !== 'no-speech') {
          this.onError(`Vocal input sensor alert: ${event.error}`);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange(false);
        // Auto-restart if hands-free wake-word mode is active
        if (this.wakeWordMode) {
          setTimeout(() => {
            if (this.wakeWordMode && !this.isListening) {
              try {
                this.recognition.start();
              } catch {
                // Ignore if already started
              }
            }
          }, 350);
        }
      };
    }
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
    this.awaitingWakeFollowup = false;
    this.recognition.continuous = this.wakeWordMode;

    if (this.wakeWordMode) {
      if (!this.isListening) {
        try {
          this.recognition.start();
        } catch {
          // Ignore start race
        }
      }
    } else if (this.isListening) {
      this.recognition.stop();
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

    if (this.isListening) {
      this.wakeWordMode = false;
      this.recognition.stop();
    } else {
      try {
        this.recognition.start();
      } catch {
        // Ignore rapid re-trigger errors
      }
    }
  }
}
