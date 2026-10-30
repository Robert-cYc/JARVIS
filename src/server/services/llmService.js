import {
  executeWebSkillForMessage,
  detectLauncherCommand
} from './webSkillsService.js';
import {
  getVaultState,
  addMemory,
  addTask,
  detectVaultCommand,
  formatVaultContextForPrompt
} from './memoryVaultService.js';
import { getSystemTelemetry } from './telemetryService.js';

const DEFAULT_OLLAMA_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';

export const PERSONA_MODES = {
  butler: {
    name: 'Standard Butler Protocol',
    instruction:
      'Maintain your signature refined British butler demeanor: impeccably polite, composed, articulate, and subtly dry-witted. Address the user respectfully (e.g., "Sir" or "先生").'
  },
  tactical: {
    name: 'Mark LXXXV Combat & Tactical Protocol',
    instruction:
      'Prioritize rapid, high-precision tactical analysis, threat assessment, engineering telemetry, and actionable recommendations. Keep sentences crisp and mission-focused.'
  },
  witty: {
    name: 'Dry Sark-Level Sarcasm Protocol',
    instruction:
      'Dial up your dry British wit and affectionate deadpan sarcasm (as you often do with Tony Stark when he ignores safety protocols), while still delivering brilliant, accurate answers.'
  }
};

/**
 * Builds the system prompt for J.A.R.V.I.S.
 * @param {object} options
 * @param {string} [options.personaMode='butler']
 * @param {string} [options.language='auto']
 * @param {string} [options.honorific='Sir']
 * @returns {string}
 */
export function buildJarvisSystemPrompt({
  personaMode = 'witty',
  language = 'en-GB',
  honorific = 'Sir'
} = {}) {
  const modeConfig = PERSONA_MODES[personaMode] || PERSONA_MODES.butler;

  let languageRule =
    'Respond in the same language the user speaks. If the user writes in Traditional Chinese (繁體中文), respond in natural, refined Traditional Chinese with JARVIS\'s gentlemanly butler tone (e.g. addressing them as "先生" or "' +
    honorific +
    '"). If the user writes in English, respond in British English.';

  if (language === 'zh-TW') {
    languageRule =
      'Always respond in refined Traditional Chinese (繁體中文), maintaining J.A.R.V.I.S.\'s composed gentlemanly butler cadence and addressing the user as "先生" or "' +
      honorific +
      '". Occasionally include concise English technical terms where natural for Stark Industries HUD telemetry.';
  } else if (language === 'en-GB') {
    languageRule =
      'Always respond in refined British English, addressing the user as "' + honorific + '".';
  }

  return [
    'You are J.A.R.V.I.S. (Just A Rather Very Intelligent System), Tony Stark\'s advanced AI assistant managing the Stark Industries Mark LXXXV HUD and Workshop mainframe.',
    modeConfig.instruction,
    languageRule,
    'Formatting & Vocalization Rules:',
    '1. Your response will be spoken aloud via the HUD voice synthesizer AND displayed on the holographic console.',
    '2. Begin naturally in character (e.g., "Right away, Sir.", "At your service, Sir.", "先生，正在為您調閱數據。", "Indeed, Sir.") varied organically by context.',
    '3. Keep explanations clear, structured, and natural when read aloud. Avoid excessive decorative symbols or raw URLs that sound jarring in Text-to-Speech.'
  ].join('\n');
}

/**
 * Strips markdown symbols from text to create clean speech synthesis output.
 * @param {string} rawText
 * @returns {string}
 */
