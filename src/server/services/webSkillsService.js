/**
 * Stark Industries Global Satellite Uplink — Web Surfing, Live News & Intelligence Skills
 */

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/**
 * Decodes common HTML entities in RSS/HTML text.
 * @param {string} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_m, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Strips HTML tags and normalizes whitespace from raw HTML content.
 * @param {string} html
 * @param {number} [maxLength=4000]
 * @returns {string}
 */
export function extractReadableTextFromHtml(html, maxLength = 4000) {
  if (!html || typeof html !== 'string') return '';
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<\/(p|div|h1|h2|h3|h4|li|tr|br)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  return decodeHtmlEntities(cleaned)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim()
    .slice(0, maxLength);
}

/**
 * Parses an RSS 2.0 XML string into structured news items.
 * @param {string} xml
 * @param {number} [limit=8]
 * @returns {Array<{title: string, link: string, pubDate: string, source: string}>}
 */
export function parseRssItems(xml, limit = 8) {
  if (!xml || typeof xml !== 'string') return [];
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && items.length < limit) {
    const block = match[1];
    const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/i);
    const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/i);
    const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/i);
    const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/i);

    const rawTitle = titleMatch ? decodeHtmlEntities(titleMatch[1]) : '';
    const link = linkMatch ? decodeHtmlEntities(linkMatch[1]) : '';
    const pubDate = pubDateMatch ? decodeHtmlEntities(pubDateMatch[1]) : '';
    let source = sourceMatch ? decodeHtmlEntities(sourceMatch[1]) : '';

    if (!source && rawTitle.includes(' - ')) {
      const parts = rawTitle.split(' - ');
      source = parts.pop()?.trim() || 'News Feed';
    }

    if (rawTitle) {
      items.push({
        title: rawTitle,
        link,
        pubDate,
        source: source || 'Global Feed'
      });
    }
  }

  return items;
}

/**
 * Fetches with a timeout and standard browser User-Agent.
 * @param {string} url
 * @param {number} [timeoutMs=6500]
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, timeoutMs = 6500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches today's live news headlines by category/region or custom topic.
 * @param {object} options
 * @param {string} [options.edition='tw'] - 'tw' (Taiwan 繁中), 'us' (Global English), 'tech' (Tech/AI)
 * @param {string} [options.query=''] - Optional specific news search topic
 * @param {number} [options.limit=8]
 * @returns {Promise<{skill: string, edition: string, query: string, items: Array<{title: string, link: string, pubDate: string, source: string}>, summaryText: string}>}
 */
