/**
 * Stark Industries Fiscal Telemetry — Taiwan Invoice Lottery (統一發票開獎與對獎) Service
 * Directly retrieves verified winning numbers from Ministry of Finance (財政部) official feed.
 */

const INVOICE_XML_URL = 'https://invoice.etax.nat.gov.tw/invoice.xml';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache

let cachedInvoices = null;
let lastFetchTime = 0;

/**
 * Strips XML CDATA wrappers and trims whitespace.
 * @param {string} text
 * @returns {string}
 */
function cleanXmlContent(text) {
  if (!text) return '';
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
}

/**
 * Parses raw XML RSS 2.0 feed from Ministry of Finance into structured winning periods.
 * @param {string} xml
 * @returns {Array<{period: string, link: string, pubDate: string, specialPrize: string, grandPrize: string, firstPrizes: string[], additionalSixPrizes: string[]}>}
 */
export function parseInvoiceXml(xml) {
  if (!xml || typeof xml !== 'string') return [];
  const results = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const descMatch = block.match(/<description>([\s\S]*?)<\/description>/i);

    const period = cleanXmlContent(titleMatch ? titleMatch[1] : '');
    const link = cleanXmlContent(linkMatch ? linkMatch[1] : 'https://www.etax.nat.gov.tw');
    const pubDate = cleanXmlContent(pubDateMatch ? pubDateMatch[1] : '');
    const desc = cleanXmlContent(descMatch ? descMatch[1] : '');

    const specialMatch = desc.match(/特別獎[：:]\s*([0-9]+)/);
    const grandMatch = desc.match(/特獎[：:]\s*([0-9]+)/);
    const firstMatch = desc.match(/頭獎[：:]\s*([0-9\s、]+)/);
    const sixMatch = desc.match(/增開六獎[：:]\s*([0-9\s、]+)/);

    const specialPrize = specialMatch ? specialMatch[1].trim() : '';
    const grandPrize = grandMatch ? grandMatch[1].trim() : '';
    const firstPrizes = firstMatch
      ? firstMatch[1].split(/[、\s]+/).map((s) => s.trim()).filter((s) => s.length === 8)
      : [];
    const additionalSixPrizes = sixMatch
      ? sixMatch[1].split(/[、\s]+/).map((s) => s.trim()).filter((s) => s.length === 3)
      : [];

    if (period && (specialPrize || firstPrizes.length > 0)) {
      results.push({
        period,
        link,
        pubDate,
        specialPrize,
        grandPrize,
        firstPrizes,
        additionalSixPrizes
      });
    }
  }

  return results;
}

/**
 * Fetches latest Taiwan invoice lottery numbers with in-memory caching.
 * @param {object} [options]
 * @param {boolean} [options.forceFresh=false]
 * @returns {Promise<Array<object>>}
 */
export async function fetchTaiwanInvoiceNumbers({ forceFresh = false } = {}) {
  const now = Date.now();
  if (!forceFresh && cachedInvoices && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedInvoices;
  }

  try {
    const res = await fetch(INVOICE_XML_URL, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: 'application/xml, text/xml, */*'
      },
      signal: AbortSignal.timeout(8000)
    });

    if (!res.ok) {
      throw new Error(`Invoice feed responded with HTTP ${res.status}`);
    }

    const xml = await res.text();
    const parsed = parseInvoiceXml(xml);

    if (parsed.length > 0) {
      cachedInvoices = parsed;
      lastFetchTime = now;
      return parsed;
    }
    throw new Error('Failed to parse winning numbers from invoice feed');
  } catch (err) {
    if (cachedInvoices && cachedInvoices.length > 0) {
      return cachedInvoices;
    }
    // Return empty array if network failed and no cache
    return [];
  }
}

/**
 * Verifies a given 3-to-8 digit number against a specific invoice period's winning numbers.
 * Adheres strictly to Taiwan Ministry of Finance official prize award rules.
 * @param {string} inputNumber
 * @param {object} invoiceRecord
 * @returns {{won: boolean, prizeName: string, amount: number, matchedDigits: string, description: string}}
 */
