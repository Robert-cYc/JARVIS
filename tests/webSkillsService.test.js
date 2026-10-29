import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeHtmlEntities,
  extractReadableTextFromHtml,
  parseRssItems,
  detectWebSkillIntent,
  detectLauncherCommand
} from '../src/server/services/webSkillsService.js';

describe('J.A.R.V.I.S. Web Skills & News Service', () => {
  it('decodes HTML entities and CDATA sections accurately', () => {
    const raw = '<![CDATA[Stark &amp; Co. &quot;Mark 85&quot; &#39;Online&#39;]]>';
    assert.equal(decodeHtmlEntities(raw), 'Stark & Co. "Mark 85" \'Online\'');
  });

  it('extracts readable text from HTML while stripping scripts and styles', () => {
    const html = `
      <html>
        <head><style>body { color: red; }</style><script>alert(1);</script></head>
        <body><h1>Stark Report</h1><p>Arc reactor at 99%.</p></body>
      </html>
    `;
    const text = extractReadableTextFromHtml(html);
    assert.ok(text.includes('Stark Report'));
    assert.ok(text.includes('Arc reactor at 99%.'));
    assert.ok(!text.includes('alert(1)'));
    assert.ok(!text.includes('color: red'));
  });

  it('parses RSS 2.0 XML items into structured news headlines', () => {
    const sampleRss = `
      <rss version="2.0">
        <channel>
          <item>
            <title>AI Breakthrough in 2026 - TechDaily</title>
            <link>https://example.com/news/1</link>
            <pubDate>Thu, 29 Oct 2026 03:00:00 GMT</pubDate>
            <source>TechDaily</source>
          </item>
        </channel>
      </rss>
    `;
    const items = parseRssItems(sampleRss, 5);
    assert.equal(items.length, 1);
    assert.equal(items[0].title, 'AI Breakthrough in 2026 - TechDaily');
    assert.equal(items[0].link, 'https://example.com/news/1');
    assert.equal(items[0].source, 'TechDaily');
  });

  it('detects news, web search, and URL reader intents accurately', () => {
    const newsIntent = detectWebSkillIntent('JARVIS，請告訴我今天台灣有什麼新聞頭條？');
    assert.equal(newsIntent.intent, 'news');
    assert.equal(newsIntent.edition, 'tw');

    const techNewsIntent = detectWebSkillIntent("Show me today's AI and technology news");
    assert.equal(techNewsIntent.intent, 'news');
    assert.equal(techNewsIntent.edition, 'tech');

    const urlIntent = detectWebSkillIntent('幫我摘要這個網頁 https://example.com/article');
    assert.equal(urlIntent.intent, 'url');
    assert.equal(urlIntent.url, 'https://example.com/article');

    const searchIntent = detectWebSkillIntent('請幫我上網搜尋量子電腦最新進展');
    assert.equal(searchIntent.intent, 'search');

    const weatherIntent = detectWebSkillIntent('JARVIS，今天台北天氣如何？需要帶傘嗎？');
    assert.equal(weatherIntent.intent, 'weather');
    assert.equal(weatherIntent.query, '台北');

    const marketIntent = detectWebSkillIntent('請查詢台積電與 NVDA 的最新股價');
    assert.equal(marketIntent.intent, 'market');

    const briefingIntent = detectWebSkillIntent('早安 JARVIS，請進行今日晨間簡報');
    assert.equal(briefingIntent.intent, 'morning_briefing');

    const forceSearch = detectWebSkillIntent('Hello JARVIS', true);
    assert.equal(forceSearch.intent, 'search');
  });

  it('detects workshop web/app launcher commands accurately', () => {
    const ytCmd = detectLauncherCommand('JARVIS，請在 YouTube 搜尋 Iron Man AC/DC');
    assert.ok(ytCmd);
    assert.equal(ytCmd.executed, true);
    assert.ok(ytCmd.url.includes('youtube.com/results?search_query='));

    const ghCmd = detectLauncherCommand('幫我打開 GitHub');
    assert.ok(ghCmd);
    assert.equal(ghCmd.url, 'https://github.com');
  });
});