export async function fetchTodaysNews({
  edition = 'tw',
  query = '',
  limit = 8
} = {}) {
  let feedUrl = 'https://news.google.com/rss?hl=zh-TW&gl=TW&ceid=TW:zh-Hant';

  if (query && query.trim().length > 0) {
    const isChinese = /[\u4e00-\u9fff]/.test(query);
    const hl = isChinese ? 'zh-TW&gl=TW&ceid=TW:zh-Hant' : 'en-US&gl=US&ceid=US:en';
    feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
      query.trim()
    )}&hl=${hl}`;
  } else if (edition === 'us' || edition === 'en') {
    feedUrl = 'https://news.google.com/rss?hl=en-US&gl=US&ceid=US:en';
  } else if (edition === 'tech') {
    feedUrl =
      'https://news.google.com/rss/search?q=AI+OR+Technology+OR+%E7%A7%91%E6%8A%80&hl=zh-TW&gl=TW&ceid=TW:zh-Hant';
  }

  try {
    const response = await fetchWithTimeout(feedUrl, 7000);
    if (!response.ok) {
      throw new Error(`News feed HTTP ${response.status}`);
    }
    const xml = await response.text();
    const items = parseRssItems(xml, limit);

    const formattedLines = items.map(
      (item, idx) =>
        `${idx + 1}. ${item.title}${item.pubDate ? ` (${item.pubDate})` : ''}`
    );

    return {
      skill: 'todays_news',
      edition,
      query,
      items,
      summaryText:
        items.length > 0
          ? `Live Headlines (${new Date().toISOString().split('T')[0]}):\n${formattedLines.join('\n')}`
          : 'No live headlines returned from satellite feed.'
    };
  } catch (error) {
    return {
      skill: 'todays_news',
      edition,
      query,
      items: [],
      summaryText: `Unable to retrieve live news feed: ${
        error instanceof Error ? error.message : 'Network error'
      }`
    };
  }
}

/**
 * Searches the live web using DuckDuckGo HTML + Wikipedia API + Google News RSS for current intelligence.
 * @param {string} query
 * @param {number} [limit=6]
 * @returns {Promise<{skill: string, query: string, items: Array<{title: string, link: string, snippet: string, source: string}>, summaryText: string}>}
 */
export async function searchWebIntelligence(query, limit = 6) {
  const cleanQuery = (query || '').trim();
  if (!cleanQuery) {
    return { skill: 'web_search', query: '', items: [], summaryText: '' };
  }

  const results = [];

  // 1. DuckDuckGo HTML search for general web pages
  try {
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(cleanQuery)}`;
    const res = await fetchWithTimeout(ddgUrl, 6000);
    if (res.ok) {
      const html = await res.text();
      const resultBlockRegex =
        /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = resultBlockRegex.exec(html)) !== null && results.length < limit) {
        let link = decodeHtmlEntities(match[1]);
        const uddgMatch = link.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          link = decodeURIComponent(uddgMatch[1]);
        }
        const title = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, ''));
        const snippet = decodeHtmlEntities(match[3].replace(/<[^>]+>/g, ''));
        if (title && link.startsWith('http')) {
          results.push({
            title,
            link,
            snippet,
            source: 'Web Search'
          });
        }
      }
    }
  } catch {
    // Proceed to fallback/supplementary sources
  }

  // 2. Supplement with live Google News search for up-to-the-minute context
  try {
    const newsData = await fetchTodaysNews({ query: cleanQuery, limit: 4 });
    for (const item of newsData.items) {
      if (results.length < limit + 2) {
        results.push({
          title: item.title,
          link: item.link,
          snippet: `Published: ${item.pubDate} | Source: ${item.source}`,
          source: item.source || 'News Feed'
        });
      }
    }
  } catch {
    // Ignore supplementary news errors
  }

  // 3. Wikipedia API fallback if results are still sparse
  if (results.length < 3) {
    try {
      const isChinese = /[\u4e00-\u9fff]/.test(cleanQuery);
      const wikiHost = isChinese ? 'zh.wikipedia.org' : 'en.wikipedia.org';
      const wikiUrl = `https://${wikiHost}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
        cleanQuery
      )}&utf8=&format=json&srlimit=3`;
      const res = await fetchWithTimeout(wikiUrl, 5000);
      if (res.ok) {
        const data = await res.json();
        const searchItems = data.query?.search || [];
        for (const w of searchItems) {
          results.push({
            title: w.title,
            link: `https://${wikiHost}/wiki/${encodeURIComponent(w.title)}`,
            snippet: decodeHtmlEntities((w.snippet || '').replace(/<[^>]+>/g, '')),
            source: 'Wikipedia'
          });
        }
      }
    } catch {
      // Ignore wiki errors
    }
  }

  const lines = results.map(
    (r, idx) => `${idx + 1}. [${r.source}] ${r.title} — ${r.snippet} (${r.link})`
  );

  return {
    skill: 'web_search',
    query: cleanQuery,
    items: results,
    summaryText:
      results.length > 0
        ? `Live Web Search Results for "${cleanQuery}":\n${lines.join('\n')}`
        : `No live web results found for "${cleanQuery}".`
  };
}

/**
 * Fetches and extracts readable text from a specific URL so JARVIS can read/summarize any webpage.
 * @param {string} url
 * @returns {Promise<{skill: string, url: string, title: string, content: string, summaryText: string}>}
 */
export async function browseUrlContent(url) {
  try {
    const response = await fetchWithTimeout(url, 7500);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? decodeHtmlEntities(titleMatch[1]) : url;
    const content = extractReadableTextFromHtml(html, 3500);

    return {
      skill: 'url_reader',
      url,
      title,
      content,
      items: [{ title, link: url, source: new URL(url).hostname, snippet: content.slice(0, 180) }],
      summaryText: `Webpage Content from ${title} (${url}):\n${content}`
    };
  } catch (error) {
    return {
      skill: 'url_reader',
      url,
      title: url,
      content: '',
      items: [],
      summaryText: `Failed to read URL ${url}: ${
        error instanceof Error ? error.message : 'Connection error'
      }`
    };
  }
}