export function checkInvoiceWinning(inputNumber, invoiceRecord) {
  if (!inputNumber || typeof inputNumber !== 'string') {
    return { won: false, prizeName: '格式錯誤', amount: 0, matchedDigits: '', description: '請輸入 3 至 8 位數字發票號碼' };
  }

  const cleanNum = inputNumber.replace(/\D/g, '');
  if (cleanNum.length < 3) {
    return { won: false, prizeName: '碼數不足', amount: 0, matchedDigits: '', description: '對獎號碼至少需提供末 3 碼數字' };
  }

  if (!invoiceRecord) {
    return { won: false, prizeName: '無開獎資料', amount: 0, matchedDigits: '', description: '尚未取得該期開獎資料' };
  }

  const { specialPrize, grandPrize, firstPrizes = [], additionalSixPrizes = [] } = invoiceRecord;

  // 1. Check 特別獎 (1,000萬) - Requires full 8 digits
  if (cleanNum.length === 8 && specialPrize && cleanNum === specialPrize) {
    return {
      won: true,
      prizeName: '特別獎',
      amount: 10000000,
      matchedDigits: cleanNum,
      description: '🎉 恭喜中特別獎！獎金新台幣 1,000 萬元！'
    };
  }

  // 2. Check 特獎 (200萬) - Requires full 8 digits
  if (cleanNum.length === 8 && grandPrize && cleanNum === grandPrize) {
    return {
      won: true,
      prizeName: '特獎',
      amount: 2000000,
      matchedDigits: cleanNum,
      description: '🎉 恭喜中特獎！獎金新台幣 200 萬元！'
    };
  }

  // 3. Check 頭獎至六獎 against firstPrizes (8 down to 3 digits)
  const prizeTiers = [
    { digits: 8, name: '頭獎', amount: 200000 },
    { digits: 7, name: '二獎', amount: 40000 },
    { digits: 6, name: '三獎', amount: 10000 },
    { digits: 5, name: '四獎', amount: 4000 },
    { digits: 4, name: '五獎', amount: 1000 },
    { digits: 3, name: '六獎', amount: 200 }
  ];

  for (const tier of prizeTiers) {
    if (cleanNum.length >= tier.digits) {
      const userSub = cleanNum.slice(-tier.digits);
      for (const winningNum of firstPrizes) {
        if (winningNum.endsWith(userSub)) {
          return {
            won: true,
            prizeName: tier.name,
            amount: tier.amount,
            matchedDigits: userSub,
            description: `🎯 恭喜末 ${tier.digits} 碼 [${userSub}] 對中頭獎 [${winningNum}]，獲得【${tier.name}】獎金 NT$ ${tier.amount.toLocaleString()}！`
          };
        }
      }
    }
  }

  // 4. Check 增開六獎 (末 3 碼)
  if (cleanNum.length >= 3 && additionalSixPrizes.length > 0) {
    const userLast3 = cleanNum.slice(-3);
    for (const sixNum of additionalSixPrizes) {
      if (userLast3 === sixNum) {
        return {
          won: true,
          prizeName: '增開六獎',
          amount: 200,
          matchedDigits: userLast3,
          description: `🎯 恭喜末 3 碼 [${userLast3}] 對中增開六獎，獲得獎金 NT$ 200！`
        };
      }
    }
  }

  // Not winning
  const headEndings = firstPrizes.map((p) => p.slice(-3)).join('、');
  return {
    won: false,
    prizeName: '未中獎',
    amount: 0,
    matchedDigits: cleanNum.slice(-3),
    description: `未中獎（本期頭獎末三碼為：${headEndings || '無'}）`
  };
}

/**
 * Formats lottery results and optional check response for J.A.R.V.I.S. HUD.
 * @param {Array<object>} invoices
 * @param {object} [checkResult=null]
 * @param {string} [checkInput='']
 * @returns {{summaryText: string, items: Array<any>}}
 */
export function formatTaiwanInvoiceBriefing(invoices, checkResult = null, checkInput = '') {
  if (!invoices || invoices.length === 0) {
    return {
      summaryText: '⚠️ 目前無法連線至財政部發票資料庫，請稍後重試。',
      items: []
    };
  }

  const latest = invoices[0];
  const prev = invoices[1] || null;

  let text = `### 🧾 STARK FISCAL // 台灣統一發票中獎號碼\n\n`;

  if (checkResult) {
    text += `#### 🔍 對獎結果檢測 [號碼: \`${checkInput}\`]\n`;
    text += checkResult.won
      ? `> **${checkResult.description}**\n\n`
      : `> ❌ **${checkResult.description}**\n\n`;
  }

  text += `#### 📅 最新一期：**${latest.period}**\n\n`;
  text += `| 獎項 | 中獎號碼 | 獎金 |\n`;
  text += `| :--- | :--- | :--- |\n`;
  text += `| **特別獎** | \`${latest.specialPrize || '---'}\` | **NT$ 1,000 萬元** (需8碼全中) |\n`;
  text += `| **特獎** | \`${latest.grandPrize || '---'}\` | **NT$ 200 萬元** (需8碼全中) |\n`;

  latest.firstPrizes.forEach((num, idx) => {
    text += `| **頭獎 (${idx + 1})** | \`${num}\` | **NT$ 20 萬元** (末3~7碼皆有獎) |\n`;
  });

  if (latest.additionalSixPrizes && latest.additionalSixPrizes.length > 0) {
    text += `| **增開六獎** | \`${latest.additionalSixPrizes.join('、')}\` | **NT$ 200** (末3碼) |\n`;
  }

  text += `\n*二獎 (4萬): 末7碼相符 | 三獎 (1萬): 末6碼 | 四獎 (4千): 末5碼 | 五獎 (1千): 末4碼 | 六獎 (2百): 末3碼*\n`;

  if (prev) {
    text += `\n<details><summary>📁 點擊展開上期中獎號碼 [${prev.period}]</summary>\n\n`;
    text += `* 特別獎: \`${prev.specialPrize}\`\n`;
    text += `* 特獎: \`${prev.grandPrize}\`\n`;
    text += `* 頭獎: ${prev.firstPrizes.map((p) => `\`${p}\``).join('、')}\n`;
    if (prev.additionalSixPrizes.length > 0) {
      text += `* 增開六獎: ${prev.additionalSixPrizes.map((p) => `\`${p}\``).join('、')}\n`;
    }
    text += `\n</details>\n`;
  }

  const items = [
    {
      title: `🧾 ${latest.period} 特別獎: ${latest.specialPrize}`,
      link: latest.link,
      source: '財政部稅務入口網'
    },
    {
      title: `頭獎: ${latest.firstPrizes.join(' / ')}`,
      link: latest.link,
      source: '統一發票'
    }
  ];

  return { summaryText: text, items };
}
