import { JarvisAudioEngine } from './audioEngine.js';
import { ArcReactorVisualizer, HoloBackgroundVisualizer } from './hudVisualizer.js';
import { JarvisSpeechInput } from './speechInput.js';

const STORAGE_KEY = 'stark_jarvis_hud_config_v2';
const CHAT_HISTORY_STORAGE_KEY = 'stark_jarvis_chat_history_v1';

class JarvisHudController {
  constructor() {
    this.audio = new JarvisAudioEngine();
    this.conversationHistory = [];
    this.persistedLogCards = [];
    this.webSearchEnabled = true;
    this.forceWebSearch = false;
    this.pendingAttachment = null;
    this.pendingImageDataUrl = '';
    this.timerInterval = null;
    this.timerRemainingSeconds = 0;
    this.hourlyChimeEnabled = true;
    this.lastChimedHourKey = '';
    this.focusLayout = false;
    this.lastVaultState = { tasks: [], memories: [], watchlist: [] };
    this.priceAlerts = [];
    this.modelCatalog = {
      ollama: { online: false, models: [] },
      cloudCatalog: {
        gemini: ['gemini-2.5-flash', 'gemini-2.5-pro'],
        openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
        anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
        custom: ['deepseek-chat', 'llama-3.3-70b-versatile']
      }
    };

    this._cacheDom();
    this._initVisualizer();
    this._initSpeechInput();
    this._loadSavedSettings();
    if (this.dom.activeProtocolText && this.dom.personaSelect) {
      this.dom.activeProtocolText.textContent = this.dom.personaSelect.value.toUpperCase();
    }
    if (this.speechInput && this.dom.languageSelect) {
      this.speechInput.setLanguage(this.dom.languageSelect.value);
    }
    this._bindEvents();
    this._startClock();
    this._populateVoices();

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this._populateVoices();
      });
    }

    this.refreshModelsAndTelemetry();
    this.refreshVault();
    setInterval(() => this.refreshTelemetryOnly(), 2000);
    setInterval(() => this.pollSentinelAlerts(), 30000);

    // Restore Persistent Chat History or Display Initial Boot Greeting
    if (!this._loadSavedChatHistory()) {
      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S.',
        content:
          'Good day, Sir. J.A.R.V.I.S. Mark LXXXV Holographic Interface is online. All vocal modulation arrays and neural links are standing by.\n\n' +
          '先生，歡迎回到史塔克主控台。您可以隨時切換左側的本地端 Ollama 或雲端 LLM 核心，並直接以文字或語音向我提問。點擊右上角「ENGAGE HUD AUDIO」即可啟動完整裝甲音效與語音問候。',
        speechText:
          'Good day, Sir. J.A.R.V.I.S. Mark 85 Holographic Interface is online. 先生，歡迎回到史塔克主控台，隨時為您效勞。',
        badge: 'SYSTEM BOOT // READY'
      });
    }
  }

  _cacheDom() {
    this.dom = {
      ollamaStatusDot: document.getElementById('ollamaStatusDot'),
      activeProviderLabel: document.getElementById('activeProviderLabel'),
      netStatusPill: document.getElementById('netStatusPill'),
      netStatusDot: document.getElementById('netStatusDot'),
      netStatusHeader: document.getElementById('netStatusHeader'),
      arcOutputHeader: document.getElementById('arcOutputHeader'),
      hudClockPill: document.getElementById('hudClockPill'),
      hudClock: document.getElementById('hudClock'),
      bootAudioBtn: document.getElementById('bootAudioBtn'),
      suitThemeSelect: document.getElementById('suitThemeSelect'),
      wakeWordBtn: document.getElementById('wakeWordBtn'),
      exportReportBtn: document.getElementById('exportReportBtn'),
      networkIpText: document.getElementById('networkIpText'),
      uptimeText: document.getElementById('uptimeText'),

      ollamaConnBadge: document.getElementById('ollamaConnBadge'),
      providerSelect: document.getElementById('providerSelect'),
      modelSelect: document.getElementById('modelSelect'),
      refreshModelsBtn: document.getElementById('refreshModelsBtn'),
      customModelInput: document.getElementById('customModelInput'),
      endpointConfigGroup: document.getElementById('endpointConfigGroup'),
      baseUrlLabel: document.getElementById('baseUrlLabel'),
      baseUrlInput: document.getElementById('baseUrlInput'),
      apiKeyGroup: document.getElementById('apiKeyGroup'),
      apiKeyInput: document.getElementById('apiKeyInput'),

      ollamaPullSection: document.getElementById('ollamaPullSection'),
      pullModelSelect: document.getElementById('pullModelSelect'),
      pullModelBtn: document.getElementById('pullModelBtn'),
      pullProgressBox: document.getElementById('pullProgressBox'),
      pullStatusText: document.getElementById('pullStatusText'),
      pullPercentText: document.getElementById('pullPercentText'),
      pullProgressBar: document.getElementById('pullProgressBar'),

      hostPlatformBadge: document.getElementById('hostPlatformBadge'),
      cpuLoadText: document.getElementById('cpuLoadText'),
      cpuLoadBar: document.getElementById('cpuLoadBar'),
      cpuMetricRow: document.getElementById('cpuMetricRow'),
      gpuNeuralRow: document.getElementById('gpuNeuralRow'),
      gpuLoadText: document.getElementById('gpuLoadText'),
      gpuLoadBar: document.getElementById('gpuLoadBar'),
      gpuMetricRow: document.getElementById('gpuMetricRow'),
      gpuMemLoadText: document.getElementById('gpuMemLoadText'),
      gpuMemLoadBar: document.getElementById('gpuMemLoadBar'),
      memMetricRow: document.getElementById('memMetricRow'),
      memLoadText: document.getElementById('memLoadText'),
      memLoadBar: document.getElementById('memLoadBar'),
      diskMetricRow: document.getElementById('diskMetricRow'),
      diskLoadText: document.getElementById('diskLoadText'),
      diskLoadBar: document.getElementById('diskLoadBar'),
      cpuModelText: document.getElementById('cpuModelText'),
      gpuModelRow: document.getElementById('gpuModelRow'),
      gpuModelText: document.getElementById('gpuModelText'),
      hostnameText: document.getElementById('hostnameText'),

      arcReactorCanvas: document.getElementById('arcReactorCanvas'),
      lastLatencyText: document.getElementById('lastLatencyText'),
      activeProtocolText: document.getElementById('activeProtocolText'),
      reactorStateBanner: document.getElementById('reactorStateBanner'),

      commsConsole: document.getElementById('commsConsole'),
      chatForm: document.getElementById('chatForm'),
      micBtn: document.getElementById('micBtn'),
      userInput: document.getElementById('userInput'),
      sendBtn: document.getElementById('sendBtn'),
      stopVoiceBtn: document.getElementById('stopVoiceBtn'),

      personaSelect: document.getElementById('personaSelect'),
      languageSelect: document.getElementById('languageSelect'),
      honorificInput: document.getElementById('honorificInput'),

      voiceSelect: document.getElementById('voiceSelect'),
      pitchSlider: document.getElementById('pitchSlider'),
      pitchValText: document.getElementById('pitchValText'),
      rateSlider: document.getElementById('rateSlider'),
      rateValText: document.getElementById('rateValText'),

      toggleVoiceBtn: document.getElementById('toggleVoiceBtn'),
      toggleResonanceBtn: document.getElementById('toggleResonanceBtn'),
      toggleSfxBtn: document.getElementById('toggleSfxBtn'),
      toggleHourlyChimeBtn: document.getElementById('toggleHourlyChimeBtn'),
      toggleAmbientHumBtn: document.getElementById('toggleAmbientHumBtn'),
      testVoiceBtn: document.getElementById('testVoiceBtn'),
      toggleWebSkillBtn: document.getElementById('toggleWebSkillBtn'),
      toggleForceSearchBtn: document.getElementById('toggleForceSearchBtn'),
      clearHistoryBtn: document.getElementById('clearHistoryBtn'),

      timerDisplayBadge: document.getElementById('timerDisplayBadge'),
      cancelTimerBtn: document.getElementById('cancelTimerBtn'),
      announceTimeBtn: document.getElementById('announceTimeBtn'),
      vaultInput: document.getElementById('vaultInput'),
      addTaskBtn: document.getElementById('addTaskBtn'),
      addMemoryBtn: document.getElementById('addMemoryBtn'),
      addWatchlistBtn: document.getElementById('addWatchlistBtn'),
      addAlertBtn: document.getElementById('addAlertBtn'),
      toggleQuakeAlertBtn: document.getElementById('toggleQuakeAlertBtn'),
      toggleAutoBriefingBtn: document.getElementById('toggleAutoBriefingBtn'),
      toggleServiceSentinelBtn: document.getElementById('toggleServiceSentinelBtn'),
      focusLayoutBtn: document.getElementById('focusLayoutBtn'),
      vaultListContainer: document.getElementById('vaultListContainer'),

      attachmentBanner: document.getElementById('attachmentBanner'),
      opticPreviewImg: document.getElementById('opticPreviewImg'),
      attachmentLabel: document.getElementById('attachmentLabel'),
      clearAttachmentBtn: document.getElementById('clearAttachmentBtn'),
      fileUploadInput: document.getElementById('fileUploadInput'),
      attachFileBtn: document.getElementById('attachFileBtn'),
      scanScreenBtn: document.getElementById('scanScreenBtn'),

      cmdPaletteBtn: document.getElementById('cmdPaletteBtn'),
      commandPaletteModal: document.getElementById('commandPaletteModal'),
      closeCmdPaletteBtn: document.getElementById('closeCmdPaletteBtn'),
      cmdPaletteInput: document.getElementById('cmdPaletteInput'),
      cmdPaletteList: document.getElementById('cmdPaletteList'),

      telemetryTrendModal: document.getElementById('telemetryTrendModal'),
      closeTrendModalBtn: document.getElementById('closeTrendModalBtn'),
      trendTargetBadge: document.getElementById('trendTargetBadge'),
      cpuTrendTabBtn: document.getElementById('cpuTrendTabBtn'),
      ramTrendTabBtn: document.getElementById('ramTrendTabBtn'),
      gpuTrendTabBtn: document.getElementById('gpuTrendTabBtn'),
      gpuMemTrendTabBtn: document.getElementById('gpuMemTrendTabBtn'),
      trendStatCurrent: document.getElementById('trendStatCurrent'),
      trendStatPeak: document.getElementById('trendStatPeak'),
      trendStatAvg: document.getElementById('trendStatAvg'),
      trendStatMin: document.getElementById('trendStatMin'),
      telemetryTrendCanvas: document.getElementById('telemetryTrendCanvas'),
      trendCrosshairTooltip: document.getElementById('trendCrosshairTooltip'),
      trendFooterTelemetry: document.getElementById('trendFooterTelemetry'),
      refreshTrendBtn: document.getElementById('refreshTrendBtn')
    };

    this.trendActiveMetric = 'cpu';
    this.trendActiveMinutes = 30;
    this.trendData = null;
    this.trendRefreshTimer = null;
    this.trendHoverIndex = -1;
  }

  _initVisualizer() {
    this.visualizer = new ArcReactorVisualizer(
      this.dom.arcReactorCanvas,
      () => this.audio.sampleEnergy()
    );
    this.visualizer.start();

    const holoBgCanvas = document.getElementById('holoBgCanvas');
    if (holoBgCanvas) {
      this.holoBgVisualizer = new HoloBackgroundVisualizer(holoBgCanvas);
      this.holoBgVisualizer.start();
    }

    this.audio.onSpeakingStateChange = (speaking) => {
      if (speaking) {
        this.speechInput?.pauseForTts();
        this.visualizer.setState('SPEAKING');
        this.dom.reactorStateBanner.textContent =
          'VOCAL TRANSMISSION ACTIVE // J.A.R.V.I.S. SPEAKING';
      } else {
        this.speechInput?.resumeAfterTts();
        if (!this.speechInput?.wakeWordMode) {
          this.visualizer.setState('IDLE');
          this.dom.reactorStateBanner.textContent =
            'ONLINE // AWAITING COMMAND, SIR';
        }
      }
    };
  }

  _initSpeechInput() {
    this.speechInput = new JarvisSpeechInput({
      onResult: (transcript, isFinal) => {
        this.dom.userInput.value = transcript;
        if (isFinal && transcript.trim().length > 0) {
          this.dom.userInput.value = '';
          this.handleSendMessage(transcript.trim());
        }
      },
      onWakeWord: (commandText) => {
        this.audio.playBootSequence();
        if (commandText && commandText.trim().length > 0) {
          this.dom.userInput.value = '';
          this.handleSendMessage(commandText.trim());
        } else {
          this.dom.userInput.value = '';
          this.dom.reactorStateBanner.textContent =
            '🟢 WAKE WORD ACTIVE // SPEAK DIRECTIVE NOW (15S WINDOW)';
        }
      },
      onStateChange: (listening) => {
        if (listening) {
          const isFollowup = this.speechInput.awaitingWakeFollowup;
          this.dom.micBtn.textContent = this.speechInput.wakeWordMode
            ? isFollowup
              ? 'MIC: ACTIVE (15S)'
              : 'MIC: WAKE-ON'
            : 'MIC: LISTENING';
          this.dom.micBtn.classList.add('amber');
          this.visualizer.setState('LISTENING');
          this.dom.reactorStateBanner.textContent = this.speechInput.wakeWordMode
            ? isFollowup
              ? '🟢 FOLLOW-UP WINDOW OPEN // SPEAK DIRECTLY OR SAY "JARVIS"'
              : 'HANDS-FREE WAKE MODE // SAY "JARVIS / 賈維斯"'
            : 'AUDIO SENSORS ACTIVE // LISTENING TO SIR';
        } else if (!this.speechInput.wakeWordMode) {
          this.dom.micBtn.textContent = 'MIC: OFF';
          this.dom.micBtn.classList.remove('amber');
          if (!this.audio.isSpeaking) {
            this.visualizer.setState('IDLE');
            this.dom.reactorStateBanner.textContent =
              'ONLINE // AWAITING COMMAND, SIR';
          }
        }
      },
      onError: (errMsg) => {
        this.dom.reactorStateBanner.textContent = errMsg.toUpperCase();
      }
    });
  }

  _populateVoices() {
    const voices = this.audio.getAvailableVoices();
    if (!voices.length) return;

    const currentVal = this.dom.voiceSelect.value;
    this.dom.voiceSelect.innerHTML =
      '<option value="">Auto-Select Best J.A.R.V.I.S. Voice (British / 繁中)</option>';

    // Sort British English and Traditional Chinese voices to the top
    const sorted = [...voices].sort((a, b) => {
      const score = (v) => {
        if (v.lang === 'en-GB') return 3;
        if (v.lang === 'zh-TW' || v.lang === 'zh-HK') return 2;
        if (v.lang.startsWith('en') || v.lang.startsWith('zh')) return 1;
        return 0;
      };
      return score(b) - score(a);
    });

    for (const v of sorted) {
      const opt = document.createElement('option');
      opt.value = v.voiceURI;
      opt.textContent = `${v.name} [${v.lang}]`;
      this.dom.voiceSelect.appendChild(opt);
    }

    if (currentVal) {
      this.dom.voiceSelect.value = currentVal;
    }
  }

  _loadSavedSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const cfg = JSON.parse(raw);
      if (cfg.provider) this.dom.providerSelect.value = cfg.provider;
      if (cfg.customModel) this.dom.customModelInput.value = cfg.customModel;
      if (cfg.baseUrl) this.dom.baseUrlInput.value = cfg.baseUrl;
      if (cfg.persona) this.dom.personaSelect.value = cfg.persona;
      if (cfg.language) this.dom.languageSelect.value = cfg.language;
      if (cfg.honorific) this.dom.honorificInput.value = cfg.honorific;
      if (cfg.suitTheme && this.dom.suitThemeSelect) {
        this.dom.suitThemeSelect.value = cfg.suitTheme;
        this.applySuitTheme(cfg.suitTheme);
      }
      if (typeof cfg.pitch === 'number') {
        this.audio.pitch = cfg.pitch;
        this.dom.pitchSlider.value = String(cfg.pitch);
        this.dom.pitchValText.textContent = cfg.pitch.toFixed(2);
      }
      if (typeof cfg.rate === 'number') {
        this.audio.rate = cfg.rate;
        this.dom.rateSlider.value = String(cfg.rate);
        this.dom.rateValText.textContent = `${cfg.rate.toFixed(2)}x`;
      }
      if (typeof cfg.hourlyChimeEnabled === 'boolean') {
        this.hourlyChimeEnabled = cfg.hourlyChimeEnabled;
        if (this.dom.toggleHourlyChimeBtn) {
          this.dom.toggleHourlyChimeBtn.classList.toggle('active', this.hourlyChimeEnabled);
          const strong = this.dom.toggleHourlyChimeBtn.querySelector('strong');
          if (strong) strong.textContent = this.hourlyChimeEnabled ? 'ON' : 'OFF';
        }
      }
      if (typeof cfg.ambientHumEnabled === 'boolean' && this.dom.toggleAmbientHumBtn) {
        if (cfg.ambientHumEnabled) {
          this._updateToggleChip(this.dom.toggleAmbientHumBtn, true);
          const resumeHum = () => {
            if (this.dom.toggleAmbientHumBtn?.classList.contains('active')) {
              this.audio.setAmbientHum(true);
            }
            window.removeEventListener('click', resumeHum);
          };
          window.addEventListener('click', resumeHum, { once: true });
        }
      }
      if (Array.isArray(cfg.collapsedSections)) {
        document.querySelectorAll('.panel-section.collapsible[data-section-id]').forEach((sec) => {
          const secId = sec.getAttribute('data-section-id');
          sec.classList.toggle('collapsed', cfg.collapsedSections.includes(secId));
        });
      }
      if (typeof cfg.focusLayout === 'boolean') {
        this.setFocusLayout(cfg.focusLayout, { silent: true, persist: false });
      }
    } catch {
      // Ignore corrupt storage
    }
  }

  _saveSettings() {
    try {
      const collapsedSections = [];
      document.querySelectorAll('.panel-section.collapsible.collapsed[data-section-id]').forEach((sec) => {
        const secId = sec.getAttribute('data-section-id');
        if (secId) collapsedSections.push(secId);
      });

      const payload = {
        provider: this.dom.providerSelect.value,
        customModel: this.dom.customModelInput.value,
        baseUrl: this.dom.baseUrlInput.value,
        persona: this.dom.personaSelect.value,
        language: this.dom.languageSelect.value,
        honorific: this.dom.honorificInput.value,
        suitTheme: this.dom.suitThemeSelect?.value || 'mark85',
        pitch: this.audio.pitch,
        rate: this.audio.rate,
        hourlyChimeEnabled: this.hourlyChimeEnabled,
        ambientHumEnabled: this.audio.ambientHumEnabled,
        collapsedSections,
        focusLayout: this.focusLayout
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota issues
    }
  }

  _loadSavedChatHistory() {
    try {
      const raw = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed.cards) || parsed.cards.length === 0) return false;

      this.conversationHistory = Array.isArray(parsed.history)
        ? parsed.history.slice(-24)
        : [];
      this.persistedLogCards = parsed.cards.slice(-24);

      for (const item of this.persistedLogCards) {
        this.appendMessage({ ...item, skipPersist: true });
      }
      return true;
    } catch {
      return false;
    }
  }

  _saveChatHistory() {
    try {
      const payload = {
        history: this.conversationHistory.slice(-24),
        cards: this.persistedLogCards.slice(-24)
      };
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }

  applySuitTheme(themeName) {
    document.body.classList.remove(
      'theme-hulkbuster',
      'theme-stealth',
      'theme-warmachine'
    );
    if (themeName && themeName !== 'mark85') {
      document.body.classList.add(`theme-${themeName}`);
    }
    if (this.visualizer) {
      this.visualizer.setTheme(themeName);
    }
    if (this.holoBgVisualizer) {
      this.holoBgVisualizer.setTheme(themeName);
    }
  }

  _bindEvents() {
    if (this.dom.suitThemeSelect) {
      this.dom.suitThemeSelect.addEventListener('change', () => {
        this.audio.playHudClick(1900);
        this.applySuitTheme(this.dom.suitThemeSelect.value);
        this._saveSettings();
      });
    }

    if (this.dom.wakeWordBtn) {
      this.dom.wakeWordBtn.addEventListener('click', () => {
        this.audio.playHudClick(1750);
        this.speechInput.setLanguage(this.dom.languageSelect.value);
        const active = this.speechInput.setWakeWordMode(!this.speechInput.wakeWordMode);
        this.dom.wakeWordBtn.textContent = active
          ? '🎙️ WAKE WORD: ON'
          : '🎙️ WAKE WORD: OFF';
        this.dom.wakeWordBtn.classList.toggle('amber', active);
      });
    }

    if (this.dom.exportReportBtn) {
      this.dom.exportReportBtn.addEventListener('click', () => {
        this.audio.playHudClick(2050);
        this.handleExportMarkdownReport();
      });
    }
    this.dom.bootAudioBtn.addEventListener('click', () => {
      this.audio.playBootSequence();
      const honorific = this.dom.honorificInput.value || 'Sir';
      const lang = this.dom.languageSelect.value;
      const greeting =
        lang === 'en-GB'
          ? `Good day, ${honorific}. All Mark 85 systems are online and at your service.`
          : `Good day, ${honorific}. 先生，馬克 85 號全息主控台與語音合成系統已全面啟動，隨時聽候差遣。`;
      this.audio.speak(greeting);
      this.dom.bootAudioBtn.textContent = 'HUD AUDIO ACTIVE';
    });

    this.dom.providerSelect.addEventListener('change', () => {
      this.audio.playHudClick();
      this._updateProviderUiState();
      this._saveSettings();
    });

    this.dom.refreshModelsBtn.addEventListener('click', () => {
      this.audio.playHudClick(2100);
      this.refreshModelsAndTelemetry();
    });

    this.dom.pullModelBtn.addEventListener('click', () => {
      this.audio.playHudClick(1600);
      this.handlePullOllamaModel();
    });

    this.dom.chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = this.dom.userInput.value.trim();
      if (!text) return;
      this.dom.userInput.value = '';
      this.handleSendMessage(text);
    });

    this.dom.micBtn.addEventListener('click', () => {
      this.audio.playHudClick(1500);
      this.speechInput.setLanguage(this.dom.languageSelect.value);
      this.speechInput.toggle();
    });

    this.dom.stopVoiceBtn.addEventListener('click', () => {
      this.audio.muteAll();
      if (this.dom.toggleAmbientHumBtn) {
        this._updateToggleChip(this.dom.toggleAmbientHumBtn, false);
      }
      this._saveSettings();
    });

    this.dom.personaSelect.addEventListener('change', () => {
      this.audio.playHudClick();
      this.dom.activeProtocolText.textContent =
        this.dom.personaSelect.value.toUpperCase();
      this._saveSettings();
    });

    this.dom.languageSelect.addEventListener('change', () => {
      this.audio.playHudClick();
      this.speechInput.setLanguage(this.dom.languageSelect.value);
      this._saveSettings();
    });

    this.dom.honorificInput.addEventListener('change', () => this._saveSettings());
    this.dom.customModelInput.addEventListener('change', () => this._saveSettings());

    this.dom.voiceSelect.addEventListener('change', () => {
      this.audio.selectedVoiceURI = this.dom.voiceSelect.value;
      this.audio.playHudClick();
    });

    this.dom.pitchSlider.addEventListener('input', () => {
      const val = parseFloat(this.dom.pitchSlider.value);
      this.audio.pitch = val;
      this.dom.pitchValText.textContent = val.toFixed(2);
      this._saveSettings();
    });

    this.dom.rateSlider.addEventListener('input', () => {
      const val = parseFloat(this.dom.rateSlider.value);
      this.audio.rate = val;
      this.dom.rateValText.textContent = `${val.toFixed(2)}x`;
      this._saveSettings();
    });

    this.dom.toggleVoiceBtn.addEventListener('click', () => {
      this.audio.voiceEnabled = !this.audio.voiceEnabled;
      this._updateToggleChip(this.dom.toggleVoiceBtn, this.audio.voiceEnabled);
      if (!this.audio.voiceEnabled) this.audio.stopSpeaking();
    });

    this.dom.toggleResonanceBtn.addEventListener('click', () => {
      this.audio.sciFiResonanceEnabled = !this.audio.sciFiResonanceEnabled;
      this._updateToggleChip(
        this.dom.toggleResonanceBtn,
        this.audio.sciFiResonanceEnabled
      );
    });

    this.dom.toggleSfxBtn.addEventListener('click', () => {
      this.audio.sfxEnabled = !this.audio.sfxEnabled;
      this._updateToggleChip(this.dom.toggleSfxBtn, this.audio.sfxEnabled);
    });

    if (this.dom.toggleHourlyChimeBtn) {
      this.dom.toggleHourlyChimeBtn.addEventListener('click', () => {
        this.hourlyChimeEnabled = !this.hourlyChimeEnabled;
        this._updateToggleChip(this.dom.toggleHourlyChimeBtn, this.hourlyChimeEnabled);
        this._saveSettings();
      });
    }

    if (this.dom.toggleAmbientHumBtn) {
      this.dom.toggleAmbientHumBtn.addEventListener('click', () => {
        const active = this.audio.setAmbientHum(!this.audio.ambientHumEnabled);
        this._updateToggleChip(this.dom.toggleAmbientHumBtn, active);
        this._saveSettings();
      });
    }

    if (this.dom.announceTimeBtn) {
      this.dom.announceTimeBtn.addEventListener('click', () => {
        this.announceCurrentTime(false);
      });
    }

    if (this.dom.hudClockPill) {
      this.dom.hudClockPill.title = 'Click to test vocal time announcement (點擊手動播報時間與鐘聲)';
      this.dom.hudClockPill.addEventListener('click', () => {
        this.announceCurrentTime(false);
      });
    }

    window.addEventListener('online', () => this.updateInternetStatus());
    window.addEventListener('offline', () => this.updateInternetStatus());

    if (this.dom.netStatusPill) {
      this.dom.netStatusPill.addEventListener('click', () => {
        this.handleCheckInternetClick();
      });
    }

    if (this.dom.toggleWebSkillBtn) {
      this.dom.toggleWebSkillBtn.addEventListener('click', () => {
        this.webSearchEnabled = !this.webSearchEnabled;
        this._updateToggleChip(this.dom.toggleWebSkillBtn, this.webSearchEnabled);
      });
    }

    if (this.dom.toggleForceSearchBtn) {
      this.dom.toggleForceSearchBtn.addEventListener('click', () => {
        this.forceWebSearch = !this.forceWebSearch;
        this._updateToggleChip(this.dom.toggleForceSearchBtn, this.forceWebSearch);
      });
    }

    this.dom.testVoiceBtn.addEventListener('click', () => {
      this.audio.playHudClick(2200);
      const lang = this.dom.languageSelect.value;
      const honorific = this.dom.honorificInput.value || 'Sir';
      const sample =
        lang === 'zh-TW'
          ? `${honorific}，J.A.R.V.I.S. 語音調變系統測試正常，方舟反應爐輸出穩定。`
          : `At your service, ${honorific}. Vocal modulation calibrated to optimal parameters.`;
      this.audio.speak(sample);
    });

    document.querySelectorAll('[data-prompt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const launchUrl = btn.getAttribute('data-launch-url');
        if (launchUrl) {
          window.open(launchUrl, '_blank', 'noopener,noreferrer');
        }
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) {
          this.handleSendMessage(prompt);
        }
      });
    });

    const solarBtn = document.getElementById('launchSolarSystemBtn');
    if (solarBtn) {
      solarBtn.addEventListener('click', () => {
        this.launchSolarSystem();
      });
    }

    const ipScannerBtn = document.getElementById('launchIpScannerBtn');
    if (ipScannerBtn) {
      ipScannerBtn.addEventListener('click', () => {
        this.launchIpScanner();
      });
    }

    // Collapsible HUD Panel Sections (01 // – 08 //)
    document.querySelectorAll('.panel-section.collapsible > .section-header').forEach((header) => {
      header.title = header.title || 'Click to expand or collapse (點擊展開或收合)';
      header.addEventListener('click', (e) => {
        if (e.target.closest('button, select, input, a')) return;
        const section = header.closest('.panel-section.collapsible');
        if (!section) return;
        section.classList.toggle('collapsed');
        this.audio.playHudClick(section.classList.contains('collapsed') ? 1450 : 1950);
        this._saveSettings();
      });
    });

    // Focus Layout (hide both side panels)
    if (this.dom.focusLayoutBtn) {
      this.dom.focusLayoutBtn.addEventListener('click', () => {
        this.setFocusLayout(!this.focusLayout);
      });
    }

    // Stark Sentinel: price alerts & earthquake alert toggle
    if (this.dom.addAlertBtn) {
      this.dom.addAlertBtn.addEventListener('click', () => this.handleAddPriceAlert());
    }
    if (this.dom.toggleQuakeAlertBtn) {
      this.dom.toggleQuakeAlertBtn.addEventListener('click', () => this.handleToggleQuakeAlerts());
    }
    if (this.dom.toggleAutoBriefingBtn) {
      this.dom.toggleAutoBriefingBtn.addEventListener('click', () => this.handleToggleAutoBriefing());
    }
    if (this.dom.toggleServiceSentinelBtn) {
      this.dom.toggleServiceSentinelBtn.addEventListener('click', () => this.handleToggleServiceSentinel());
    }

    // Tactical Voice Countdown Timer
    document.querySelectorAll('.timer-preset-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mins = Number(btn.getAttribute('data-minutes')) || 1;
        this.startTacticalTimer(mins * 60);
      });
    });

    if (this.dom.cancelTimerBtn) {
      this.dom.cancelTimerBtn.addEventListener('click', () => {
        this.stopTacticalTimer();
      });
    }

    // Memory Vault, To-Do List & Custom Watchlist Controls
    if (this.dom.addTaskBtn) {
      this.dom.addTaskBtn.addEventListener('click', () => this.handleAddVaultTask());
    }
    if (this.dom.addMemoryBtn) {
      this.dom.addMemoryBtn.addEventListener('click', () => this.handleAddVaultMemory());
    }
    if (this.dom.addWatchlistBtn) {
      this.dom.addWatchlistBtn.addEventListener('click', () => this.handleAddVaultWatchlist());
    }

    // File Upload & Drag-and-Drop Analyzer
    if (this.dom.attachFileBtn && this.dom.fileUploadInput) {
      this.dom.attachFileBtn.addEventListener('click', () => {
        this.audio.playHudClick();
        this.dom.fileUploadInput.click();
      });
      this.dom.fileUploadInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) this.handleFileLoaded(file);
        this.dom.fileUploadInput.value = '';
      });
    }

    if (this.dom.commsConsole) {
      this.dom.commsConsole.addEventListener('dragover', (e) => {
        e.preventDefault();
        this.dom.commsConsole.classList.add('drag-over');
      });
      this.dom.commsConsole.addEventListener('dragleave', () => {
        this.dom.commsConsole.classList.remove('drag-over');
      });
      this.dom.commsConsole.addEventListener('drop', (e) => {
        e.preventDefault();
        this.dom.commsConsole.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file) this.handleFileLoaded(file);
      });
    }

    // Command Palette (Ctrl+K)
    if (this.dom.cmdPaletteBtn) {
      this.dom.cmdPaletteBtn.addEventListener('click', () => {
        this.openCommandPalette();
      });
    }

    if (this.dom.closeCmdPaletteBtn) {
      this.dom.closeCmdPaletteBtn.addEventListener('click', () => {
        this.closeCommandPalette();
      });
    }

    if (this.dom.commandPaletteModal) {
      this.dom.commandPaletteModal.addEventListener('click', (e) => {
        if (e.target === this.dom.commandPaletteModal) {
          this.closeCommandPalette();
        }
      });
    }

    if (this.dom.cmdPaletteInput) {
      this.dom.cmdPaletteInput.addEventListener('input', () => {
        this._renderCommandPaletteItems(this.dom.cmdPaletteInput.value);
      });
    }

    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        this.setFocusLayout(!this.focusLayout);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (this.dom.commandPaletteModal?.classList.contains('hidden')) {
          this.openCommandPalette();
        } else {
          this.closeCommandPalette();
        }
      } else if (e.key === 'Escape') {
        if (!this.dom.telemetryTrendModal?.classList.contains('hidden')) {
          this.closeTelemetryTrendModal();
        } else if (!this.dom.commandPaletteModal?.classList.contains('hidden')) {
          this.closeCommandPalette();
        }
      }
    });

    // Telemetry Trend Analyzer Modal (5, 10, 30, 60 mins)
    if (this.dom.cpuMetricRow) {
      this.dom.cpuMetricRow.addEventListener('click', () => this.openTelemetryTrendModal('cpu'));
    }
    if (this.dom.memMetricRow) {
      this.dom.memMetricRow.addEventListener('click', () => this.openTelemetryTrendModal('ram'));
    }
    if (this.dom.gpuNeuralRow) {
      this.dom.gpuNeuralRow.addEventListener('click', () => this.openTelemetryTrendModal('gpu'));
    }
    if (this.dom.gpuMetricRow) {
      this.dom.gpuMetricRow.addEventListener('click', () => this.openTelemetryTrendModal('gpuMem'));
    }
    if (this.dom.closeTrendModalBtn) {
      this.dom.closeTrendModalBtn.addEventListener('click', () => this.closeTelemetryTrendModal());
    }
    if (this.dom.telemetryTrendModal) {
      this.dom.telemetryTrendModal.addEventListener('click', (e) => {
        if (e.target === this.dom.telemetryTrendModal) {
          this.closeTelemetryTrendModal();
        }
      });
    }
    if (this.dom.cpuTrendTabBtn) {
      this.dom.cpuTrendTabBtn.addEventListener('click', () => {
        this.audio.playHudClick(1900);
        this.trendActiveMetric = 'cpu';
        this._updateTrendTabsUi();
        this._updateTrendStatsUi();
        this.renderTrendCanvas();
      });
    }
    if (this.dom.ramTrendTabBtn) {
      this.dom.ramTrendTabBtn.addEventListener('click', () => {
        this.audio.playHudClick(1900);
        this.trendActiveMetric = 'ram';
        this._updateTrendTabsUi();
        this._updateTrendStatsUi();
        this.renderTrendCanvas();
      });
    }
    if (this.dom.gpuTrendTabBtn) {
      this.dom.gpuTrendTabBtn.addEventListener('click', () => {
        this.audio.playHudClick(1900);
        this.trendActiveMetric = 'gpu';
        this._updateTrendTabsUi();
        this._updateTrendStatsUi();
        this.renderTrendCanvas();
      });
    }
    if (this.dom.gpuMemTrendTabBtn) {
      this.dom.gpuMemTrendTabBtn.addEventListener('click', () => {
        this.audio.playHudClick(1900);
        this.trendActiveMetric = 'gpuMem';
        this._updateTrendTabsUi();
        this._updateTrendStatsUi();
        this.renderTrendCanvas();
      });
    }

    document.querySelectorAll('.range-tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mins = Number(btn.getAttribute('data-minutes'));
        if (mins && [5, 10, 30, 60, 480, 720, 1440].includes(mins)) {
          this.audio.playHudClick(1750);
          this.trendActiveMinutes = mins;
          this._updateTrendTabsUi();
          this.fetchAndRenderTrend();
        }
      });
    });

    if (this.dom.refreshTrendBtn) {
      this.dom.refreshTrendBtn.addEventListener('click', () => {
        this.audio.playHudClick(1850);
        this.fetchAndRenderTrend();
      });
    }

    if (this.dom.telemetryTrendCanvas) {
      const canvas = this.dom.telemetryTrendCanvas;
      canvas.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const padLeft = 40;
        const padRight = 20;
        const plotWidth = rect.width - padLeft - padRight;
        if (mouseX < padLeft || mouseX > padLeft + plotWidth) {
          this.trendHoverIndex = -1;
          if (this.dom.trendCrosshairTooltip) this.dom.trendCrosshairTooltip.classList.add('hidden');
          this.renderTrendCanvas();
          return;
        }
        const points = this.trendData?.points || [];
        if (points.length < 2) return;

        const windowMins = this.trendActiveMinutes || 30;
        const now = Date.now();
        const startTime = this.trendData?.startTime ?? (now - windowMins * 60 * 1000);
        const endTime = this.trendData?.endTime ?? now;
        const timeSpan = Math.max(1000, endTime - startTime);

        const frac = Math.max(0, Math.min(1, (mouseX - padLeft) / plotWidth));
        const targetTime = startTime + frac * timeSpan;

        let closestIdx = 0;
        let closestDiff = Infinity;
        for (let i = 0; i < points.length; i++) {
          const diff = Math.abs(points[i].timestamp - targetTime);
          if (diff < closestDiff) {
            closestDiff = diff;
            closestIdx = i;
          }
        }
        this.trendHoverIndex = closestIdx;
        const p = points[closestIdx];
        const metricLabels = {
          cpu: 'CPU LOAD',
          ram: 'RAM ALLOCATION',
          gpu: 'GPU LOAD',
          gpuMem: 'GPU VRAM'
        };
        let val = 0;
        if (this.trendActiveMetric === 'cpu') val = typeof p.cpu === 'number' ? p.cpu : 0;
        else if (this.trendActiveMetric === 'ram') val = typeof p.ram === 'number' ? p.ram : 0;
        else if (this.trendActiveMetric === 'gpu') val = typeof p.gpu === 'number' ? p.gpu : 0;
        else if (this.trendActiveMetric === 'gpuMem') val = typeof p.gpuMemoryPercent === 'number' ? p.gpuMemoryPercent : 0;

        const dateObj = new Date(p.timestamp);
        let timeStr = dateObj.toLocaleTimeString('zh-TW', { hour12: false });
        if (this.trendActiveMinutes >= 60) {
          const month = String(dateObj.getMonth() + 1).padStart(2, '0');
          const day = String(dateObj.getDate()).padStart(2, '0');
          const hours = String(dateObj.getHours()).padStart(2, '0');
          const mins = String(dateObj.getMinutes()).padStart(2, '0');
          timeStr = `${month}/${day} ${hours}:${mins}`;
        }
        if (this.dom.trendCrosshairTooltip) {
          this.dom.trendCrosshairTooltip.classList.remove('hidden');
          const label = metricLabels[this.trendActiveMetric] || 'METRIC';
          const statusNote = (this.trendActiveMetric === 'gpu' && val === 0) ? ' (IDLE)' : '';
          this.dom.trendCrosshairTooltip.textContent = `${label}: ${val}%${statusNote} • ${timeStr}`;
        }
        this.renderTrendCanvas();
      });

      canvas.addEventListener('mouseleave', () => {
        this.trendHoverIndex = -1;
        if (this.dom.trendCrosshairTooltip) this.dom.trendCrosshairTooltip.classList.add('hidden');
        this.renderTrendCanvas();
      });
    }

    // Optic Vision Scanner (Screen Capture)
    if (this.dom.scanScreenBtn) {
      this.dom.scanScreenBtn.addEventListener('click', () => this.handleScanScreen());
    }
    if (this.dom.clearAttachmentBtn) {
      this.dom.clearAttachmentBtn.addEventListener('click', () => this.clearPendingPayload());
    }

    this.dom.clearHistoryBtn.addEventListener('click', () => {
      this.audio.playHudClick(1400);
      this.conversationHistory = [];
      this.persistedLogCards = [];
      try {
        localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
      } catch {
        // Ignore storage errors
      }
      this.dom.commsConsole.innerHTML = '';
      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S.',
        content: 'Communications log purged, Sir. Ready for new directives.',
        speechText: 'Communications log purged, Sir.',
        badge: 'MEMORY CLEARED',
        skipPersist: true
      });
    });
  }

  _updateToggleChip(el, active) {
    el.classList.toggle('active', active);
    const strong = el.querySelector('strong');
    if (strong) strong.textContent = active ? 'ON' : 'OFF';
    this.audio.playHudClick();
  }

  /**
   * Toggles the focus layout, hiding both side panels.
   * @param {boolean} active
   * @param {{silent?: boolean, persist?: boolean}} [options]
   */
  setFocusLayout(active, { silent = false, persist = true } = {}) {
    this.focusLayout = Boolean(active);
    document.body.classList.toggle('focus-layout', this.focusLayout);
    if (this.dom.focusLayoutBtn) {
      this.dom.focusLayoutBtn.classList.toggle('active', this.focusLayout);
      this.dom.focusLayoutBtn.textContent = this.focusLayout ? '🎯 FOCUS: ON' : '🎯 FOCUS';
    }
    if (!silent) this.audio.playHudClick(this.focusLayout ? 2100 : 1500);
    if (persist) this._saveSettings();
  }

  /**
   * Collapses or expands every collapsible HUD panel section.
   * @param {boolean} collapsed
   */
  setAllSectionsCollapsed(collapsed) {
    document.querySelectorAll('.panel-section.collapsible').forEach((sec) => {
      sec.classList.toggle('collapsed', collapsed);
    });
    this.audio.playHudClick(collapsed ? 1450 : 1950);
    this._saveSettings();
  }

  /** Requests browser notification permission (no-op if unsupported or already decided). */
  _ensureNotificationPermission() {
    if (!('Notification' in window) || Notification.permission !== 'default') return;
    Notification.requestPermission().catch((err) => {
      console.warn('[J.A.R.V.I.S.] Notification permission request failed:', err);
    });
  }

  async handleAddPriceAlert() {
    const val = this.dom.vaultInput?.value.trim();
    if (!val) {
      this.dom.reactorStateBanner.textContent =
        'SENTINEL // ENTER ALERT e.g. "0050 > 180" OR "黃金漲破 NT$16000"';
      return;
    }
    this._ensureNotificationPermission();
    this.audio.playHudClick(2050);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: val })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      this.dom.vaultInput.value = '';
      this.dom.reactorStateBanner.textContent = `SENTINEL ARMED // ${data.alert.label}`;
      this.refreshVault();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Alert creation failed';
      this.dom.reactorStateBanner.textContent = `SENTINEL ERROR // ${msg}`.toUpperCase();
    }
  }

  async handleToggleQuakeAlerts() {
    const nextState = !this.dom.toggleQuakeAlertBtn.classList.contains('active');
    this._ensureNotificationPermission();
    try {
      const res = await fetch('/api/alerts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ earthquakeAlertsEnabled: nextState })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      this._updateToggleChip(this.dom.toggleQuakeAlertBtn, data.settings.earthquakeAlertsEnabled);
    } catch (error) {
      console.warn('[J.A.R.V.I.S.] Failed to update quake alert setting:', error);
      this.dom.reactorStateBanner.textContent = 'SENTINEL ERROR // UNABLE TO UPDATE QUAKE ALERTS';
    }
  }

  async handleToggleAutoBriefing() {
    const nextState = !this.dom.toggleAutoBriefingBtn.classList.contains('active');
    this._ensureNotificationPermission();
    try {
      const res = await fetch('/api/automation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          morningBriefing: { enabled: nextState },
          endOfDayDebrief: { enabled: nextState }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const isEnabled = Boolean(data.settings?.morningBriefing?.enabled);
      this._updateToggleChip(this.dom.toggleAutoBriefingBtn, isEnabled);
    } catch (error) {
      console.warn('[J.A.R.V.I.S.] Failed to update auto briefing setting:', error);
    }
  }

  async handleToggleServiceSentinel() {
    const nextState = !this.dom.toggleServiceSentinelBtn.classList.contains('active');
    this._ensureNotificationPermission();
    try {
      const res = await fetch('/api/automation/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serviceSentinel: { enabled: nextState }
        })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const isEnabled = Boolean(data.settings?.serviceSentinel?.enabled);
      this._updateToggleChip(this.dom.toggleServiceSentinelBtn, isEnabled);
    } catch (error) {
      console.warn('[J.A.R.V.I.S.] Failed to update service sentinel setting:', error);
    }
  }

  /**
   * Polls the server sentinel for price alerts and new alert events, then announces them.
   */
  async pollSentinelAlerts() {
    try {
      const res = await fetch('/api/alerts');
      if (!res.ok) return;
      const data = await res.json();

      this.priceAlerts = Array.isArray(data.priceAlerts) ? data.priceAlerts : [];
      this._renderVault(this.lastVaultState);

      if (this.dom.toggleQuakeAlertBtn && data.settings) {
        const enabled = Boolean(data.settings.earthquakeAlertsEnabled);
        this.dom.toggleQuakeAlertBtn.classList.toggle('active', enabled);
        const strong = this.dom.toggleQuakeAlertBtn.querySelector('strong');
        if (strong) strong.textContent = enabled ? 'ON' : 'OFF';
      }

      const events = Array.isArray(data.events) ? data.events : [];
      if (events.length === 0) return;

      // Announce oldest first
      for (const evt of [...events].reverse()) {
        this._announceSentinelEvent(evt);
      }

      await fetch('/api/alerts/ack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: events.map((e) => e.id) })
      });
    } catch (error) {
      console.warn('[J.A.R.V.I.S.] Sentinel poll failed:', error);
    }
  }

  /**
   * Displays, speaks, and (if the tab is hidden) pushes a desktop notification for an alert event.
   * @param {{kind: string, title: string, message: string, link?: string}} evt
   */
  _announceSentinelEvent(evt) {
    const honorific = this.dom.honorificInput?.value.trim() || 'Sir';
    const isQuake = evt.kind === 'earthquake';
    const isBriefing = evt.kind === 'morning_briefing';
    const isDebrief = evt.kind === 'end_of_day_debrief';
    const isService = evt.kind === 'service_alert';
    const isUptime = evt.kind === 'uptime_alert';
    const isFuel = evt.kind === 'friday_fuel_alert';
    const isChime = evt.kind === 'hourly_chime';
    const isFocus = evt.kind === 'focus_health_alert';

    let sender = 'J.A.R.V.I.S. // PRICE SENTINEL';
    let badge = 'PRICE ALERT';

    if (isQuake) {
      sender = 'J.A.R.V.I.S. // SEISMIC SENTINEL';
      badge = 'EARTHQUAKE ALERT';
    } else if (isBriefing) {
      sender = 'J.A.R.V.I.S. // AUTONOMOUS BRIEFING';
      badge = 'SCHEDULED BRIEFING';
    } else if (isDebrief) {
      sender = 'J.A.R.V.I.S. // TACTICAL DEBRIEF';
      badge = 'END-OF-DAY REPORT';
    } else if (isService) {
      sender = 'J.A.R.V.I.S. // SERVICE SENTINEL';
      badge = 'SERVICE REPAIR';
    } else if (isUptime) {
      sender = 'J.A.R.V.I.S. // UPTIME SENTINEL';
      badge = 'ENDPOINT MONITOR';
    } else if (isFuel) {
      sender = 'J.A.R.V.I.S. // FUEL SENTINEL';
      badge = 'TAIWAN FUEL';
    } else if (isChime) {
      sender = 'J.A.R.V.I.S. // CHRONO SENTINEL';
      badge = 'HOURLY CHIME';
      if (this.audio && typeof this.audio.playHourlyChime === 'function') {
        this.audio.playHourlyChime();
      }
    } else if (isFocus) {
      sender = 'J.A.R.V.I.S. // HEALTH SENTINEL';
      badge = 'POSTURE & OPTICS';
    }

    const spoken = evt.speechText || `${honorific}，${evt.message}`;

    this.audio.playBootSequence();
    this.appendMessage({
      role: 'assistant',
      sender,
      content: `${evt.title}\n${evt.message}`,
      speechText: spoken,
      badge,
      sources: evt.link ? [{ title: evt.title, link: evt.link, source: 'SENTINEL' }] : []
    });
    setTimeout(() => this.audio.enqueueSpeechSegment(spoken), 600);

    if ('Notification' in window && Notification.permission === 'granted' && document.hidden) {
      try {
        const note = new Notification(evt.title, { body: evt.message, tag: evt.id });
        note.onclick = () => window.focus();
      } catch (error) {
        console.warn('[J.A.R.V.I.S.] Desktop notification failed:', error);
      }
    }
  }

  _startClock() {
    const tick = () => {
      const now = new Date();
      this.dom.hudClock.textContent = now.toTimeString().split(' ')[0];

      // Automatic Hourly Time Announcement at XX:00 (:00 minute)
      // Handles background tab timer throttling without skipping
      if (this.hourlyChimeEnabled && now.getMinutes() === 0) {
        const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`;
        if (this.lastChimedHourKey !== hourKey) {
          this.lastChimedHourKey = hourKey;
          this.announceCurrentTime(true);
        }
      }
    };
    tick();
    setInterval(tick, 1000);

    // Re-check clock immediately when browser tab regains visibility / focus
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    });
    window.addEventListener('focus', () => {
      tick();
    });
  }

  /**
   * Plays the Stark harmonic bell chime and announces the current time in J.A.R.V.I.S.'s voice.
   * @param {boolean} [isHourly=false] - True when triggered automatically on the hour (:00)
   */
  announceCurrentTime(isHourly = false) {
    this.audio.playHourlyChime();
    const now = new Date();
    const hours24 = now.getHours();
    const mins = now.getMinutes();
    const honorific = this.dom.honorificInput?.value.trim() || 'Sir';
    const lang = this.dom.languageSelect?.value || 'auto';

    let periodZh = '上午';
    if (hours24 >= 0 && hours24 < 5) periodZh = '凌晨';
    else if (hours24 >= 5 && hours24 < 8) periodZh = '清晨';
    else if (hours24 >= 8 && hours24 < 11) periodZh = '上午';
    else if (hours24 >= 11 && hours24 < 13) periodZh = '中午';
    else if (hours24 >= 13 && hours24 < 18) periodZh = '下午';
    else periodZh = '晚上';

    const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
    const padH = String(hours24).padStart(2, '0');
    const padM = String(mins).padStart(2, '0');

    let careNoteZh = '所有方舟反應爐與主機系統運作正常。';
    let careNoteEn = 'All Mark 85 systems are operating at peak efficiency.';
    if (hours24 >= 23 || hours24 < 5) {
      careNoteZh = '夜深了，提醒您適度休息以維持最佳生理狀態。';
      careNoteEn = 'It is quite late; I recommend getting some rest soon.';
    } else if (hours24 === 12) {
      careNoteZh = '正值午間時段，建議您稍作休息並補充能量。';
      careNoteEn = 'It is midday; a brief pause for nourishment is recommended.';
    }

    const timePhraseZh =
      mins === 0 ? `${periodZh} ${hours12} 點整` : `${periodZh} ${hours12} 點 ${mins} 分`;
    const timePhraseEn =
      mins === 0 ? `${padH} hundred hours` : `${padH}:${padM}`;

    const prefixZh = isHourly ? '【J.A.R.V.I.S. 整點報時】' : '【J.A.R.V.I.S. 標準時間播報】';
    const msgZh = `${prefixZh}${honorific}，現在時間是 ${timePhraseZh}（${padH}:${padM}）。${careNoteZh}`;
    const speechZh = `${honorific}，現在時間是${timePhraseZh}。${careNoteZh}`;

    const msgEn = `[CHRONO CHIME] ${honorific}, the current time is ${timePhraseEn}. ${careNoteEn}`;

    const useEnglish = lang === 'en-GB';
    const content = useEnglish ? msgEn : msgZh;
    const speechText = useEnglish ? msgEn : speechZh;

    this.appendMessage({
      role: 'assistant',
      sender: 'J.A.R.V.I.S. // CHRONO TELEMETRY',
      content,
      speechText,
      badge: isHourly ? `HOURLY CHIME // ${padH}:00` : `TIME CHECK // ${padH}:${padM}`
    });

    setTimeout(() => {
      this.audio.speak(speechText);
    }, 380);
  }

  async refreshTelemetryOnly() {
    try {
      const res = await fetch('/api/telemetry');
      if (!res.ok) return;
      const data = await res.json();
      if (data.telemetry) {
        this._renderTelemetry(data.telemetry);
      }
    } catch {
      // Silent retry on next tick
    }
  }

  async refreshModelsAndTelemetry() {
    try {
      const customOllamaUrl =
        this.dom.providerSelect.value === 'ollama'
          ? this.dom.baseUrlInput.value.trim()
          : '';
      const query = customOllamaUrl
        ? `?ollamaUrl=${encodeURIComponent(customOllamaUrl)}`
        : '';

      const [modelsRes, telemetryRes] = await Promise.all([
        fetch(`/api/models${query}`),
        fetch(`/api/telemetry${query}`)
      ]);

      if (modelsRes.ok) {
        const modelsData = await modelsRes.json();
        this.modelCatalog = modelsData;
        this._updateProviderUiState();
      }

      if (telemetryRes.ok) {
        const telData = await telemetryRes.json();
        if (telData.telemetry) {
          this._renderTelemetry(telData.telemetry);
        }
      }
    } catch {
      this.dom.ollamaConnBadge.textContent = 'OFFLINE';
    }
  }

  updateInternetStatus(serverInternet) {
    const browserOnline = typeof navigator.onLine === 'boolean' ? navigator.onLine : true;
    const serverOnline = serverInternet ? Boolean(serverInternet.online) : true;
    const isOnline = browserOnline && serverOnline;

    if (this.dom.netStatusDot) {
      this.dom.netStatusDot.classList.toggle('offline', !isOnline);
    }
    if (this.dom.netStatusHeader) {
      this.dom.netStatusHeader.textContent = isOnline ? 'ONLINE' : 'OFFLINE';
      this.dom.netStatusHeader.style.color = isOnline ? 'var(--emerald)' : 'var(--crimson)';
    }
    if (this.dom.netStatusPill) {
      this.dom.netStatusPill.title = `Internet Satellite Uplink: ${
        isOnline ? 'ONLINE (Connected)' : 'OFFLINE (Disconnected)'
      } — Click to re-test`;
    }
  }

  async handleCheckInternetClick() {
    this.audio.playHudClick(2100);
    const isZh = this.dom.languageSelect?.value === 'zh-TW';
    this.dom.reactorStateBanner.textContent = 'PROBING SATELLITE UPLINK // TESTING CONNECTIVITY...';

    const start = Date.now();
    let reachable = navigator.onLine !== false;
    try {
      const res = await fetch('/api/telemetry?t=' + Date.now());
      if (!res.ok) reachable = false;
    } catch {
      reachable = false;
    }
    const latency = Date.now() - start;

    this.updateInternetStatus({ online: reachable });

    if (reachable) {
      this.dom.reactorStateBanner.textContent = `UPLINK NOMINAL // INTERNET ONLINE (${latency}ms)`;
      this.audio.speak(
        isZh
          ? `網際網路衛星連線狀態正常，鏈路延遲約 ${latency} 毫秒。`
          : `Internet satellite uplink is online and nominal, Sir. Round trip latency is ${latency} milliseconds.`
      );
    } else {
      this.dom.reactorStateBanner.textContent = 'UPLINK SEVERED // INTERNET OFFLINE';
      this.audio.speak(
        isZh
          ? '報告，網際網路衛星連線已中斷。'
          : 'Warning, Sir. Internet uplink appears disconnected.'
      );
    }
  }

  _renderTelemetry(t) {
    if (this.dom.arcOutputHeader) {
      this.dom.arcOutputHeader.textContent = `${t.arcReactorOutputPercent}%`;
    }
    this.updateInternetStatus(t.internet);
    this.dom.cpuLoadText.textContent = `${t.cpuUsagePercent}%`;
    this.dom.cpuLoadBar.style.width = `${t.cpuUsagePercent}%`;

    if (t.gpu && t.gpu.available) {
      if (this.dom.gpuNeuralRow) {
        this.dom.gpuNeuralRow.classList.remove('hidden');
        if (this.dom.gpuLoadText) this.dom.gpuLoadText.textContent = `${t.gpu.utilizationPercent}%`;
        if (this.dom.gpuLoadBar) this.dom.gpuLoadBar.style.width = `${t.gpu.utilizationPercent}%`;
      }
      if (this.dom.gpuMetricRow) {
        this.dom.gpuMetricRow.classList.remove('hidden');
        this.dom.gpuMemLoadText.textContent = `${t.gpu.memoryUsedGb} / ${t.gpu.memoryTotalGb} GB (${t.gpu.memoryUsagePercent}%)`;
        this.dom.gpuMemLoadBar.style.width = `${t.gpu.memoryUsagePercent}%`;
      }
      if (this.dom.gpuModelRow && this.dom.gpuModelText) {
        this.dom.gpuModelRow.classList.remove('hidden');
        this.dom.gpuModelText.textContent = `${t.gpu.name} (${t.gpu.utilizationPercent}% • ${t.gpu.temperatureC}°C)`;
      }
    } else {
      if (this.dom.gpuNeuralRow) {
        this.dom.gpuNeuralRow.classList.add('hidden');
      }
      if (this.dom.gpuMetricRow) {
        this.dom.gpuMetricRow.classList.add('hidden');
      }
      if (this.dom.gpuModelRow) {
        this.dom.gpuModelRow.classList.add('hidden');
      }
    }

    this.dom.memLoadText.textContent = `${t.memoryUsedGb} / ${t.memoryTotalGb} GB (${t.memoryUsagePercent}%)`;
    this.dom.memLoadBar.style.width = `${t.memoryUsagePercent}%`;

    if (Array.isArray(t.disks) && t.disks.length > 0 && this.dom.diskLoadText && this.dom.diskLoadBar) {
      const primaryDisk = t.disks[0];
      this.dom.diskLoadText.textContent = `${primaryDisk.drive} ${primaryDisk.usedGb} / ${primaryDisk.totalGb} GB (${primaryDisk.usagePercent}%)`;
      this.dom.diskLoadBar.style.width = `${primaryDisk.usagePercent}%`;
      if (primaryDisk.usagePercent >= 90) {
        this.dom.diskLoadBar.className = 'metric-bar-fill red';
      } else if (primaryDisk.usagePercent >= 75) {
        this.dom.diskLoadBar.className = 'metric-bar-fill amber';
      } else {
        this.dom.diskLoadBar.className = 'metric-bar-fill cyan';
      }
    }

    this.dom.cpuModelText.textContent = t.cpuModel;
    this.dom.hostnameText.textContent = t.hostname;
    this.dom.hostPlatformBadge.textContent = t.platform;
    if (this.dom.networkIpText && t.networkIp) {
      this.dom.networkIpText.textContent = t.networkIp;
    }
    if (this.dom.uptimeText && t.uptimeFormatted) {
      this.dom.uptimeText.textContent = t.uptimeFormatted;
    }
  }

  _updateProviderUiState() {
    const provider = this.dom.providerSelect.value;
    this.dom.activeProviderLabel.textContent = provider.toUpperCase();

    const ollamaInfo = this.modelCatalog.ollama || { online: false, models: [] };

    if (provider === 'ollama') {
      this.dom.apiKeyGroup.classList.add('hidden');
      this.dom.endpointConfigGroup.classList.remove('hidden');
      this.dom.ollamaPullSection.classList.remove('hidden');
      this.dom.baseUrlLabel.textContent = 'OLLAMA BASE URL';
      if (!this.dom.baseUrlInput.value || this.dom.baseUrlInput.value.includes('openai')) {
        this.dom.baseUrlInput.value = ollamaInfo.baseUrl || 'http://127.0.0.1:11434';
      }

      if (ollamaInfo.online) {
        this.dom.ollamaConnBadge.textContent = `OLLAMA ONLINE (${ollamaInfo.models.length} MODELS)`;
        this.dom.ollamaStatusDot.classList.remove('offline');
      } else {
        this.dom.ollamaConnBadge.textContent = 'OLLAMA OFFLINE';
        this.dom.ollamaStatusDot.classList.add('offline');
      }

      this.dom.modelSelect.innerHTML = '';
      if (ollamaInfo.models.length > 0) {
        for (const m of ollamaInfo.models) {
          const opt = document.createElement('option');
          opt.value = m.name;
          opt.textContent = `${m.name} (${m.sizeGb} GB)`;
          this.dom.modelSelect.appendChild(opt);
        }
      } else {
        const emptyOpt = document.createElement('option');
        emptyOpt.value = 'llama3.2:1b';
        emptyOpt.textContent =
          'No local model installed yet — Use [02 // OLLAMA DEPLOYER] below';
        this.dom.modelSelect.appendChild(emptyOpt);
      }
    } else {
      this.dom.apiKeyGroup.classList.remove('hidden');
      this.dom.ollamaPullSection.classList.add('hidden');

      if (provider === 'custom' || provider === 'openai') {
        this.dom.endpointConfigGroup.classList.remove('hidden');
        this.dom.baseUrlLabel.textContent = 'OPENAI-COMPATIBLE BASE URL';
        if (this.dom.baseUrlInput.value.includes('11434')) {
          this.dom.baseUrlInput.value = 'https://api.openai.com/v1';
        }
      } else {
        this.dom.endpointConfigGroup.classList.add('hidden');
      }

      this.dom.ollamaConnBadge.textContent = `${provider.toUpperCase()} CLOUD`;
      this.dom.ollamaStatusDot.classList.remove('offline');

      const presets = this.modelCatalog.cloudCatalog?.[provider] || ['default-model'];
      this.dom.modelSelect.innerHTML = '';
      for (const m of presets) {
        const opt = document.createElement('option');
        opt.value = m;
        opt.textContent = m;
        this.dom.modelSelect.appendChild(opt);
      }
    }
  }

  async handlePullOllamaModel() {
    const rawModel =
      this.dom.customModelInput.value.trim() || this.dom.pullModelSelect.value;
    const modelToPull = rawModel.replace(/\s+/g, '');
    if (!modelToPull) return;

    if (this.dom.customModelInput.value.trim()) {
      this.dom.customModelInput.value = modelToPull;
    }

    this.dom.pullModelBtn.disabled = true;
    this.dom.pullProgressBox.classList.remove('hidden');
    this.dom.pullStatusText.textContent = `PULLING ${modelToPull}...`;
    this.dom.pullPercentText.textContent = '0%';
    this.dom.pullProgressBar.style.width = '2%';

    try {
      const response = await fetch('/api/ollama/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: modelToPull,
          baseUrl: this.dom.baseUrlInput.value.trim()
        })
      });

      if (!response.ok || !response.body) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }
          if (evt.error) {
            throw new Error(evt.error);
          }
          if (evt.status) {
            this.dom.pullStatusText.textContent = evt.status.toUpperCase();
          }
          if (evt.completed && evt.total) {
            const pct = Math.min(
              100,
              Math.round((evt.completed / evt.total) * 100)
            );
            this.dom.pullPercentText.textContent = `${pct}%`;
            this.dom.pullProgressBar.style.width = `${pct}%`;
          }
        }
      }

      this.dom.pullStatusText.textContent = `${modelToPull} READY`;
      this.dom.pullPercentText.textContent = '100%';
      this.dom.pullProgressBar.style.width = '100%';

      await this.refreshModelsAndTelemetry();
      this.dom.modelSelect.value = modelToPull;

      const msg = `Sir, the neural core ${modelToPull} has been successfully installed into local Ollama storage and is ready for operation.`;
      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S.',
        content: msg,
        speechText: msg,
        badge: 'NEURAL CORE DEPLOYED'
      });
      this.audio.speak(msg);
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : 'Pull failed';
      this.dom.pullStatusText.textContent = `ERROR: ${errMsg}`;
    } finally {
      this.dom.pullModelBtn.disabled = false;
    }
  }

  /**
   * Renders markdown code blocks with a holographic header & [COPY CODE] button, plus inline code.
   * @param {HTMLElement} container
   * @param {string} rawText
   */
  _renderRichBody(container, rawText) {
    container.innerHTML = '';
    if (!rawText) return;

    // Clean up raw LaTeX wrappers if an LLM emits them, transforming into clean readable text
    const cleanText = rawText
      .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => {
        return inner
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\times/g, '×')
          .replace(/\\cdot/g, '·')
          .replace(/\\approx/g, '≈')
          .replace(/\\le/g, '≤')
          .replace(/\\ge/g, '≥')
          .trim();
      })
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => {
        return inner
          .replace(/\\text\{([^}]+)\}/g, '$1')
          .replace(/\\times/g, '×')
          .replace(/\\cdot/g, '·')
          .replace(/\\approx/g, '≈')
          .replace(/\\le/g, '≤')
          .replace(/\\ge/g, '≥')
          .trim();
      });

    const parts = cleanText.split(/(```[\s\S]*?```)/g);
    for (const part of parts) {
      if (part.startsWith('```') && part.endsWith('```')) {
        const inner = part.slice(3, -3);
        const firstNewline = inner.indexOf('\n');
        const lang =
          firstNewline !== -1
            ? inner.slice(0, firstNewline).trim() || 'CODE'
            : 'CODE';
        const codeContent =
          firstNewline !== -1 ? inner.slice(firstNewline + 1) : inner;

        const block = document.createElement('div');
        block.className = 'hud-code-block';

        const header = document.createElement('div');
        header.className = 'hud-code-header';

        const langSpan = document.createElement('span');
        langSpan.textContent = `// ${lang.toUpperCase()}`;

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'hud-copy-btn';
        copyBtn.textContent = '[COPY CODE]';
        copyBtn.addEventListener('click', () => {
          this.audio.playHudClick(2100);
          navigator.clipboard?.writeText(codeContent).then(() => {
            copyBtn.textContent = '[COPIED ✓]';
            setTimeout(() => {
              copyBtn.textContent = '[COPY CODE]';
            }, 1800);
          });
        });

        header.appendChild(langSpan);
        header.appendChild(copyBtn);

        const pre = document.createElement('pre');
        pre.className = 'hud-code-pre';
        pre.textContent = codeContent;

        block.appendChild(header);
        block.appendChild(pre);
        container.appendChild(block);
      } else if (part) {
        const inlineParts = part.split(/(`[^`\n]+`)/g);
        for (const ip of inlineParts) {
          if (ip.startsWith('`') && ip.endsWith('`') && ip.length > 2) {
            const codeEl = document.createElement('code');
            codeEl.className = 'hud-inline-code';
            codeEl.textContent = ip.slice(1, -1);
            container.appendChild(codeEl);
          } else if (ip) {
            container.appendChild(document.createTextNode(ip));
          }
        }
      }
    }
  }

  handleExportMarkdownReport() {
    const lines = [
      `# J.A.R.V.I.S. // MARK LXXXV TACTICAL COMMUNICATIONS REPORT`,
      `- **Generated At**: ${new Date().toLocaleString('zh-TW')}`,
      `- **Active Neural Provider**: ${this.dom.providerSelect.value.toUpperCase()}`,
      `---`,
      ``
    ];

    if (this.conversationHistory.length === 0) {
      lines.push('_No recorded transmissions in current session._');
    } else {
      for (const msg of this.conversationHistory) {
        const timeTag = msg.timestamp
          ? ` [${this._formatDateTime(new Date(msg.timestamp))}]`
          : '';
        const speaker =
          msg.role === 'user'
            ? `### 👤 ${this.dom.honorificInput.value || 'Sir'}${timeTag}`
            : `### 🤖 J.A.R.V.I.S.${timeTag}`;
        lines.push(speaker);
        lines.push('');
        lines.push(msg.content);
        lines.push('');
        lines.push('---');
        lines.push('');
      }
    }

    const blob = new Blob([lines.join('\n')], {
      type: 'text/markdown;charset=utf-8'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `JARVIS_Tactical_Report_${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  openCommandPalette() {
    if (!this.dom.commandPaletteModal) return;
    this.audio.playHudClick(2150);
    this.dom.commandPaletteModal.classList.remove('hidden');
    if (this.dom.cmdPaletteInput) {
      this.dom.cmdPaletteInput.value = '';
      this._renderCommandPaletteItems('');
      setTimeout(() => this.dom.cmdPaletteInput.focus(), 40);
    }
  }

  closeCommandPalette() {
    if (!this.dom.commandPaletteModal) return;
    this.audio.playHudClick(1400);
    this.dom.commandPaletteModal.classList.add('hidden');
  }

  _renderCommandPaletteItems(filterText = '') {
    if (!this.dom.cmdPaletteList) return;
    this.dom.cmdPaletteList.innerHTML = '';

    const directives = [
      {
        title: '🛡️ Run Cyber-Security & Localhost TCP Port Scan (本機連接埠與網路延遲掃描)',
        tag: 'CYBER SECURITY',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請執行本機連接埠與網路資安掃描 (Port Scan & Latency Check)，檢查目前開啟的本機服務與網路延遲。'
          )
      },
      {
        title: '🌅 Stark Morning Briefing (早安綜合簡報：高雄/台北天氣 + 黃金/股市 + 新聞 + 待辦)',
        tag: 'DAILY BRIEFING',
        action: () =>
          this.handleSendMessage(
            '早安 JARVIS，請為我進行今日晨間綜合簡報（包含高雄與台北即時天氣、黃金金價漲勢、台美股金融行情、台灣與科技頭條新聞以及我的待辦事項）。'
          )
      },
      {
        title: '🥇 Gold Price Rally & Taiwan Conversion (國際黃金金價漲勢與台灣每台錢換算)',
        tag: 'GOLD BULLION',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請幫我查詢目前國際黃金金價 (GC=F) 的最新報價、近期 5 日漲勢表現與高低區間，並換算成台灣黃金每台錢與每盎司台幣參考價格。'
          )
      },
      {
        title: '💻 PHLX Semiconductor & VIX Index (費城半導體指數、恐慌指數與美債殖利率)',
        tag: 'MACRO SENTINEL',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請幫我查詢費城半導體指數 (^SOX)、恐慌指數 (^VIX) 以及美國10年期公債殖利率 (^TNX) 的最新市場行情。'
          )
      },
      {
        title: '⛽ Taiwan CPC Fuel Prices & Crude Oil (台灣中油即時油價、牌價與國際原油行情)',
        tag: 'FUEL TELEMETRY',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請查詢台灣中油目前最新公佈的 92、95、98 無鉛汽油與柴油每公升牌價，以及國際原油的走勢指標。'
          )
      },
      {
        title: '💴 JPY/TWD Exchange Rate & Currency Intel (日圓兌台幣即時匯率與換匯行情)',
        tag: 'FX MATRIX',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請幫我查詢日圓兌新台幣 (JPYTWD=X) 的最新即時匯率與換匯行情。'
          )
      },
      {
        title: '🤗 Hugging Face Trending Models & Daily Papers (HF 開源熱門模型與每日精選論文)',
        tag: 'AI RADAR',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請檢索 Hugging Face 目前最熱門的開源 AI 模型榜單與今日精選學術論文。'
          )
      },
      {
        title: '👽 Reddit r/LocalLLaMA Hot Intel (本地開源大模型社群最新突破與熱議話題)',
        tag: 'LOCAL LLM RADAR',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請搜尋 Reddit r/LocalLLaMA 社群目前最新熱議的本地開源大模型突破與話題。'
          )
      },

      {
        title: '🎧 Toggle Stark Workshop Ambient Reactor Hum (切換史塔克實驗室反應爐背景白噪音)',
        tag: 'AUDIO DSP',
        action: () => {
          const active = this.audio.setAmbientHum(!this.audio.ambientHumEnabled);
          if (this.dom.toggleAmbientHumBtn) {
            this._updateToggleChip(this.dom.toggleAmbientHumBtn, active);
          }
        }
      },
      {
        title: '⏱️ Start 10-Minute Tactical Countdown Timer (啟動 10 分鐘戰術倒數計時)',
        tag: 'TIMER',
        action: () => this.startTacticalTimer(600)
      },
      {
        title: '🪐 SolarSystem(太陽系) // 3D Planetary Simulation (啟動太陽系)',
        tag: 'SIMULATION',
        action: () => {
          this.launchSolarSystem();
        }
      },
      {
        title: '📡 IP Scanner(網路雷達) // LAN Scanner & Radar (啟動網路雷達)',
        tag: 'RADAR',
        action: () => {
          this.launchIpScanner();
        }
      },
      {
        title: '🎯 Toggle Focus Layout — Hide Side Panels (切換專注版面 Ctrl+Shift+F)',
        tag: 'LAYOUT',
        action: () => this.setFocusLayout(!this.focusLayout)
      },
      {
        title: '🗂️ Collapse All HUD Panels 01–08 (全部收合)',
        tag: 'LAYOUT',
        action: () => this.setAllSectionsCollapsed(true)
      },
      {
        title: '📂 Expand All HUD Panels 01–08 (全部展開)',
        tag: 'LAYOUT',
        action: () => this.setAllSectionsCollapsed(false)
      },
      {
        title: '🌋 Recent Earthquakes Near Taiwan (台灣近期地震查詢 USGS)',
        tag: 'SEISMIC',
        action: () =>
          this.handleSendMessage('JARVIS，請幫我查詢台灣附近最近一週的地震紀錄，有沒有比較大的地震？')
      },
      {
        title: '🌆 End-of-Day Tactical Debrief & Markdown Export (下班工作回顧與總結)',
        tag: 'AUTOMATION',
        action: () =>
          this.handleSendMessage('JARVIS，請為我生成今日工作總結與下班戰術回顧 (End-of-Day Tactical Debrief)，核對今日任務並匯出戰術日誌。')
      },
      {
        title: '🌐 Check Localhost Dev Services Health (檢查本機開發伺服器與 Ollama 心跳)',
        tag: 'SENTINEL',
        action: () =>
          this.handleSendMessage('JARVIS，請執行本機連接埠與資安掃描，檢查 Ollama 與本地開發服務健康狀態。')
      },
      {
        title: '💻 Search GitHub Trending AI Repositories (搜尋 GitHub 熱門開源專案)',
        tag: 'STARK R&D',
        action: () =>
          this.handleSendMessage('JARVIS，請幫我搜尋 GitHub 上最熱門的 AI Agent 開源專案。')
      },
      {
        title: '🔥 Silicon Valley HackerNews Top Stories (矽谷 HackerNews 科技頭條)',
        tag: 'TECH FEED',
        action: () =>
          this.handleSendMessage('JARVIS，請幫我查詢今天矽谷 HackerNews 最熱門的科技創業頭條。')
      },
      {
        title: '🧮 Quantum Sandbox: SHA-256 & Math Evaluator (量子沙盒精確計算與雜湊)',
        tag: 'SANDBOX',
        action: () =>
          this.handleSendMessage(
            'JARVIS，請幫我精確計算 sha256: STARK-MARK-85 以及 (256 * 1024) / 8 的數值。'
          )
      },
      {
        title: '💱 Live Currency & Unit Converter (即時外匯與公英制單位精準換算)',
        tag: 'CONVERTER',
        action: () =>
          this.handleSendMessage('JARVIS，請幫我精準換算：3000 美金等於多少台幣？以及 250 磅等於幾公斤？')
      },
      {
        title: '🎨 Switch Suit Theme: HULKBUSTER XLIV (切換浩克毀滅者裝甲主題)',
        tag: 'HUD THEME',
        action: () => {
          this.dom.suitThemeSelect.value = 'hulkbuster';
          this.applySuitTheme('hulkbuster');
          this._saveSettings();
        }
      },
      {
        title: '🎨 Switch Suit Theme: STEALTH MK XV (切換夜行匿蹤裝甲主題)',
        tag: 'HUD THEME',
        action: () => {
          this.dom.suitThemeSelect.value = 'stealth';
          this.applySuitTheme('stealth');
          this._saveSettings();
        }
      },
      {
        title: '🎨 Switch Suit Theme: MARK LXXXV (切換經典馬克 85 號青金主題)',
        tag: 'HUD THEME',
        action: () => {
          this.dom.suitThemeSelect.value = 'mark85';
          this.applySuitTheme('mark85');
          this._saveSettings();
        }
      },
      {
        title: '📥 Export Session Report as Markdown (.MD 戰術簡報匯出)',
        tag: 'EXPORT',
        action: () => this.handleExportMarkdownReport()
      }
    ];

    const q = filterText.trim().toLowerCase();
    const matched = directives.filter(
      (d) => !q || d.title.toLowerCase().includes(q) || d.tag.toLowerCase().includes(q)
    );

    for (const item of matched) {
      const row = document.createElement('div');
      row.className = 'cmd-palette-item';

      const titleSpan = document.createElement('span');
      titleSpan.textContent = item.title;

      const tagSpan = document.createElement('span');
      tagSpan.className = 'cmd-palette-tag';
      tagSpan.textContent = item.tag;

      row.appendChild(titleSpan);
      row.appendChild(tagSpan);

      row.addEventListener('click', () => {
        this.closeCommandPalette();
        item.action();
      });

      this.dom.cmdPaletteList.appendChild(row);
    }
  }

  // ---------------------------------------------------------------------------
  // Holographic Telemetry Trend Analyzer (5, 10, 30, 60 Mins)
  // ---------------------------------------------------------------------------

  openTelemetryTrendModal(metric = 'cpu') {
    if (!this.dom.telemetryTrendModal) return;
    this.audio.playHudClick(2100);
    this.trendActiveMetric = metric;
    this._updateTrendTabsUi();
    this.dom.telemetryTrendModal.classList.remove('hidden');
    this.fetchAndRenderTrend();

    if (this.trendRefreshTimer) {
      clearInterval(this.trendRefreshTimer);
    }
    this.trendRefreshTimer = setInterval(() => {
      this.fetchAndRenderTrend(true);
    }, 3000);
  }

  closeTelemetryTrendModal() {
    if (!this.dom.telemetryTrendModal) return;
    this.audio.playHudClick(1400);
    this.dom.telemetryTrendModal.classList.add('hidden');
    if (this.trendRefreshTimer) {
      clearInterval(this.trendRefreshTimer);
      this.trendRefreshTimer = null;
    }
  }

  async fetchAndRenderTrend(isSilent = false) {
    try {
      const res = await fetch(`/api/telemetry/history?minutes=${this.trendActiveMinutes}`);
      if (!res.ok) return;
      this.trendData = await res.json();
      this._updateTrendStatsUi();
      this.renderTrendCanvas();
    } catch (err) {
      if (!isSilent) console.warn('[J.A.R.V.I.S. TREND]', err.message);
    }
  }

  _updateTrendTabsUi() {
    const metricLabels = {
      cpu: 'CPU LOAD',
      ram: 'RAM ALLOCATION',
      gpu: 'GPU LOAD',
      gpuMem: 'GPU VRAM'
    };
    if (this.dom.trendTargetBadge) {
      this.dom.trendTargetBadge.textContent = metricLabels[this.trendActiveMetric] || 'CPU LOAD';
    }
    if (this.dom.cpuTrendTabBtn) {
      this.dom.cpuTrendTabBtn.classList.toggle('active', this.trendActiveMetric === 'cpu');
    }
    if (this.dom.ramTrendTabBtn) {
      this.dom.ramTrendTabBtn.classList.toggle('active', this.trendActiveMetric === 'ram');
    }
    if (this.dom.gpuTrendTabBtn) {
      this.dom.gpuTrendTabBtn.classList.toggle('active', this.trendActiveMetric === 'gpu');
    }
    if (this.dom.gpuMemTrendTabBtn) {
      this.dom.gpuMemTrendTabBtn.classList.toggle('active', this.trendActiveMetric === 'gpuMem');
    }
    document.querySelectorAll('.range-tab-btn').forEach((btn) => {
      const mins = Number(btn.getAttribute('data-minutes'));
      btn.classList.toggle('active', mins === this.trendActiveMinutes);
    });

    if (this.dom.trendFooterTelemetry) {
      if (this.trendActiveMinutes > 60) {
        const hrs = this.trendActiveMinutes / 60;
        this.dom.trendFooterTelemetry.textContent = `SAMPLING: 60s • ARCHIVE: ${hrs}H DIURNAL BUFFER • LIVE SYNCHRONIZED`;
      } else {
        this.dom.trendFooterTelemetry.textContent = `SAMPLING: 5s • BUFFER: HIGH-RES (${this.trendActiveMinutes}M) • LIVE SYNCHRONIZED`;
      }
    }
  }

  _updateTrendStatsUi() {
    let sum = null;
    if (this.trendActiveMetric === 'cpu') sum = this.trendData?.summary?.cpu;
    else if (this.trendActiveMetric === 'ram') sum = this.trendData?.summary?.ram;
    else if (this.trendActiveMetric === 'gpu') sum = this.trendData?.summary?.gpu;
    else if (this.trendActiveMetric === 'gpuMem') sum = this.trendData?.summary?.gpuMem;

    if (!sum || sum.available === false) {
      if (this.dom.trendStatCurrent) this.dom.trendStatCurrent.textContent = '--%';
      if (this.dom.trendStatPeak) this.dom.trendStatPeak.textContent = '--%';
      if (this.dom.trendStatAvg) this.dom.trendStatAvg.textContent = '--%';
      if (this.dom.trendStatMin) this.dom.trendStatMin.textContent = '--%';
      return;
    }

    if (this.dom.trendStatCurrent) this.dom.trendStatCurrent.textContent = `${sum.current}%`;
    if (this.dom.trendStatPeak) this.dom.trendStatPeak.textContent = `${sum.max}%`;
    if (this.dom.trendStatAvg) this.dom.trendStatAvg.textContent = `${sum.avg}%`;
    if (this.dom.trendStatMin) this.dom.trendStatMin.textContent = `${sum.min}%`;
  }

  renderTrendCanvas() {
    const canvas = this.dom.telemetryTrendCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = rect.width || 700;
    const height = rect.height || 240;

    if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
    }
    ctx.resetTransform();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const padLeft = 40;
    const padRight = 20;
    const padTop = 20;
    const padBottom = 26;
    const plotWidth = width - padLeft - padRight;
    const plotHeight = height - padTop - padBottom;

    // 1. Horizontal grid lines (0%, 25%, 50%, 75%, 100%)
    const gridSteps = [0, 25, 50, 75, 100];
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '10px monospace';

    for (const pct of gridSteps) {
      const y = padTop + plotHeight - (pct / 100) * plotHeight;
      ctx.strokeStyle = pct === 0 ? 'rgba(0, 240, 255, 0.4)' : 'rgba(0, 240, 255, 0.1)';
      ctx.lineWidth = pct === 0 ? 1.5 : 1;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotWidth, y);
      ctx.stroke();

      ctx.fillStyle = pct === 100 ? '#ff4d6a' : 'rgba(164, 198, 228, 0.7)';
      ctx.fillText(`${pct}%`, padLeft - 6, y);
    }

    // 2. Alert threshold dashed line at 90%
    const y90 = padTop + plotHeight - (90 / 100) * plotHeight;
    ctx.strokeStyle = 'rgba(255, 77, 106, 0.55)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padLeft, y90);
    ctx.lineTo(padLeft + plotWidth, y90);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(255, 77, 106, 0.85)';
    ctx.textAlign = 'left';
    ctx.font = '9px monospace';
    ctx.fillText('CRITICAL THRESHOLD (90%)', padLeft + 6, y90 - 7);

    // 3. Extract points for selected metric
    const points = this.trendData?.points || [];
    if (points.length < 2) {
      ctx.fillStyle = 'rgba(0, 240, 255, 0.5)';
      ctx.textAlign = 'center';
      ctx.font = '12px monospace';
      ctx.fillText('GATHERING TELEMETRY VECTORS...', width / 2, height / 2);
      return;
    }

    const metricConfigs = {
      cpu: { label: 'CPU LOAD', color: '#00f0ff', fill: 'rgba(0, 240, 255, 0.16)' },
      ram: { label: 'RAM ALLOCATION', color: '#00ff9d', fill: 'rgba(0, 255, 157, 0.16)' },
      gpu: { label: 'GPU LOAD', color: '#ffaa00', fill: 'rgba(255, 170, 0, 0.16)' },
      gpuMem: { label: 'GPU VRAM', color: '#c084fc', fill: 'rgba(192, 132, 252, 0.16)' }
    };
    const activeCfg = metricConfigs[this.trendActiveMetric] || metricConfigs.cpu;
    const mainColor = activeCfg.color;
    const fillColor = activeCfg.fill;

    // Check if GPU telemetry is unavailable for GPU/VRAM metrics
    const isGpuMetric = this.trendActiveMetric === 'gpu' || this.trendActiveMetric === 'gpuMem';
    const gpuSummary = isGpuMetric ? this.trendData?.summary?.[this.trendActiveMetric] : null;
    if (isGpuMetric && gpuSummary && gpuSummary.available === false) {
      ctx.fillStyle = 'rgba(255, 170, 0, 0.65)';
      ctx.textAlign = 'center';
      ctx.font = '12px monospace';
      ctx.fillText('NO HARDWARE ACCELERATOR (GPU) DETECTED ON HOST', width / 2, height / 2);
      return;
    }

    const windowMins = this.trendActiveMinutes || 30;
    const now = Date.now();
    const startTime = this.trendData?.startTime ?? (now - windowMins * 60 * 1000);
    const endTime = this.trendData?.endTime ?? now;
    const timeSpan = Math.max(1000, endTime - startTime);

    const coords = points.map((p) => {
      let val = 0;
      if (this.trendActiveMetric === 'cpu') val = typeof p.cpu === 'number' ? p.cpu : 0;
      else if (this.trendActiveMetric === 'ram') val = typeof p.ram === 'number' ? p.ram : 0;
      else if (this.trendActiveMetric === 'gpu') val = typeof p.gpu === 'number' ? p.gpu : 0;
      else if (this.trendActiveMetric === 'gpuMem') val = typeof p.gpuMemoryPercent === 'number' ? p.gpuMemoryPercent : 0;

      const frac = Math.max(0, Math.min(1, (p.timestamp - startTime) / timeSpan));
      const x = padLeft + frac * plotWidth;
      const y = padTop + plotHeight - (Math.max(0, Math.min(100, val)) / 100) * plotHeight;
      return { x, y, val, timestamp: p.timestamp };
    });

    // 4. Area fill gradient under curve
    const areaGradient = ctx.createLinearGradient(0, padTop, 0, padTop + plotHeight);
    areaGradient.addColorStop(0, fillColor);
    areaGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');

    ctx.fillStyle = areaGradient;
    ctx.beginPath();
    ctx.moveTo(coords[0].x, padTop + plotHeight);
    for (const c of coords) {
      ctx.lineTo(c.x, c.y);
    }
    ctx.lineTo(coords[coords.length - 1].x, padTop + plotHeight);
    ctx.closePath();
    ctx.fill();

    // 5. Draw neon trend polyline
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2;
    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(coords[0].x, coords[0].y);
    for (let i = 1; i < coords.length; i++) {
      ctx.lineTo(coords[i].x, coords[i].y);
    }
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 6. Current latest pulse dot
    const latest = coords[coords.length - 1];
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(latest.x, latest.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(latest.x, latest.y, 6, 0, Math.PI * 2);
    ctx.stroke();

    // 7. Time axis ticks & subtle vertical grid lines (-Xm ... NOW)
    let tickStepMins = 5;
    if (windowMins <= 5) tickStepMins = 1;
    else if (windowMins <= 10) tickStepMins = 2;
    else if (windowMins <= 30) tickStepMins = 6;
    else if (windowMins <= 60) tickStepMins = 15;
    else if (windowMins <= 480) tickStepMins = 120; // 8H -> every 2 hours: -8H, -6H, -4H, -2H, NOW
    else if (windowMins <= 720) tickStepMins = 180; // 12H -> every 3 hours
    else tickStepMins = 360; // 24H -> every 6 hours

    const tickCount = Math.round(windowMins / tickStepMins);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = '9px monospace';

    for (let i = 0; i <= tickCount; i++) {
      const minsAgo = windowMins - i * tickStepMins;
      const frac = (windowMins - minsAgo) / windowMins;
      const x = padLeft + frac * plotWidth;

      if (i > 0 && i < tickCount) {
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 4]);
        ctx.beginPath();
        ctx.moveTo(x, padTop);
        ctx.lineTo(x, padTop + plotHeight);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      let label = 'NOW';
      if (minsAgo > 0) {
        if (minsAgo >= 60) {
          const hrs = minsAgo / 60;
          label = `-${hrs % 1 === 0 ? hrs : hrs.toFixed(1)}H`;
        } else {
          label = `-${minsAgo}M`;
        }
      }
      ctx.fillStyle = 'rgba(164, 198, 228, 0.75)';
      ctx.fillText(label, x, padTop + plotHeight + 6);
    }

    // 8. Hover crosshair
    if (this.trendHoverIndex >= 0 && this.trendHoverIndex < coords.length) {
      const hoverCoord = coords[this.trendHoverIndex];
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);

      ctx.beginPath();
      ctx.moveTo(hoverCoord.x, padTop);
      ctx.lineTo(hoverCoord.x, padTop + plotHeight);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(padLeft, hoverCoord.y);
      ctx.lineTo(padLeft + plotWidth, hoverCoord.y);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(hoverCoord.x, hoverCoord.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(hoverCoord.x, hoverCoord.y, 7, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * Builds an inline Holographic SVG Sparkline Chart for 5-day Gold/Market trends.
   * @param {number[]} points
   * @param {number} [changePercent=0]
   * @returns {SVGElement | null}
   */
  _createSparklineSvg(points, changePercent = 0) {
    if (!Array.isArray(points) || points.length < 2) return null;
    const width = 76;
    const height = 22;
    const pad = 3;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const strokeColor = changePercent >= 0 ? '#00ff9d' : '#ff3344';

    const coords = points.map((val, idx) => {
      const x = pad + (idx / (points.length - 1)) * (width - pad * 2);
      const y = height - pad - ((val - min) / range) * (height - pad * 2);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.setAttribute('class', 'hud-sparkline');

    const polyline = document.createElementNS(ns, 'polyline');
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', strokeColor);
    polyline.setAttribute('stroke-width', '1.8');
    polyline.setAttribute('stroke-linecap', 'round');
    polyline.setAttribute('stroke-linejoin', 'round');
    polyline.setAttribute('points', coords.join(' '));
    svg.appendChild(polyline);

    const lastCoord = coords[coords.length - 1].split(',');
    const dot = document.createElementNS(ns, 'circle');
    dot.setAttribute('cx', lastCoord[0]);
    dot.setAttribute('cy', lastCoord[1]);
    dot.setAttribute('r', '2.3');
    dot.setAttribute('fill', strokeColor);
    svg.appendChild(dot);

    return svg;
  }

  _formatDateTime(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day} ${hh}:${mm}:${ss}`;
  }

  appendMessage({
    role,
    sender,
    content,
    speechText,
    badge,
    sources = [],
    launchAction = null,
    skipPersist = false,
    timestamp = null
  }) {
    const card = document.createElement('div');
    card.className = `msg-card ${role === 'user' ? 'user' : 'jarvis'}`;

    const msgTime = timestamp ? new Date(timestamp) : new Date();
    const timeString = this._formatDateTime(msgTime);

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const leftCluster = document.createElement('div');
    leftCluster.className = 'msg-meta-left';

    const senderEl = document.createElement('span');
    senderEl.className = 'msg-sender';
    senderEl.textContent = sender;

    const timeEl = document.createElement('span');
    timeEl.className = 'msg-time';
    timeEl.textContent = timeString;
    timeEl.title = `Transmission Datetime: ${timeString}`;

    leftCluster.appendChild(senderEl);
    leftCluster.appendChild(timeEl);

    const badgeEl = document.createElement('span');
    badgeEl.className = 'msg-badge';
    badgeEl.textContent = badge || timeString;

    meta.appendChild(leftCluster);
    meta.appendChild(badgeEl);

    const body = document.createElement('div');
    body.className = 'msg-body';
    this._renderRichBody(body, content);

    card.appendChild(meta);
    card.appendChild(body);

    const allLinks = [...(Array.isArray(sources) ? sources : [])];
    if (launchAction && launchAction.url) {
      allLinks.unshift({
        title: `🚀 LAUNCH TARGET: ${launchAction.label}`,
        link: launchAction.url,
        source: 'SYSTEM LAUNCHER'
      });
    }

    if (allLinks.length > 0) {
      const sourcesBox = document.createElement('div');
      sourcesBox.className = 'msg-sources';

      const titleEl = document.createElement('div');
      titleEl.className = 'msg-sources-title';
      titleEl.textContent = 'SATELLITE WEB UPLINK // VERIFIED SOURCES & LIVE LINKS';
      sourcesBox.appendChild(titleEl);

      allLinks.slice(0, 6).forEach((item) => {
        if (!item.link) return;
        const linkEl = document.createElement('a');
        linkEl.className = 'source-link-card';
        linkEl.href = item.link;
        linkEl.target = '_blank';
        linkEl.rel = 'noopener noreferrer';

        const textSpan = document.createElement('span');
        textSpan.textContent = item.title || item.link;

        const rightCluster = document.createElement('span');
        rightCluster.className = 'source-right-cluster';

        if (Array.isArray(item.sparklinePoints) && item.sparklinePoints.length >= 2) {
          const sparkSvg = this._createSparklineSvg(
            item.sparklinePoints,
            Number(item.changePercent) || 0
          );
          if (sparkSvg) {
            rightCluster.appendChild(sparkSvg);
          }
        }

        const tagSpan = document.createElement('span');
        tagSpan.className = 'source-tag';
        tagSpan.textContent = item.source || 'LIVE FEED';
        rightCluster.appendChild(tagSpan);

        linkEl.appendChild(textSpan);
        linkEl.appendChild(rightCluster);
        sourcesBox.appendChild(linkEl);
      });

      card.appendChild(sourcesBox);
    }

    if (role === 'assistant' && speechText) {
      const actions = document.createElement('div');
      actions.className = 'msg-actions';

      const replayBtn = document.createElement('button');
      replayBtn.type = 'button';
      replayBtn.className = 'msg-replay-btn';
      replayBtn.textContent = '[REPLAY VOICE TRANSMISSION]';
      replayBtn.addEventListener('click', () => {
        this.audio.playHudClick();
        this.audio.speak(speechText);
      });

      actions.appendChild(replayBtn);
      card.appendChild(actions);
    }

    this.dom.commsConsole.appendChild(card);
    this.dom.commsConsole.scrollTop = this.dom.commsConsole.scrollHeight;

    if (!skipPersist) {
      this.persistedLogCards.push({
        role,
        sender,
        content,
        speechText,
        badge: badgeEl.textContent,
        timestamp: msgTime.getTime(),
        sources: Array.isArray(sources) ? sources.slice(0, 6) : [],
        launchAction
      });
      this._saveChatHistory();
    }

    return { card, body, badgeEl, timeEl };
  }

  launchSolarSystem() {
    this.audio.playHudClick(1700);
    window.open('/solarSystem/index.html', '_blank', 'noopener,noreferrer');
  }

  async launchIpScanner() {
    this.audio.playHudClick(1700);
    this.audio.speak('Sir，已為您啟動 IP Scanner 網路雷達系統。');
    try {
      const res = await fetch('/api/launch/ip-scanner', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        const url = data.webUrl || (data.port ? `http://localhost:${data.port}` : 'http://localhost:63210');
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
    } catch (err) {
      console.warn('[J.A.R.V.I.S.] Failed to launch IP Scanner:', err);
    }
    window.open('http://localhost:63210', '_blank', 'noopener,noreferrer');
  }

  startTacticalTimer(durationSeconds) {
    this.stopTacticalTimer();
    this.timerRemainingSeconds = durationSeconds;
    this.audio.playHudClick(2100);

    const updateBadge = () => {
      const m = String(Math.floor(this.timerRemainingSeconds / 60)).padStart(2, '0');
      const s = String(this.timerRemainingSeconds % 60).padStart(2, '0');
      if (this.dom.timerDisplayBadge) {
        this.dom.timerDisplayBadge.textContent = `TIMER: ${m}:${s}`;
      }
    };

    updateBadge();
    this.timerInterval = setInterval(() => {
      this.timerRemainingSeconds -= 1;
      updateBadge();
      if (this.timerRemainingSeconds <= 0) {
        this.stopTacticalTimer();
        this.audio.playBootSequence();
        const honorific = this.dom.honorificInput.value || 'Sir';
        const alertMsg = `${honorific}，您設定的戰術倒數計時已結束。Sir, your scheduled tactical countdown timer has concluded.`;
        this.appendMessage({
          role: 'assistant',
          sender: 'J.A.R.V.I.S. // TACTICAL TIMER',
          content: alertMsg,
          speechText: alertMsg,
          badge: 'TIMER COMPLETE'
        });
        this.audio.speak(alertMsg);
      }
    }, 1000);
  }

  stopTacticalTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.timerRemainingSeconds = 0;
    if (this.dom.timerDisplayBadge) {
      this.dom.timerDisplayBadge.textContent = 'TIMER: 00:00';
    }
  }

  async refreshVault() {
    try {
      const res = await fetch('/api/vault');
      if (!res.ok) return;
      this.lastVaultState = await res.json();
      this._renderVault(this.lastVaultState);
    } catch (error) {
      console.warn('[J.A.R.V.I.S.] Vault refresh failed:', error);
    }
    this.pollSentinelAlerts();
  }

  _renderVault(state) {
    if (!this.dom.vaultListContainer) return;
    this.dom.vaultListContainer.innerHTML = '';

    const tasks = state.tasks || [];
    const memories = state.memories || [];
    const watchlist = state.watchlist || [];
    const alerts = this.priceAlerts || [];

    if (tasks.length === 0 && memories.length === 0 && watchlist.length === 0 && alerts.length === 0) {
      const empty = document.createElement('div');
      empty.style.fontSize = '0.68rem';
      empty.style.color = 'var(--text-muted)';
      empty.textContent = 'Vault empty — Add tasks, memories, stock tickers, or price alerts';
      this.dom.vaultListContainer.appendChild(empty);
      return;
    }

    alerts.slice(0, 10).forEach((a) => {
      const row = document.createElement('div');
      row.className = `vault-item alert-item ${a.triggered ? 'triggered' : ''}`;

      const textSpan = document.createElement('span');
      textSpan.textContent = a.triggered
        ? `🔔 ALERT ✓ ${a.label} @ ${Number(a.triggeredPrice).toLocaleString()}`
        : `🔔 ALERT: ${a.label}`;
      textSpan.title = a.triggered
        ? `Triggered at ${new Date(a.triggeredAt).toLocaleString()}`
        : 'Armed — checked every 60 seconds';

      const delBtn = document.createElement('button');
      delBtn.className = 'vault-del-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async () => {
        await fetch(`/api/alerts?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' });
        this.refreshVault();
      });

      row.appendChild(textSpan);
      row.appendChild(delBtn);
      this.dom.vaultListContainer.appendChild(row);
    });

    watchlist.slice(0, 8).forEach((sym) => {
      const row = document.createElement('div');
      row.className = 'vault-item';

      const textSpan = document.createElement('span');
      textSpan.style.color = '#00ff9d';
      textSpan.style.cursor = 'pointer';
      textSpan.title = `Click to query live telemetry for ${sym}`;
      textSpan.textContent = `📈 WATCHLIST: ${sym}`;
      textSpan.addEventListener('click', () => {
        this.handleSendMessage(`JARVIS，請幫我查詢我的自選股 ${sym} 與目前市場的最新行情與 5 日走勢。`);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'vault-del-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async () => {
        await fetch(`/api/vault/watchlist?symbol=${encodeURIComponent(sym)}`, {
          method: 'DELETE'
        });
        this.refreshVault();
      });

      row.appendChild(textSpan);
      row.appendChild(delBtn);
      this.dom.vaultListContainer.appendChild(row);
    });

    tasks.slice(0, 8).forEach((t) => {
      const row = document.createElement('div');
      row.className = `vault-item ${t.completed ? 'completed' : ''}`;

      const textSpan = document.createElement('span');
      textSpan.style.cursor = 'pointer';
      textSpan.textContent = `${t.completed ? '[✓]' : '[ ]'} ${t.title}`;
      textSpan.addEventListener('click', async () => {
        await fetch('/api/vault/task/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: t.id })
        });
        this.refreshVault();
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'vault-del-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async () => {
        await fetch(`/api/vault/task?id=${encodeURIComponent(t.id)}`, {
          method: 'DELETE'
        });
        this.refreshVault();
      });

      row.appendChild(textSpan);
      row.appendChild(delBtn);
      this.dom.vaultListContainer.appendChild(row);
    });

    memories.slice(0, 6).forEach((m) => {
      const row = document.createElement('div');
      row.className = 'vault-item';

      const textSpan = document.createElement('span');
      textSpan.style.color = 'var(--amber)';
      textSpan.textContent = `🧠 ${m.content}`;

      const delBtn = document.createElement('button');
      delBtn.className = 'vault-del-btn';
      delBtn.textContent = '✕';
      delBtn.addEventListener('click', async () => {
        await fetch(`/api/vault/memory?id=${encodeURIComponent(m.id)}`, {
          method: 'DELETE'
        });
        this.refreshVault();
      });

      row.appendChild(textSpan);
      row.appendChild(delBtn);
      this.dom.vaultListContainer.appendChild(row);
    });
  }

  async handleAddVaultTask() {
    const val = this.dom.vaultInput?.value.trim();
    if (!val) return;
    this.dom.vaultInput.value = '';
    this.audio.playHudClick();
    await fetch('/api/vault/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: val })
    });
    this.refreshVault();
  }

  async handleAddVaultMemory() {
    const val = this.dom.vaultInput?.value.trim();
    if (!val) return;
    this.dom.vaultInput.value = '';
    this.audio.playHudClick();
    await fetch('/api/vault/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: val })
    });
    this.refreshVault();
  }

  async handleAddVaultWatchlist() {
    const val = this.dom.vaultInput?.value.trim();
    if (!val) return;
    this.dom.vaultInput.value = '';
    this.audio.playHudClick(2050);
    await fetch('/api/vault/watchlist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: val })
    });
    this.refreshVault();
  }

  handleFileLoaded(file) {
    this.audio.playHudClick(1950);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => {
        this.pendingImageDataUrl = String(reader.result || '');
        this.pendingAttachment = null;
        this._showAttachmentBanner(`OPTIC IMAGE LOADED: ${file.name}`, this.pendingImageDataUrl);
      };
      reader.readAsDataURL(file);
    } else {
      const reader = new FileReader();
      reader.onload = () => {
        const content = String(reader.result || '');
        this.pendingAttachment = { name: file.name, content };
        this.pendingImageDataUrl = '';
        this._showAttachmentBanner(
          `FILE LOADED: ${file.name} (${(file.size / 1024).toFixed(1)} KB)`,
          ''
        );
      };
      reader.readAsText(file);
    }
  }

  async handleScanScreen() {
    this.audio.playHudClick(2100);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' },
        audio: false
      });
      const track = stream.getVideoTracks()[0];
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      await video.play();

      const canvas = document.createElement('canvas');
      const maxW = 1280;
      const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      track.stop();
      this.pendingImageDataUrl = canvas.toDataURL('image/jpeg', 0.84);
      this.pendingAttachment = null;
      this._showAttachmentBanner(
        `OPTIC SCREEN CAPTURE READY (${canvas.width}x${canvas.height})`,
        this.pendingImageDataUrl
      );
    } catch {
      // User cancelled screen picker
    }
  }

  _showAttachmentBanner(label, imgDataUrl) {
    if (!this.dom.attachmentBanner) return;
    this.dom.attachmentBanner.classList.remove('hidden');
    this.dom.attachmentLabel.textContent = label;
    if (imgDataUrl && this.dom.opticPreviewImg) {
      this.dom.opticPreviewImg.src = imgDataUrl;
      this.dom.opticPreviewImg.classList.remove('hidden');
    } else if (this.dom.opticPreviewImg) {
      this.dom.opticPreviewImg.classList.add('hidden');
    }
  }

  clearPendingPayload() {
    this.pendingAttachment = null;
    this.pendingImageDataUrl = '';
    if (this.dom.attachmentBanner) {
      this.dom.attachmentBanner.classList.add('hidden');
    }
    if (this.dom.opticPreviewImg) {
      this.dom.opticPreviewImg.src = '';
      this.dom.opticPreviewImg.classList.add('hidden');
    }
  }

  async handleSendMessage(userText) {
    const honorific = this.dom.honorificInput.value.trim() || 'Sir';
    const provider = this.dom.providerSelect.value;
    const rawChosenModel =
      this.dom.customModelInput.value.trim() ||
      this.dom.modelSelect.value ||
      'llama3.2';
    const chosenModel = rawChosenModel.replace(/\s+/g, '');

    const attachmentToSend = this.pendingAttachment;
    const imageToSend = this.pendingImageDataUrl;
    this.clearPendingPayload();

    this.audio.stopSpeaking();
    this.audio.speechMuted = false;
    this.audio.playTelemetryChirp();

    let displayUserText = userText;
    if (attachmentToSend) {
      displayUserText += `\n[📂 Attached: ${attachmentToSend.name}]`;
    }
    if (imageToSend) {
      displayUserText += `\n[👁️ Optic Vision Frame Attached]`;
    }

    this.conversationHistory.push({
      role: 'user',
      content: userText,
      timestamp: Date.now()
    });

    this.appendMessage({
      role: 'user',
      sender: `${honorific.toUpperCase()} // COMMAND`,
      content: displayUserText,
      badge: `${provider.toUpperCase()} :: ${chosenModel}`
    });

    this.visualizer.setState('THINKING');
    this.dom.reactorStateBanner.textContent = `NEURAL & SATELLITE SYNTHESIS // ${chosenModel.toUpperCase()}`;
    this.dom.sendBtn.disabled = true;

    // Create live streaming message card
    const streamCard = this.appendMessage({
      role: 'assistant',
      sender: 'J.A.R.V.I.S.',
      content: '...',
      speechText: '',
      badge: `SYNTHESIZING // ${chosenModel}`,
      skipPersist: true
    });

    let accumulatedText = '';
    let unspokenBuffer = '';
    let finalDoneEvent = null;

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: chosenModel,
          messages: this.conversationHistory,
          personaMode: this.dom.personaSelect.value,
          language: this.dom.languageSelect.value,
          honorific,
          apiKey: this.dom.apiKeyInput.value.trim(),
          baseUrl: this.dom.baseUrlInput.value.trim(),
          webSearchEnabled: this.webSearchEnabled,
          forceWebSearch: this.forceWebSearch,
          attachment: attachmentToSend,
          imageDataUrl: imageToSend
        })
      });

      if (!response.ok || !response.body) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;
          let evt;
          try {
            evt = JSON.parse(line);
          } catch {
            continue;
          }

          if (evt.type === 'meta') {
            if (evt.vaultActionExecuted) {
              this.refreshVault();
            }
            if (evt.timerAction && evt.timerAction.executed && evt.timerAction.durationSeconds > 0) {
              this.startTacticalTimer(evt.timerAction.durationSeconds);
            }
            if (evt.launchAction) {
              if (evt.launchAction.url) {
                window.open(evt.launchAction.url, '_blank', 'noopener,noreferrer');
              } else if (evt.launchAction.type === 'ambient_hum') {
                const active = this.audio.setAmbientHum(Boolean(evt.launchAction.state));
                if (this.dom.toggleAmbientHumBtn) {
                  this._updateToggleChip(this.dom.toggleAmbientHumBtn, active);
                }
                this._saveSettings();
              }
            }
          } else if (evt.type === 'delta' && evt.text) {
            accumulatedText += evt.text;
            unspokenBuffer += evt.text;
            streamCard.body.textContent = accumulatedText;
            this.dom.commsConsole.scrollTop = this.dom.commsConsole.scrollHeight;

            // Live sentence-by-sentence TTS as soon as a sentence boundary completes
            const sentenceMatch = unspokenBuffer.match(
              /^([\s\S]*?[.!?。！？\n]+)\s+([\s\S]*)$/
            );
            if (sentenceMatch) {
              const readySentence = sentenceMatch[1].trim();
              unspokenBuffer = sentenceMatch[2];
              if (readySentence.length > 2 && !this.audio.speechMuted) {
                this.audio.enqueueSpeechSegment(readySentence);
              }
            }
          } else if (evt.type === 'done') {
            finalDoneEvent = evt;
          }
        }
      }

      // Speak remaining unspoken buffer
      if (unspokenBuffer.trim().length > 0 && !this.audio.speechMuted) {
        this.audio.enqueueSpeechSegment(unspokenBuffer.trim());
      }

      const finalReply = finalDoneEvent?.reply || accumulatedText.trim();
      const latencyMs = finalDoneEvent?.latencyMs || 0;
      const webSkill = finalDoneEvent?.webSkill;
      const launchAction = finalDoneEvent?.launchAction;

      this.dom.lastLatencyText.textContent = `${latencyMs} ms`;

      this.conversationHistory.push({
        role: 'assistant',
        content: finalReply,
        timestamp: Date.now()
      });

      const skillBadge = webSkill?.executed
        ? ` // UPLINK: ${webSkill.skill.toUpperCase()}`
        : '';

      // Replace temporary streaming card with final rich card (code blocks, copy buttons, source links, replay voice)
      streamCard.card.remove();
      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S.',
        content: finalReply,
        speechText: finalDoneEvent?.speechText || finalReply,
        badge: `${(finalDoneEvent?.provider || provider).toUpperCase()} // ${
          finalDoneEvent?.model || chosenModel
        }${skillBadge} // ${latencyMs}ms`,
        sources: webSkill?.items || [],
        launchAction
      });
    } catch (error) {
      streamCard.card.remove();
      const errMsg =
        error instanceof Error ? error.message : 'Telemetry link interrupted';
      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S. // DIAGNOSTIC ALERT',
        content: `Apologies, ${honorific}. A neural link exception occurred: ${errMsg}`,
        speechText: `Apologies, ${honorific}. A neural link exception occurred.`,
        badge: 'ALERT'
      });
      this.visualizer.setState('IDLE');
    } finally {
      this.dom.sendBtn.disabled = false;
      if (!this.audio.isSpeaking) {
        this.speechInput?.resumeAfterTts();
        if (!this.speechInput?.wakeWordMode) {
          this.visualizer.setState('IDLE');
          this.dom.reactorStateBanner.textContent =
            'ONLINE // AWAITING COMMAND, SIR';
        }
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new JarvisHudController();
});