/**
 * Maps WMO weather code to readable description.
 * @param {number} code
 * @returns {string}
 */
function describeWeatherCode(code) {
  const map = {
    0: '晴朗無雲 (Clear Sky)',
    1: '大致晴朗 (Mainly Clear)',
    2: '局部多雲 (Partly Cloudy)',
    3: '陰天多雲 (Overcast)',
    45: '有霧 (Foggy)',
    51: '毛毛雨 (Light Drizzle)',
    61: '小雨 (Slight Rain)',
    63: '中雨 (Moderate Rain)',
    65: '大雨 (Heavy Rain)',
    80: '局部陣雨 (Rain Showers)',
    81: '強陣雨 (Heavy Showers)',
    95: '雷陣雨 (Thunderstorm)'
  };
  return map[code] || `氣象代碼 ${code}`;
}

/**
 * Fetches live weather telemetry using Open-Meteo (zero API key required).
 * @param {string} [cityQuery='Taipei']
 * @returns {Promise<{skill: string, city: string, data: object | null, items: Array<object>, summaryText: string}>}
 */
export async function fetchWeatherTelemetry(cityQuery = 'Taipei') {
  const cleanCity = (cityQuery || 'Taipei').trim();
  let lat = 25.033;
  let lon = 121.5654;
  let resolvedName = 'Taipei (台北)';

  const presetCities = {
    台北: { lat: 25.033, lon: 121.5654, name: 'Taipei (台北)' },
    臺北: { lat: 25.033, lon: 121.5654, name: 'Taipei (台北)' },
    新北: { lat: 25.0169, lon: 121.4628, name: 'New Taipei (新北)' },
    桃園: { lat: 24.9936, lon: 121.301, name: 'Taoyuan (桃園)' },
    新竹: { lat: 24.8138, lon: 120.9675, name: 'Hsinchu (新竹)' },
    台中: { lat: 24.1477, lon: 120.6736, name: 'Taichung (台中)' },
    臺中: { lat: 24.1477, lon: 120.6736, name: 'Taichung (台中)' },
    台南: { lat: 22.9999, lon: 120.2269, name: 'Tainan (台南)' },
    高雄: { lat: 22.6273, lon: 120.3014, name: 'Kaohsiung (高雄)' },
    東京: { lat: 35.6762, lon: 139.6503, name: 'Tokyo (東京)' },
    倫敦: { lat: 51.5074, lon: -0.1278, name: 'London (倫敦)' },
    紐約: { lat: 40.7128, lon: -74.006, name: 'New York (紐約)' }
  };

  try {
    const matchedPreset = Object.keys(presetCities).find((k) =>
      cleanCity.includes(k)
    );
    if (matchedPreset) {
      lat = presetCities[matchedPreset].lat;
      lon = presetCities[matchedPreset].lon;
      resolvedName = presetCities[matchedPreset].name;
    } else if (!/taipei/i.test(cleanCity)) {
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
        cleanCity
      )}&count=1&language=zh&format=json`;
      const geoRes = await fetchWithTimeout(geoUrl, 4500);
      if (geoRes.ok) {
        const geoData = await geoRes.json();
        const first = geoData.results?.[0];
        if (first) {
          lat = first.latitude;
          lon = first.longitude;
          resolvedName = `${first.name}${first.country ? `, ${first.country}` : ''}`;
        }
      }
    }

    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
    const res = await fetchWithTimeout(weatherUrl, 5500);
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);

    const data = await res.json();
    const cur = data.current || {};
    const daily = data.daily || {};
    const condition = describeWeatherCode(cur.weather_code ?? 0);
    const rainProb = daily.precipitation_probability_max?.[0] ?? 0;
    const maxT = daily.temperature_2m_max?.[0] ?? cur.temperature_2m;
    const minT = daily.temperature_2m_min?.[0] ?? cur.temperature_2m;

    const summary =
      `[Live Weather Telemetry — ${resolvedName}]\n` +
      `- Condition: ${condition}\n` +
      `- Current Temp: ${cur.temperature_2m}°C (Feels like ${cur.apparent_temperature}°C)\n` +
      `- Daily Range: ${minT}°C ~ ${maxT}°C\n` +
      `- Rain Probability: ${rainProb}% | Humidity: ${cur.relative_humidity_2m}% | Wind: ${cur.wind_speed_10m} km/h`;

    return {
      skill: 'weather_telemetry',
      city: resolvedName,
      data: {
        city: resolvedName,
        condition,
        tempC: cur.temperature_2m,
        feelsLikeC: cur.apparent_temperature,
        minTempC: minT,
        maxTempC: maxT,
        rainProbPercent: rainProb,
        humidityPercent: cur.relative_humidity_2m,
        windKmh: cur.wind_speed_10m
      },
      items: [
        {
          title: `${resolvedName}: ${cur.temperature_2m}°C (${condition}) | 降雨機率 ${rainProb}%`,
          link: `https://www.windy.com/${lat}/${lon}?${lat},${lon},10`,
          source: 'Open-Meteo Satellite'
        }
      ],
      summaryText: summary
    };
  } catch (error) {
    return {
      skill: 'weather_telemetry',
      city: resolvedName,
      data: null,
      items: [],
      summaryText: `Weather sensor error: ${error instanceof Error ? error.message : 'Failed'}`
    };
  }
}

