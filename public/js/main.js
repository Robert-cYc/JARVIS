import { JarvisAudioEngine } from './audioEngine.js';
import { ArcReactorVisualizer } from './hudVisualizer.js';
import { JarvisSpeechInput } from './speechInput.js';

const STORAGE_KEY = 'stark_jarvis_hud_config_v1';

class JarvisHudController {
  constructor() {
    this.audio = new JarvisAudioEngine();
    this.conversationHistory = [];
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
    this._bindEvents();
    this._startClock();
    this._populateVoices();

    if (window.speechSynthesis) {
      window.speechSynthesis.addEventListener('voiceschanged', () => {
        this._populateVoices();
      });
    }

    this.refreshModelsAndTelemetry();
    setInterval(() => this.refreshTelemetryOnly(), 5000);

    // Initial Boot Greeting in Comms Log
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

  _cacheDom() {
    this.dom = {
      ollamaStatusDot: document.getElementById('ollamaStatusDot'),
      activeProviderLabel: document.getElementById('activeProviderLabel'),
      arcOutputHeader: document.getElementById('arcOutputHeader'),
      hudClock: document.getElementById('hudClock'),
      bootAudioBtn: document.getElementById('bootAudioBtn'),

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
      memLoadText: document.getElementById('memLoadText'),
      memLoadBar: document.getElementById('memLoadBar'),
      cpuModelText: document.getElementById('cpuModelText'),
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
      testVoiceBtn: document.getElementById('testVoiceBtn'),
      clearHistoryBtn: document.getElementById('clearHistoryBtn')
    };
  }

  _initVisualizer() {
    this.visualizer = new ArcReactorVisualizer(
      this.dom.arcReactorCanvas,
      () => this.audio.sampleEnergy()
    );
    this.visualizer.start();

    this.audio.onSpeakingStateChange = (speaking) => {
      if (speaking) {
        this.visualizer.setState('SPEAKING');
        this.dom.reactorStateBanner.textContent =
          'VOCAL TRANSMISSION ACTIVE // J.A.R.V.I.S. SPEAKING';
      } else {
        this.visualizer.setState('IDLE');
        this.dom.reactorStateBanner.textContent =
          'ONLINE // AWAITING COMMAND, SIR';
      }
    };
  }

  _initSpeechInput() {
    this.speechInput = new JarvisSpeechInput({
      onResult: (transcript, isFinal) => {
        this.dom.userInput.value = transcript;
        if (isFinal && transcript.trim().length > 0) {
          this.handleSendMessage(transcript.trim());
        }
      },
      onStateChange: (listening) => {
        if (listening) {
          this.dom.micBtn.textContent = 'MIC: LISTENING';
          this.dom.micBtn.classList.add('amber');
          this.visualizer.setState('LISTENING');
          this.dom.reactorStateBanner.textContent =
            'AUDIO SENSORS ACTIVE // LISTENING TO SIR';
        } else {
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
    } catch {
      // Ignore corrupt storage
    }
  }

  _saveSettings() {
    try {
      const payload = {
        provider: this.dom.providerSelect.value,
        customModel: this.dom.customModelInput.value,
        baseUrl: this.dom.baseUrlInput.value,
        persona: this.dom.personaSelect.value,
        language: this.dom.languageSelect.value,
        honorific: this.dom.honorificInput.value,
        pitch: this.audio.pitch,
        rate: this.audio.rate
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota issues
    }
  }

  _bindEvents() {
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
      this.audio.stopSpeaking();
      this.audio.playHudClick(1200);
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

    document.querySelectorAll('.directive-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) {
          this.handleSendMessage(prompt);
        }
      });
    });

    this.dom.clearHistoryBtn.addEventListener('click', () => {
      this.audio.playHudClick(1400);
      this.conversationHistory = [];
      this.dom.commsConsole.innerHTML = '';
      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S.',
        content: 'Communications log purged, Sir. Ready for new directives.',
        speechText: 'Communications log purged, Sir.',
        badge: 'MEMORY CLEARED'
      });
    });
  }

  _updateToggleChip(el, active) {
    el.classList.toggle('active', active);
    const strong = el.querySelector('strong');
    if (strong) strong.textContent = active ? 'ON' : 'OFF';
    this.audio.playHudClick();
  }

  _startClock() {
    const tick = () => {
      const now = new Date();
      this.dom.hudClock.textContent = now.toTimeString().split(' ')[0];
    };
    tick();
    setInterval(tick, 1000);
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

  _renderTelemetry(t) {
    this.dom.arcOutputHeader.textContent = `${t.arcReactorOutputPercent}%`;
    this.dom.cpuLoadText.textContent = `${t.cpuUsagePercent}%`;
    this.dom.cpuLoadBar.style.width = `${t.cpuUsagePercent}%`;
    this.dom.memLoadText.textContent = `${t.memoryUsedGb} / ${t.memoryTotalGb} GB (${t.memoryUsagePercent}%)`;
    this.dom.memLoadBar.style.width = `${t.memoryUsagePercent}%`;
    this.dom.cpuModelText.textContent = t.cpuModel;
    this.dom.hostnameText.textContent = t.hostname;
    this.dom.hostPlatformBadge.textContent = t.platform;
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

  appendMessage({ role, sender, content, speechText, badge }) {
    const card = document.createElement('div');
    card.className = `msg-card ${role === 'user' ? 'user' : 'jarvis'}`;

    const meta = document.createElement('div');
    meta.className = 'msg-meta';

    const senderEl = document.createElement('span');
    senderEl.className = 'msg-sender';
    senderEl.textContent = sender;

    const badgeEl = document.createElement('span');
    badgeEl.textContent = badge || new Date().toLocaleTimeString();

    meta.appendChild(senderEl);
    meta.appendChild(badgeEl);

    const body = document.createElement('div');
    body.className = 'msg-body';
    body.textContent = content;

    card.appendChild(meta);
    card.appendChild(body);

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
  }

  async handleSendMessage(userText) {
    const honorific = this.dom.honorificInput.value.trim() || 'Sir';
    const provider = this.dom.providerSelect.value;
    const chosenModel =
      this.dom.customModelInput.value.trim() ||
      this.dom.modelSelect.value ||
      'llama3.2';

    this.audio.playTelemetryChirp();

    this.appendMessage({
      role: 'user',
      sender: `${honorific.toUpperCase()} // COMMAND`,
      content: userText,
      badge: `${provider.toUpperCase()} :: ${chosenModel}`
    });

    this.conversationHistory.push({ role: 'user', content: userText });

    this.visualizer.setState('THINKING');
    this.dom.reactorStateBanner.textContent = `NEURAL SYNTHESIS IN PROGRESS // ${chosenModel.toUpperCase()}`;
    this.dom.sendBtn.disabled = true;

    try {
      const response = await fetch('/api/chat', {
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
          baseUrl: this.dom.baseUrlInput.value.trim()
        })
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }

      this.dom.lastLatencyText.textContent = `${data.latencyMs || 0} ms`;

      this.conversationHistory.push({
        role: 'assistant',
        content: data.reply
      });

      this.appendMessage({
        role: 'assistant',
        sender: 'J.A.R.V.I.S.',
        content: data.reply,
        speechText: data.speechText || data.reply,
        badge: `${data.provider.toUpperCase()} // ${data.model} // ${data.latencyMs}ms`
      });

      this.audio.speak(data.speechText || data.reply);
    } catch (error) {
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
        this.visualizer.setState('IDLE');
        this.dom.reactorStateBanner.textContent =
          'ONLINE // AWAITING COMMAND, SIR';
      }
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  new JarvisHudController();
});
