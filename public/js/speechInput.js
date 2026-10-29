/**
 * Speech-to-Text (STT) Voice Command Receiver for J.A.R.V.I.S.
 */
export class JarvisSpeechInput {
  /**
   * @param {object} callbacks
   * @param {(transcript: string, isFinal: boolean) => void} callbacks.onResult
   * @param {(listening: boolean) => void} callbacks.onStateChange
   * @param {(errorMsg: string) => void} callbacks.onError
   */
  constructor({ onResult, onStateChange, onError }) {
    this.onResult = onResult;
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.isListening = false;
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
        if (this.onResult) {
          this.onResult(transcript.trim(), isFinal);
        }
      };

      this.recognition.onerror = (event) => {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange(false);
        if (this.onError && event.error !== 'aborted') {
          this.onError(`Vocal input sensor alert: ${event.error}`);
        }
      };

      this.recognition.onend = () => {
        this.isListening = false;
        if (this.onStateChange) this.onStateChange(false);
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

  toggle() {
    if (!this.recognition) {
      if (this.onError) {
        this.onError('Speech recognition is not supported in this browser, Sir.');
      }
      return;
    }

    if (this.isListening) {
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