/**
 * Fetches live stock, crypto, and FX market quotes from Yahoo Finance v8 API.
 * @param {Array<string>} [symbols]
 * @returns {Promise<{skill: string, quotes: Array<object>, items: Array<object>, summaryText: string}>}
 */
export async function fetchMarketTelemetry(
  symbols = ['^TWII', '2330.TW', 'NVDA', 'AAPL', 'BTC-USD', 'TWD=X']
) {
  const quotes = [];
  const items = [];

  const labelMap = {
    '^TWII': '台股加權指數 (TAIEX)',
    '2330.TW': '台積電 (TSMC 2330)',
    '2317.TW': '鴻海 (Foxconn 2317)',
    '2454.TW': '聯發科 (MediaTek 2454)',
    NVDA: 'NVIDIA (輝達 NVDA)',
    AAPL: 'Apple (蘋果 AAPL)',
    TSLA: 'Tesla (特斯拉 TSLA)',
    MSFT: 'Microsoft (微軟 MSFT)',
    'BTC-USD': 'Bitcoin (比特幣 BTC/USD)',
    'ETH-USD': 'Ethereum (以太幣 ETH/USD)',
    'TWD=X': 'USD/TWD (美金兌台幣匯率)'
  };

  await Promise.all(
    symbols.slice(0, 8).map(async (sym) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
          sym
        )}?interval=1d&range=2d`;
        const res = await fetchWithTimeout(url, 5000);
        if (!res.ok) return;
        const json = await res.json();
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta || typeof meta.regularMarketPrice !== 'number') return;

        const price = meta.regularMarketPrice;
        const prev = meta.chartPreviousClose || meta.previousClose || price;
        const diff = price - prev;
        const pct = prev > 0 ? Number(((diff / prev) * 100).toFixed(2)) : 0;
        const sign = diff >= 0 ? '+' : '';
        const name = labelMap[sym] || sym;

        quotes.push({
          symbol: sym,
          name,
          price,
          currency: meta.currency || 'USD',
          changePercent: pct
        });

        items.push({
          title: `${name}: ${price.toLocaleString()} ${meta.currency || ''} (${sign}${pct}%)`,
          link: `https://finance.yahoo.com/quote/${encodeURIComponent(sym)}`,
          source: 'Market Telemetry'
        });
      } catch {
        // Ignore single symbol error
      }
    })
  );

  const lines = quotes.map(
    (q) =>
      `- ${q.name} [${q.symbol}]: ${q.price} ${q.currency} (${
        q.changePercent >= 0 ? '+' : ''
      }${q.changePercent}%)`
  );

  return {
    skill: 'market_telemetry',
    quotes,
    items,
    summaryText:
      quotes.length > 0
        ? `Live Global Market & FX Telemetry:\n${lines.join('\n')}`
        : 'Market telemetry feed temporarily unavailable.'
  };
}

