import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateQrCode,
  getMinimumVersion,
  formatWifiPayload,
  renderAscii
} from '../src/server/services/qrCodeService.js';
import {
  getWorldTimeMatrix,
  matchCityFromQuery,
  formatWorldTimeBriefing,
  getTimezoneOffsetMinutes,
  formatUtcOffset
} from '../src/server/services/worldTimeService.js';
import {
  parseInvoiceXml,
  checkInvoiceWinning,
  formatTaiwanInvoiceBriefing
} from '../src/server/services/taiwanInvoiceService.js';
import {
  detectWebSkillIntent,
  executeWebSkillForMessage
} from '../src/server/services/webSkillsService.js';

describe('Utility & Productivity Skills (Item 3)', () => {
  describe('1. QR Code Precision Generator (qrCodeService)', () => {
    it('determines the minimum viable QR version based on byte length', () => {
      assert.equal(getMinimumVersion(10, 'M'), 1);
      assert.equal(getMinimumVersion(30, 'M'), 3);
      assert.equal(getMinimumVersion(80, 'M'), 5);
      assert.equal(getMinimumVersion(100, 'M'), 6);
      assert.equal(getMinimumVersion(2000, 'M'), null);
    });

    it('generates a valid QR code Model 2 with SVG, dataUrl, and ASCII preview', () => {
      const result = generateQrCode('https://github.com/facebook/react', {
        ecLevel: 'M',
        size: 256
      });

      assert.equal(result.success, true);
      assert.ok(result.version >= 1 && result.version <= 10);
      assert.ok(result.matrixSize >= 21);
      assert.ok(result.svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
      assert.ok(result.svg.includes('viewBox="0 0 256 256"'));
      assert.ok(result.dataUrl.startsWith('data:image/svg+xml;base64,'));
      assert.ok(result.ascii.includes('██'));
    });

    it('formats Wi-Fi credential strings properly', () => {
      const wifi = formatWifiPayload({
        ssid: 'Stark-Secure-5G',
        password: 'I-Am-Iron-Man',
        encryption: 'WPA'
      });
      assert.equal(wifi, 'WIFI:T:WPA;S:Stark-Secure-5G;P:I-Am-Iron-Man;;');
    });

    it('gracefully handles empty or invalid inputs', () => {
      const res = generateQrCode('');
      assert.equal(res.success, false);
      assert.ok(res.error);
    });
  });

  describe('2. Global Chronometer & World Time Matrix (worldTimeService)', () => {
    it('computes timezone offsets and format strings', () => {
      const offsetMin = getTimezoneOffsetMinutes('Asia/Taipei');
      assert.equal(offsetMin, 480);
      assert.equal(formatUtcOffset(480), 'UTC+8');
      assert.equal(formatUtcOffset(-240), 'UTC-4');
    });

    it('returns a comprehensive world time matrix including key financial hubs', () => {
      const matrix = getWorldTimeMatrix();
      assert.ok(Array.isArray(matrix));
      assert.ok(matrix.length >= 8);

      const taipei = matrix.find((m) => m.id === 'taipei');
      const tokyo = matrix.find((m) => m.id === 'tokyo');
      const ny = matrix.find((m) => m.id === 'new_york');

      assert.ok(taipei);
      assert.equal(taipei.flag, '🇹🇼');
      assert.ok(tokyo);
      assert.equal(tokyo.flag, '🇯🇵');
      assert.ok(ny);
      assert.equal(ny.flag, '🇺🇸');
      assert.ok(taipei.time24.match(/^\d{2}:\d{2}:\d{2}$/));
    });

    it('matches cities from natural language queries', () => {
      const m1 = matchCityFromQuery('請問紐約現在幾點了？');
      assert.equal(m1?.id, 'new_york');

      const m2 = matchCityFromQuery('東京現在是幾點？');
      assert.equal(m2?.id, 'tokyo');

      const m3 = matchCityFromQuery('今天天氣如何');
      assert.equal(m3, null);
    });

    it('formats a world time markdown briefing', () => {
      const briefing = formatWorldTimeBriefing();
      assert.ok(briefing.summaryText.includes('STARK GLOBAL CHRONOMETER'));
      assert.ok(briefing.summaryText.includes('| **台北** (Taipei) |'));
      assert.ok(briefing.items.length >= 8);
    });
  });

  describe('3. Taiwan Invoice Lottery & Prize Verifier (taiwanInvoiceService)', () => {
    const mockXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title><![CDATA[115年 07~08月]]></title>
      <link><![CDATA[https://www.etax.nat.gov.tw/11507]]></link>
      <pubDate>Fri, 25 Sep 2026 05:00:33 GMT</pubDate>
      <description><![CDATA[<p>特別獎：89996565</p><p>特獎：91098182</p><p>頭獎：54348835、44991397、06595111</p><p>增開六獎：888</p>]]></description>
    </item>
  </channel>
</rss>`;

    it('parses invoice RSS XML into structured winning periods', () => {
      const parsed = parseInvoiceXml(mockXml);
      assert.equal(parsed.length, 1);
      assert.equal(parsed[0].period, '115年 07~08月');
      assert.equal(parsed[0].specialPrize, '89996565');
      assert.equal(parsed[0].grandPrize, '91098182');
      assert.deepEqual(parsed[0].firstPrizes, ['54348835', '44991397', '06595111']);
      assert.deepEqual(parsed[0].additionalSixPrizes, ['888']);
    });

    it('accurately verifies winning numbers according to MOF official rules', () => {
      const invoiceRecord = {
        specialPrize: '89996565',
        grandPrize: '91098182',
        firstPrizes: ['54348835', '44991397', '06595111'],
        additionalSixPrizes: ['888']
      };

      // 1. 特別獎 (8 digits match)
      const special = checkInvoiceWinning('89996565', invoiceRecord);
      assert.equal(special.won, true);
      assert.equal(special.prizeName, '特別獎');
      assert.equal(special.amount, 10000000);

      // 2. 特獎 (8 digits match)
      const grand = checkInvoiceWinning('91098182', invoiceRecord);
      assert.equal(grand.won, true);
      assert.equal(grand.prizeName, '特獎');
      assert.equal(grand.amount, 2000000);

      // 3. 頭獎 (8 digits match)
      const first = checkInvoiceWinning('54348835', invoiceRecord);
      assert.equal(first.won, true);
      assert.equal(first.prizeName, '頭獎');
      assert.equal(first.amount, 200000);

      // 4. 六獎 (last 3 digits match 頭獎)
      const sixth = checkInvoiceWinning('835', invoiceRecord);
      assert.equal(sixth.won, true);
      assert.equal(sixth.prizeName, '六獎');
      assert.equal(sixth.amount, 200);

      // 5. 增開六獎 (last 3 digits match additional)
      const addSix = checkInvoiceWinning('12345888', invoiceRecord);
      assert.equal(addSix.won, true);
      assert.equal(addSix.prizeName, '增開六獎');
      assert.equal(addSix.amount, 200);

      // 6. 未中獎
      const lose = checkInvoiceWinning('00000000', invoiceRecord);
      assert.equal(lose.won, false);
      assert.equal(lose.prizeName, '未中獎');
    });

    it('formats a Taiwan invoice lottery briefing', () => {
      const invoices = [
        {
          period: '115年 07~08月',
          link: 'https://etax.nat.gov.tw',
          specialPrize: '89996565',
          grandPrize: '91098182',
          firstPrizes: ['54348835', '44991397', '06595111'],
          additionalSixPrizes: []
        }
      ];
      const briefing = formatTaiwanInvoiceBriefing(invoices);
      assert.ok(briefing.summaryText.includes('台灣統一發票中獎號碼'));
      assert.ok(briefing.summaryText.includes('89996565'));
      assert.ok(briefing.items.length >= 2);
    });
  });

  describe('4. Web Skills Intent Integration', () => {
    it('detects QR code generation intent and executes skill', async () => {
      const intent = detectWebSkillIntent('JARVIS，請幫我產生一個 QR Code：https://github.com');
      assert.equal(intent.intent, 'qr_code');

      const result = await executeWebSkillForMessage('JARVIS，請幫我產生一個 QR Code：https://github.com');
      assert.equal(result.executed, true);
      assert.equal(result.skill, 'qr_code');
      assert.ok(result.contextBlock.includes('STARK QR CODE GENERATOR'));
    });

    it('detects World Time intent and executes skill', async () => {
      const intent = detectWebSkillIntent('紐約現在幾點？');
      assert.equal(intent.intent, 'world_time');
      assert.equal(intent.matchedCity, '紐約');

      const result = await executeWebSkillForMessage('世界各國時區與時差');
      assert.equal(result.executed, true);
      assert.equal(result.skill, 'world_time');
      assert.ok(result.contextBlock.includes('STARK GLOBAL CHRONOMETER'));
    });

    it('detects Taiwan Invoice intent and executes skill with prize check', async () => {
      const intent = detectWebSkillIntent('幫我對發票 54348835 有沒有中獎');
      assert.equal(intent.intent, 'taiwan_invoice');
      assert.equal(intent.checkNumber, '54348835');

      const result = await executeWebSkillForMessage('最新統一發票開獎號碼');
      assert.equal(result.executed, true);
      assert.equal(result.skill, 'taiwan_invoice');
      assert.ok(result.contextBlock.includes('台灣統一發票中獎號碼'));
    });
  });
});
