import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildJarvisSystemPrompt,
  sanitizeForSpeech,
  generateDiagnosticFallbackReply,
  ensureTraditionalChinese,
  streamJarvisResponse
} from '../src/server/services/llmService.js';

describe('J.A.R.V.I.S. LLM Service', () => {
  it('builds a British butler system prompt with custom honorific', () => {
    const prompt = buildJarvisSystemPrompt({
      personaMode: 'butler',
      language: 'en-GB',
      honorific: 'Commander'
    });

    assert.match(prompt, /J\.A\.R\.V\.I\.S\./);
    assert.match(prompt, /Commander/);
    assert.match(prompt, /British butler/);
  });

  it('builds a Traditional Chinese system prompt when zh-TW is selected', () => {
    const prompt = buildJarvisSystemPrompt({
      personaMode: 'tactical',
      language: 'zh-TW',
      honorific: '先生'
    });

    assert.match(prompt, /Traditional Chinese \(繁體中文/);
    assert.match(prompt, /tactical analysis/);
  });

  it('sanitizes markdown formatting for clean TTS speech synthesis', () => {
    const raw =
      '### Status Report\n**All systems** are `100%` nominal.\n```js\nconsole.log("test");\n```';
    const clean = sanitizeForSpeech(raw);

    assert.ok(!clean.includes('###'));
    assert.ok(!clean.includes('**'));
    assert.ok(!clean.includes('```'));
    assert.ok(clean.includes('All systems are 100% nominal.'));
    assert.ok(clean.includes('[Code block displayed on HUD, Sir.]'));
  });

  it('generates an in-character Traditional Chinese diagnostic fallback reply for Chinese input', () => {
    const reply = generateDiagnosticFallbackReply(
      '請問目前裝甲狀態如何？',
      'model not found',
      'auto'
    );

    assert.match(reply, /先生/);
    assert.match(reply, /J\.A\.R\.V\.I\.S\./);
    assert.match(reply, /Ollama/);
  });

  it('ensures Traditional Chinese conversion for Chinese outputs', () => {
    const raw = '全息图现在展示了太阳系，包括卫星和轨道。';
    const clean = ensureTraditionalChinese(raw, 'zh-TW');
    assert.equal(clean, '全息圖現在展示了太陽系，包括衛星和軌道。');
  });

  it('handles streamJarvisResponse for time inquiry without throwing ReferenceError', async () => {
    const events = [];
    await streamJarvisResponse(
      {
        provider: 'ollama',
        model: 'qwen2.5:7b',
        messages: [{ role: 'user', content: 'What time is it?' }],
        baseUrl: 'http://127.0.0.1:99999' // mock offline endpoint
      },
      (evt) => events.push(evt)
    );

    assert.ok(events.length >= 2);
    const meta = events.find((e) => e.type === 'meta');
    assert.ok(meta);
    assert.equal(meta.webSkill?.skill, 'current_time');
    assert.equal(meta.webSkill?.executed, true);
    const done = events.find((e) => e.type === 'done');
    assert.ok(done);
  });
});