/**
 * Generates a comprehensive Stark Morning Briefing (Weather + Markets + Taiwan & Tech News + Tasks).
 * @param {object} [options]
 * @param {string} [options.city='Taipei']
 * @param {Array<object>} [options.pendingTasks=[]]
 */
export async function generateMorningBriefing({
  city = 'Taipei',
  pendingTasks = []
} = {}) {
  const [weather, markets, twNews, techNews] = await Promise.all([
    fetchWeatherTelemetry(city),
    fetchMarketTelemetry(['^TWII', '2330.TW', 'NVDA', 'BTC-USD', 'TWD=X']),
    fetchTodaysNews({ edition: 'tw', limit: 4 }),
    fetchTodaysNews({ edition: 'tech', limit: 3 })
  ]);

  const combinedItems = [
    ...(weather.items || []),
    ...(markets.items || []),
    ...(twNews.items || []),
    ...(techNews.items || [])
  ];

  const taskText =
    pendingTasks.length > 0
      ? `Active To-Do Tasks (${pendingTasks.length}):\n` +
        pendingTasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n')
      : 'Active To-Do Tasks: None pending, Sir.';

  const summaryText = [
    `=== STARK MORNING BRIEFING TELEMETRY (${new Date().toLocaleString('zh-TW')}) ===`,
    weather.summaryText,
    markets.summaryText,
    `[Taiwan Top News Headlines]:\n${(twNews.items || [])
      .map((n, i) => `${i + 1}. ${n.title}`)
      .join('\n')}`,
    `[Global AI & Tech News]:\n${(techNews.items || [])
      .map((n, i) => `${i + 1}. ${n.title}`)
      .join('\n')}`,
    taskText
  ].join('\n\n');

  return {
    skill: 'morning_briefing',
    weather: weather.data,
    markets: markets.quotes,
    items: combinedItems.slice(0, 10),
    summaryText
  };
}

/**
 * Detects whether a user message requires live internet skills (news, web search, URL reading, weather, market, morning briefing)
 * and returns the detected intent and extracted query.
 * @param {string} userMessage
 * @param {boolean} [forceWebSearch=false]
 * @returns {{intent: 'none' | 'news' | 'url' | 'search' | 'weather' | 'market' | 'morning_briefing', query: string, edition?: string, url?: string}}
 */