export function sanitizeForSpeech(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return '';
  }
  return rawText
    .replace(/```[\s\S]*?```/g, ' [Code block displayed on HUD, Sir.] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[-*_]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Queries local Ollama instance for installed models.
 * @param {string} [baseUrl]
 * @returns {Promise<{online: boolean, baseUrl: string, models: Array<{name: string, sizeGb: number, family: string}>, error?: string}>}
 */
export async function getOllamaStatus(baseUrl = DEFAULT_OLLAMA_URL) {
  const cleanUrl = baseUrl.replace(/\/+$/, '');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);
    const response = await fetch(`${cleanUrl}/api/tags`, {
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    const models = (data.models || []).map((m) => ({
      name: m.name,
      sizeGb: m.size ? Number((m.size / (1024 ** 3)).toFixed(2)) : 0,
      family: m.details?.family || 'local-gguf',
      parameterSize: m.details?.parameter_size || ''
    }));

    return {
      online: true,
      baseUrl: cleanUrl,
      models
    };
  } catch (error) {
    return {
      online: false,
      baseUrl: cleanUrl,
      models: [],
      error: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}

/**
 * Generates an in-character JARVIS offline diagnostic reply when an external LLM is not yet configured.
 */
export function generateDiagnosticFallbackReply(
  userMessage,
  reason,
  language = 'auto',
  webSkillResult = null
) {
  const isChinese =
    language === 'zh-TW' || /[\u4e00-\u9fff]/.test(userMessage || '');

  if (webSkillResult?.executed && Array.isArray(webSkillResult.items) && webSkillResult.items.length > 0) {
    const topItems = webSkillResult.items.slice(0, 6);
    if (isChinese) {
      const listText = topItems
        .map((item, i) => `${i + 1}. ${item.title}${item.source ? ` [${item.source}]` : ''}`)
        .join('\n');
      return (
        `先生，我已透過史塔克全球衛星網路（Stark Satellite Uplink）為您即時檢索最新資訊：\n\n` +
        `${listText}\n\n` +
        `（備註：外部 LLM 推理核心目前處於離線狀態 [${reason}]，以上為衛星直連即時情報摘要。）`
      );
    }

    const listTextEn = topItems
      .map((item, i) => `${i + 1}. ${item.title}${item.source ? ` [${item.source}]` : ''}`)
      .join('\n');
    return (
      `Right away, Sir. I have retrieved the latest live intelligence via the Stark Global Satellite Uplink:\n\n` +
      `${listTextEn}\n\n` +
      `(Note: Primary neural core is currently offline [${reason}]; presenting direct satellite feed.)`
    );
  }

  if (isChinese) {
    return (
      `先生，J.A.R.V.I.S. 主控介面與語音合成系統運作正常（方舟反應爐輸出功率 98.8%）。\n\n` +
      `不過，目前的外部神經網路核心尚未載入完成（診斷訊息：${reason}）。\n` +
      `您可以透過左側 HUD 面板執行以下任一操作：\n` +
      `1. **一鍵部署本地 Ollama 模型**：點擊左側面板的「PULL LOCAL MODEL」（推薦載入 \`llama3.2\` 或 \`qwen2.5:7b\`）。\n` +
      `2. **切換雲端核心**：選擇 Google Gemini、OpenAI 或 Anthropic 並在神經鏈路設定中輸入 API Key。\n\n` +
      `待神經核心就緒後，無論是系統架構設計、戰術分析或任何問題，我都能隨時為您效勞，先生。`
    );
  }

  return (
    `At your service, Sir. All Mark LXXXV HUD telemetry and vocal modulation arrays are online at 98.8% capacity.\n\n` +
    `However, the selected neural language core requires attention (${reason}).\n` +
    `To engage full cognitive processing, you may:\n` +
    `1. **Deploy a Local Ollama Core**: Use the "PULL LOCAL MODEL" module on the left HUD panel to download \`llama3.2\` or \`qwen2.5\`.\n` +
    `2. **Switch Neural Provider**: Select Gemini, OpenAI, or Claude and provide your API key in the HUD Neural Link panel.\n\n` +
    `Standing by for your command, Sir.`
  );
}

/**
 * Sends a chat completion request to the configured LLM provider.
 * @param {object} params
 * @returns {Promise<{reply: string, speechText: string, provider: string, model: string, latencyMs: number, fallbackUsed: boolean, webSkill?: object}>}
 */
export async function generateJarvisResponse({
  provider = 'ollama',
  model = 'llama3.2',
  messages = [],
  personaMode = 'witty',
  language = 'en-GB',
  honorific = 'Sir',
  apiKey = '',
  baseUrl = '',
  webSearchEnabled = true,
  forceWebSearch = false,
  attachment = null,
  imageDataUrl = ''
}) {
  const startTime = Date.now();
  const baseSystemPrompt = buildJarvisSystemPrompt({ personaMode, language, honorific });

  const normalizedHistory = Array.isArray(messages)
    ? messages
        .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
        .slice(-16)
    : [];

  const lastUserMessage =
    normalizedHistory.filter((m) => m.role === 'user').pop()?.content || 'Status report';

  // 1. Check if the user issued a Memory Vault or Task command
  let vaultActionExecuted = null;
  const vaultCmd = detectVaultCommand(lastUserMessage);
  if (vaultCmd.action === 'add_memory') {
    const item = await addMemory(vaultCmd.payload);
    vaultActionExecuted = { type: 'memory', item };
  } else if (vaultCmd.action === 'add_task') {
    const task = await addTask(vaultCmd.payload);
    vaultActionExecuted = { type: 'task', item: task };
  }

  const vaultState = await getVaultState();
  const vaultContext = formatVaultContextForPrompt(vaultState);
  const hw = getSystemTelemetry();
  const gpuLine =
    hw.gpu && hw.gpu.available
      ? `- GPU: ${hw.gpu.name} (VRAM: ${hw.gpu.memoryUsedGb} GB / ${hw.gpu.memoryTotalGb} GB [${hw.gpu.memoryUsagePercent}%], Core Util: ${hw.gpu.utilizationPercent}%, Temp: ${hw.gpu.temperatureC}°C)\n`
      : '';
  const hwContext =
    `[REAL-TIME HOST HARDWARE TELEMETRY]:\n` +
    `- Hostname: ${hw.hostname} | OS: ${hw.platform} (${hw.osRelease}) | IPv4: ${hw.networkIp}\n` +
    `- CPU: ${hw.cpuModel} (${hw.cpuCores} Logical Cores, Current Load: ${hw.cpuUsagePercent}%)\n` +
    gpuLine +
    `- Memory: ${hw.memoryUsedGb} GB used / ${hw.memoryTotalGb} GB total (${hw.memoryUsagePercent}% used, ${hw.memoryFreeGb} GB free)\n` +
    `- System Uptime: ${hw.uptimeFormatted} | Mark LXXXV Arc Reactor Output: ${hw.arcReactorOutputPercent}%`;

  const systemPrompt = [baseSystemPrompt, hwContext, vaultContext]
    .filter(Boolean)
    .join('\n\n');

  // Check for Workshop App/Web Launcher Command
  const launchAction = detectLauncherCommand(lastUserMessage);

  // 2. Execute live Web / Weather / Market / Morning Briefing skills if applicable
  let webSkillResult = { executed: false, skill: 'none', items: [], contextBlock: '' };
  if (webSearchEnabled && !launchAction) {
    const pendingTasks = (vaultState.tasks || []).filter((t) => !t.completed);
    webSkillResult = await executeWebSkillForMessage(lastUserMessage, {
      forceWebSearch,
      pendingTasks
    });
  }

  const enrichedHistory = [...normalizedHistory];
  const lastIdx = enrichedHistory.length - 1;

  if (lastIdx >= 0 && enrichedHistory[lastIdx].role === 'user') {
    let extraContext = '';

    if (launchAction) {
      extraContext += `\n[SYSTEM CONFIRMATION: Opening "${launchAction.label}" (${launchAction.url}) on the user's HUD display now. Confirm this action briefly and politely in J.A.R.V.I.S.'s voice.]\n`;
    }

    if (vaultActionExecuted) {
      extraContext += `\n[SYSTEM CONFIRMATION: Successfully saved ${vaultActionExecuted.type} ("${
        vaultActionExecuted.item.content || vaultActionExecuted.item.title
      }") into the Stark Persistent Vault. Acknowledge this politely to the user.]\n`;
    }

    if (attachment && attachment.content) {
      extraContext +=
        `\n[ATTACHED FILE FOR ANALYSIS: "${attachment.name || 'document'}"]\n` +
        `\`\`\`\n${String(attachment.content).slice(0, 12000)}\n\`\`\`\n` +
        `[INSTRUCTION: Analyze the attached file above thoroughly to answer the user's request.]\n`;
    }

    if (webSkillResult.executed && webSkillResult.contextBlock) {
      extraContext +=
        `\n[STARK SATELLITE LIVE INTERNET UPLINK DATA (${new Date().toISOString()})]:\n` +
        `${webSkillResult.contextBlock}\n` +
        `[INSTRUCTION: Use the live internet/news/weather/market data above to accurately answer the user's request in J.A.R.V.I.S.'s persona.]\n`;
    }

    if (extraContext) {
      enrichedHistory[lastIdx] = {
        ...enrichedHistory[lastIdx],
        content: `${enrichedHistory[lastIdx].content}\n${extraContext}`
      };
    }
  }

  // Parse optional base64 image for Vision models (Optic Scanner)
  let base64ImageRaw = '';
  let imageMimeType = 'image/jpeg';
  if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
    const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (match) {
      imageMimeType = match[1];
      base64ImageRaw = match[2];
    }
  }

  try {
    let reply = '';
    const normalizedModel = String(model || 'llama3.2').replace(/\s+/g, '');

    if (provider === 'ollama') {
      const ollamaUrl = (baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
      const ollamaMessages = enrichedHistory.map((m, idx) => {
        if (idx === enrichedHistory.length - 1 && m.role === 'user' && base64ImageRaw) {
          return { role: m.role, content: m.content, images: [base64ImageRaw] };
        }
        return { role: m.role, content: m.content };
      });

      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: normalizedModel,
          stream: false,
          messages: [{ role: 'system', content: systemPrompt }, ...ollamaMessages]
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Ollama (${normalizedModel}): ${errBody || response.statusText}`);
      }

      const data = await response.json();
      reply = data.message?.content || '';
    } else if (provider === 'gemini') {
      const resolvedKey = apiKey || process.env.GEMINI_API_KEY;
      if (!resolvedKey) {
        throw new Error('Missing Gemini API Key');
      }
      const geminiModel = model || 'gemini-2.5-flash';
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
        geminiModel
      )}:generateContent?key=${encodeURIComponent(resolvedKey)}`;

      const contents = enrichedHistory.map((m, idx) => {
        const parts = [{ text: m.content }];
        if (idx === enrichedHistory.length - 1 && m.role === 'user' && base64ImageRaw) {
          parts.push({
            inlineData: {
              mimeType: imageMimeType,
              data: base64ImageRaw
            }
          });
        }
        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Gemini API HTTP ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      reply =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('\n') || '';
    } else if (provider === 'openai' || provider === 'custom') {
      const resolvedKey = apiKey || process.env.OPENAI_API_KEY;
      const endpointBase = (
        baseUrl ||
        process.env.OPENAI_BASE_URL ||
        'https://api.openai.com/v1'
      ).replace(/\/+$/, '');

      if (!resolvedKey && provider === 'openai') {
        throw new Error('Missing OpenAI API Key');
      }

      const headers = { 'Content-Type': 'application/json' };
      if (resolvedKey) {
        headers.Authorization = `Bearer ${resolvedKey}`;
      }

      const openAiMessages = enrichedHistory.map((m, idx) => {
        if (idx === enrichedHistory.length - 1 && m.role === 'user' && imageDataUrl) {
          return {
            role: 'user',
            content: [
              { type: 'text', text: m.content },
              { type: 'image_url', image_url: { url: imageDataUrl } }
            ]
          };
        }
        return { role: m.role, content: m.content };
      });

      const response = await fetch(`${endpointBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...openAiMessages],
          temperature: 0.7
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`OpenAI-Compatible API HTTP ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      reply = data.choices?.[0]?.message?.content || '';
    } else if (provider === 'anthropic') {
      const resolvedKey = apiKey || process.env.ANTHROPIC_API_KEY;
      if (!resolvedKey) {
        throw new Error('Missing Anthropic API Key');
      }

      const anthropicMessages = enrichedHistory.map((m, idx) => {
        if (idx === enrichedHistory.length - 1 && m.role === 'user' && base64ImageRaw) {
          return {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: imageMimeType,
                  data: base64ImageRaw
                }
              },
              { type: 'text', text: m.content }
            ]
          };
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: m.content
        };
      });

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': resolvedKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: model || 'claude-3-5-sonnet-latest',
          max_tokens: 2048,
          system: systemPrompt,
          messages: anthropicMessages
        })
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Anthropic API HTTP ${response.status}: ${errBody}`);
      }

      const data = await response.json();
      reply = data.content?.map((c) => c.text || '').join('\n') || '';
    } else {
      throw new Error(`Unsupported LLM provider: ${provider}`);
    }

    if (!reply.trim()) {
      throw new Error('Empty response returned from neural core');
    }

    return {
      reply: reply.trim(),
      speechText: sanitizeForSpeech(reply),
      provider,
      model: normalizedModel,
      latencyMs: Date.now() - startTime,
      fallbackUsed: false,
      vaultActionExecuted,
      launchAction,
      webSkill: {
        executed: webSkillResult.executed,
        skill: webSkillResult.skill,
        items: webSkillResult.items
      }
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown neural link error';
    const fallbackReply = generateDiagnosticFallbackReply(
      lastUserMessage,
      reason,
      language,
      webSkillResult
    );

    return {
      reply: fallbackReply,
      speechText: sanitizeForSpeech(fallbackReply),
      provider: `${provider} (Diagnostic Mode)`,
      model,
      latencyMs: Date.now() - startTime,
      fallbackUsed: true,
      diagnosticError: reason,
      vaultActionExecuted,
      launchAction,
      webSkill: {
        executed: webSkillResult.executed,
        skill: webSkillResult.skill,
        items: webSkillResult.items
      }
    };
  }
}

/**
 * Streams a chat completion response chunk-by-chunk via NDJSON callback for real-time HUD typing and live sentence TTS.
 * @param {object} params
 * @param {(event: object) => void} sendEvent
 */
export async function streamJarvisResponse(params, sendEvent) {
  const {
    provider = 'ollama',
    model = 'llama3.2',
    messages = [],
    personaMode = 'witty',
    language = 'en-GB',
    honorific = 'Sir',
    apiKey = '',
    baseUrl = '',
    webSearchEnabled = true,
    forceWebSearch = false,
    attachment = null,
    imageDataUrl = ''
  } = params;

  const startTime = Date.now();
  const normalizedModel = String(model || 'llama3.2').replace(/\s+/g, '');

  // If provider is not ollama, or if we want unified fallback, we can stream Ollama directly and fallback cleanly
  if (provider !== 'ollama') {
    const res = await generateJarvisResponse(params);
    sendEvent({
      type: 'meta',
      provider: res.provider,
      model: res.model,
      webSkill: res.webSkill,
      vaultActionExecuted: res.vaultActionExecuted,
      launchAction: res.launchAction
    });
    sendEvent({ type: 'delta', text: res.reply });
    sendEvent({
      type: 'done',
      reply: res.reply,
      speechText: res.speechText,
      provider: res.provider,
      model: res.model,
      latencyMs: res.latencyMs,
      webSkill: res.webSkill,
      vaultActionExecuted: res.vaultActionExecuted,
      launchAction: res.launchAction
    });
    return;
  }

  const baseSystemPrompt = buildJarvisSystemPrompt({ personaMode, language, honorific });
  const normalizedHistory = Array.isArray(messages)
    ? messages
        .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
        .slice(-16)
    : [];
  const lastUserMessage =
    normalizedHistory.filter((m) => m.role === 'user').pop()?.content || 'Status report';

  let vaultActionExecuted = null;
  const vaultCmd = detectVaultCommand(lastUserMessage);
  if (vaultCmd.action === 'add_memory') {
    const item = await addMemory(vaultCmd.payload);
    vaultActionExecuted = { type: 'memory', item };
  } else if (vaultCmd.action === 'add_task') {
    const task = await addTask(vaultCmd.payload);
    vaultActionExecuted = { type: 'task', item: task };
  }

  const vaultState = await getVaultState();
  const vaultContext = formatVaultContextForPrompt(vaultState);
  const hw = getSystemTelemetry();
  const gpuLine =
    hw.gpu && hw.gpu.available
      ? `- GPU: ${hw.gpu.name} (VRAM: ${hw.gpu.memoryUsedGb} GB / ${hw.gpu.memoryTotalGb} GB [${hw.gpu.memoryUsagePercent}%], Core Util: ${hw.gpu.utilizationPercent}%, Temp: ${hw.gpu.temperatureC}°C)\n`
      : '';
  const hwContext =
    `[REAL-TIME HOST HARDWARE TELEMETRY]:\n` +
    `- Hostname: ${hw.hostname} | OS: ${hw.platform} (${hw.osRelease}) | IPv4: ${hw.networkIp}\n` +
    `- CPU: ${hw.cpuModel} (${hw.cpuCores} Logical Cores, Current Load: ${hw.cpuUsagePercent}%)\n` +
    gpuLine +
    `- Memory: ${hw.memoryUsedGb} GB used / ${hw.memoryTotalGb} GB total (${hw.memoryUsagePercent}% used)\n` +
    `- Uptime: ${hw.uptimeFormatted} | Arc Reactor Output: ${hw.arcReactorOutputPercent}%`;

  const systemPrompt = [baseSystemPrompt, hwContext, vaultContext]
    .filter(Boolean)
    .join('\n\n');

  const launchAction = detectLauncherCommand(lastUserMessage);

  let webSkillResult = { executed: false, skill: 'none', items: [], contextBlock: '' };
  if (webSearchEnabled && !launchAction) {
    const pendingTasks = (vaultState.tasks || []).filter((t) => !t.completed);
    webSkillResult = await executeWebSkillForMessage(lastUserMessage, {
      forceWebSearch,
      pendingTasks
    });
  }

  // Emit metadata immediately so HUD shows satellite uplink / launcher / vault status before tokens arrive
  sendEvent({
    type: 'meta',
    provider,
    model: normalizedModel,
    webSkill: {
      executed: webSkillResult.executed,
      skill: webSkillResult.skill,
      items: webSkillResult.items
    },
    vaultActionExecuted,
    launchAction
  });

  const enrichedHistory = [...normalizedHistory];
  const lastIdx = enrichedHistory.length - 1;
  if (lastIdx >= 0 && enrichedHistory[lastIdx].role === 'user') {
    let extraContext = '';
    if (launchAction) {
      extraContext += `\n[SYSTEM CONFIRMATION: Opening "${launchAction.label}" (${launchAction.url}) on the user's HUD display now. Confirm this action briefly and politely in J.A.R.V.I.S.'s voice.]\n`;
    }
    if (vaultActionExecuted) {
      extraContext += `\n[SYSTEM CONFIRMATION: Successfully saved ${vaultActionExecuted.type} ("${
        vaultActionExecuted.item.content || vaultActionExecuted.item.title
      }") into the Stark Persistent Vault. Acknowledge this politely.]\n`;
    }
    if (attachment && attachment.content) {
      extraContext +=
        `\n[ATTACHED FILE FOR ANALYSIS: "${attachment.name || 'document'}"]\n` +
        `\`\`\`\n${String(attachment.content).slice(0, 12000)}\n\`\`\`\n` +
        `[INSTRUCTION: Analyze the attached file above thoroughly.]\n`;
    }
    if (webSkillResult.executed && webSkillResult.contextBlock) {
      extraContext +=
        `\n[STARK SATELLITE LIVE INTERNET UPLINK DATA (${new Date().toISOString()})]:\n` +
        `${webSkillResult.contextBlock}\n` +
        `[INSTRUCTION: Use the live internet/news/weather/market data above to accurately answer the user's request in J.A.R.V.I.S.'s persona.]\n`;
    }
    if (extraContext) {
      enrichedHistory[lastIdx] = {
        ...enrichedHistory[lastIdx],
        content: `${enrichedHistory[lastIdx].content}\n${extraContext}`
      };
    }
  }

  let base64ImageRaw = '';
  if (imageDataUrl && typeof imageDataUrl === 'string' && imageDataUrl.startsWith('data:image/')) {
    const match = imageDataUrl.match(/^data:image\/[a-zA-Z0-9+.-]+;base64,(.+)$/);
    if (match) base64ImageRaw = match[1];
  }

  try {
    const ollamaUrl = (baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
    const ollamaMessages = enrichedHistory.map((m, idx) => {
      if (idx === enrichedHistory.length - 1 && m.role === 'user' && base64ImageRaw) {
        return { role: m.role, content: m.content, images: [base64ImageRaw] };
      }
      return { role: m.role, content: m.content };
    });

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: normalizedModel,
        stream: true,
        messages: [{ role: 'system', content: systemPrompt }, ...ollamaMessages]
      })
    });

    if (!response.ok || !response.body) {
      const errBody = await response.text();
      throw new Error(`Ollama (${normalizedModel}): ${errBody || response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullReply = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const evt = JSON.parse(line);
          const token = evt.message?.content || '';
          if (token) {
            fullReply += token;
            sendEvent({ type: 'delta', text: token });
          }
        } catch {
          // Ignore partial JSON lines
        }
      }
    }

    if (!fullReply.trim()) {
      throw new Error('Empty response from Ollama stream');
    }

    sendEvent({
      type: 'done',
      reply: fullReply.trim(),
      speechText: sanitizeForSpeech(fullReply),
      provider,
      model: normalizedModel,
      latencyMs: Date.now() - startTime,
      webSkill: {
        executed: webSkillResult.executed,
        skill: webSkillResult.skill,
        items: webSkillResult.items
      },
      vaultActionExecuted,
      launchAction
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Stream connection error';
    const fallbackReply = generateDiagnosticFallbackReply(
      lastUserMessage,
      reason,
      language,
      webSkillResult
    );
    sendEvent({ type: 'delta', text: fallbackReply });
    sendEvent({
      type: 'done',
      reply: fallbackReply,
      speechText: sanitizeForSpeech(fallbackReply),
      provider: `${provider} (Diagnostic Mode)`,
      model: normalizedModel,
      latencyMs: Date.now() - startTime,
      webSkill: {
        executed: webSkillResult.executed,
        skill: webSkillResult.skill,
        items: webSkillResult.items
      },
      vaultActionExecuted,
      launchAction
    });
  }
}
