import { executeWebSkillForMessage } from './webSkillsService.js';

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
  personaMode = 'butler',
  language = 'auto',
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
  personaMode = 'butler',
  language = 'auto',
  honorific = 'Sir',
  apiKey = '',
  baseUrl = '',
  webSearchEnabled = true,
  forceWebSearch = false
}) {
  const startTime = Date.now();
  const systemPrompt = buildJarvisSystemPrompt({ personaMode, language, honorific });

  const normalizedHistory = Array.isArray(messages)
    ? messages
        .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
        .slice(-16)
    : [];

  const lastUserMessage =
    normalizedHistory.filter((m) => m.role === 'user').pop()?.content || 'Status report';

  let webSkillResult = { executed: false, skill: 'none', items: [], contextBlock: '' };
  if (webSearchEnabled) {
    webSkillResult = await executeWebSkillForMessage(lastUserMessage, { forceWebSearch });
  }

  const enrichedHistory = [...normalizedHistory];
  if (webSkillResult.executed && webSkillResult.contextBlock) {
    const lastIdx = enrichedHistory.length - 1;
    if (lastIdx >= 0 && enrichedHistory[lastIdx].role === 'user') {
      enrichedHistory[lastIdx] = {
        role: 'user',
        content:
          `${enrichedHistory[lastIdx].content}\n\n` +
          `[STARK SATELLITE LIVE INTERNET UPLINK DATA (${new Date().toISOString()})]:\n` +
          `${webSkillResult.contextBlock}\n` +
          `[INSTRUCTION: Use the live internet/news data above to accurately answer the user's request in J.A.R.V.I.S.'s persona.]`
      };
    }
  }

  try {
    let reply = '';
    const normalizedModel = String(model || 'llama3.2').replace(/\s+/g, '');

    if (provider === 'ollama') {
      const ollamaUrl = (baseUrl || DEFAULT_OLLAMA_URL).replace(/\/+$/, '');
      const response = await fetch(`${ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: normalizedModel,
          stream: false,
          messages: [{ role: 'system', content: systemPrompt }, ...enrichedHistory]
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

      const contents = enrichedHistory.map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));

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

      const response = await fetch(`${endpointBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: model || 'gpt-4o-mini',
          messages: [{ role: 'system', content: systemPrompt }, ...enrichedHistory],
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
          messages: enrichedHistory.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: m.content
          }))
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
      webSkill: {
        executed: webSkillResult.executed,
        skill: webSkillResult.skill,
        items: webSkillResult.items
      }
    };
  }
}