export function detectWebSkillIntent(userMessage, forceWebSearch = false) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { intent: 'none', query: '' };
  }

  const text = userMessage.trim();

  // 0. Check for Morning Briefing protocol
  if (
    /(早安|晨間簡報|每日簡報|morning\s+briefing|good\s+morning\s+jarvis|daily\s+briefing)/i.test(
      text
    )
  ) {
    return { intent: 'morning_briefing', query: text };
  }

  // 1. Check for explicit URL in message
  const urlMatch = text.match(/https?:\/\/[^\s<>")]+/i);
  if (urlMatch) {
    return { intent: 'url', url: urlMatch[0], query: text };
  }

  // 2. Check for Weather Telemetry intent
  if (/(天氣|氣溫|降雨|下雨|帶傘|氣象|weather|temperature|forecast)/i.test(text)) {
    const cityMatch = text.match(
      /(台北|臺北|新北|桃園|新竹|台中|臺中|台南|高雄|東京|倫敦|紐約|Taipei|Tokyo|London|New York)/i
    );
    return {
      intent: 'weather',
      query: cityMatch ? cityMatch[1] : 'Taipei'
    };
  }

  // 3. Check for Stock / Crypto / FX Market intent
  if (
    /(股價|股市|大盤|台積電|輝達|比特幣|以太幣|匯率|美金|台幣|\bNVDA\b|\bTSMC\b|\bAAPL\b|\bTSLA\b|\bBTC\b|\bETH\b|stock\s+price|crypto|exchange\s+rate)/i.test(
      text
    )
  ) {
    return {
      intent: 'market',
      query: text
    };
  }

  // 4. Check for Today's News / Headlines intent
  const newsPattern =
    /(\bnews\b|\bheadlines\b|breaking\s+news|current\s+events|what'?s\s+happening\s+today|新聞|頭條|時事|今日焦點|天下事)/i;
  if (newsPattern.test(text)) {
    const isTech = /(科技|AI|人工智慧|tech|technology|artificial intelligence)/i.test(text);
    const isGlobalEn = /(global|world|us\s+news|english|國際|美國)/i.test(text);

    // Check if user asked for news about a specific topic
    const cleanedTopic = text
      .replace(
        /(請|幫我|告訴我|給我看|查詢|搜尋|今天|今日|最新|有什麼|的|新聞|頭條|焦點|報紙|JARVIS|賈維斯|show\s+me|what\s+is|today'?s|latest|news|headlines|about|on|[，。！？?.,])/gi,
        ' '
      )
      .trim();

    const edition = isTech ? 'tech' : isGlobalEn ? 'us' : 'tw';
    return {
      intent: 'news',
      edition,
      query: cleanedTopic.length >= 2 && !isTech ? cleanedTopic : ''
    };
  }

  // 5. Check for Web Search / Live Lookup intent
  const searchPattern =
    /(上網|搜尋|查一下|查詢|查查|網路上|最新|即時|2025|2026|search\s+the\s+web|search\s+for|look\s+up|google|browse|find\s+out|current\s+price)/i;
  if (forceWebSearch || searchPattern.test(text)) {
    const cleanedQuery = text
      .replace(
        /^(JARVIS|賈維斯)?[，,\s]*(請|幫我|可以幫我)?(上網|到網路上)?(搜尋|查一下|查詢|查查|search\s+the\s+web\s+for|search\s+for|look\s+up)/i,
        ''
      )
      .trim();
    return {
      intent: 'search',
      query: cleanedQuery || text
    };
  }

  return { intent: 'none', query: '' };
}

/**
 * Executes the appropriate web skill based on detected intent.
 * @param {string} userMessage
 * @param {object} [options]
 * @param {boolean} [options.forceWebSearch=false]
 * @param {Array<object>} [options.pendingTasks=[]]
 * @returns {Promise<{executed: boolean, skill: string, items: Array<any>, contextBlock: string}>}
 */
export async function executeWebSkillForMessage(
  userMessage,
  { forceWebSearch = false, pendingTasks = [] } = {}
) {
  const detected = detectWebSkillIntent(userMessage, forceWebSearch);

  if (detected.intent === 'none') {
    return { executed: false, skill: 'none', items: [], contextBlock: '' };
  }

  if (detected.intent === 'morning_briefing') {
    const res = await generateMorningBriefing({ city: 'Taipei', pendingTasks });
    return {
      executed: true,
      skill: 'morning_briefing',
      items: res.items || [],
      contextBlock: res.summaryText
    };
  }

  if (detected.intent === 'weather') {
    const res = await fetchWeatherTelemetry(detected.query || 'Taipei');
    return {
      executed: true,
      skill: 'weather_telemetry',
      items: res.items || [],
      contextBlock: res.summaryText
    };
  }

  if (detected.intent === 'market') {
    const res = await fetchMarketTelemetry();
    return {
      executed: true,
      skill: 'market_telemetry',
      items: res.items || [],
      contextBlock: res.summaryText
    };
  }

  if (detected.intent === 'url' && detected.url) {
    const res = await browseUrlContent(detected.url);
    return {
      executed: true,
      skill: 'url_reader',
      items: res.items || [],
      contextBlock: res.summaryText
    };
  }

  if (detected.intent === 'news') {
    const res = await fetchTodaysNews({
      edition: detected.edition || 'tw',
      query: detected.query || '',
      limit: 8
    });
    return {
      executed: true,
      skill: 'todays_news',
      items: res.items || [],
      contextBlock: res.summaryText
    };
  }

  if (detected.intent === 'search') {
    const res = await searchWebIntelligence(detected.query, 6);
    return {
      executed: true,
      skill: 'web_search',
      items: res.items || [],
      contextBlock: res.summaryText
    };
  }

  return { executed: false, skill: 'none', items: [], contextBlock: '' };
}
