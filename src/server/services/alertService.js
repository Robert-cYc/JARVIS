/**
 * Stark Sentinel — Watchlist / Gold Price Alerts & Taiwan Earthquake Monitor
 * Pure Node.js built-ins only (no external dependencies).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { normalizeWatchlistSymbol } from './memoryVaultService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_ALERTS_PATH = path.resolve(__dirname, '../../../data/jarvis_alerts.json');

/** Special pseudo-symbol for Bank of Taiwan Gold Passbook price in NT$ per 台錢 (3.75 g). */
export const GOLD_TWD_SYMBOL = 'GOLD_TWD';

const MAX_PRICE_ALERTS = 30;
const MAX_EVENTS = 50;
const MAX_SEEN_QUAKES = 300;

/** Geographic reference points for distance reporting. */
const TAIWAN_CENTER = { lat: 23.7, lon: 121.0 };
const KAOHSIUNG = { lat: 22.6273, lon: 120.3014 };
const TAIPEI = { lat: 25.033, lon: 121.5654 };

const USGS_FEED_BASE = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary';

const SYMBOL_ALIASES = [
  { pattern: /比特幣|\bbitcoin\b|\bBTC\b/i, symbol: 'BTC-USD' },
  { pattern: /以太幣|\bethereum\b|\bETH\b/i, symbol: 'ETH-USD' },
  { pattern: /台積電|\bTSMC\b/i, symbol: '2330.TW' },
  { pattern: /輝達|\bnvidia\b/i, symbol: 'NVDA' },
  { pattern: /聯發科/i, symbol: '2454.TW' },
  { pattern: /鴻海/i, symbol: '2317.TW' },
  { pattern: /特斯拉|\btesla\b/i, symbol: 'TSLA' },
  { pattern: /蘋果/i, symbol: 'AAPL' },
  { pattern: /大盤|加權指數|台股指數|\bTAIEX\b/i, symbol: '^TWII' },
  { pattern: /白銀|\bsilver\b/i, symbol: 'SI=F' },
  { pattern: /美金|美元匯率|匯率|\bUSD\s*\/?\s*TWD\b/i, symbol: 'TWD=X' }
];

const TICKER_STOPWORDS = new Set([
  'JARVIS', 'NT', 'US', 'USD', 'TWD', 'AI', 'OK', 'I', 'A', 'ME', 'IF', 'PM', 'AM', 'HUD'
]);

const DEFAULT_STATE = {
  priceAlerts: [],
  events: [],
  seenQuakeIds: [],
  quakeBaselineDone: false,
  settings: {
    earthquakeAlertsEnabled: true,
    minQuakeMagnitude: 4.5,
    quakeRadiusKm: 350
  }
};

// ---------------------------------------------------------------------------
// Persistence (with an in-process write lock to avoid monitor/API races)
// ---------------------------------------------------------------------------

let stateLock = Promise.resolve();

/**
 * Serializes read-modify-write operations on the alerts state file.
 * @template T
 * @param {() => Promise<T>} task
 * @returns {Promise<T>}
 */
function withStateLock(task) {
  const run = stateLock.then(task, task);
  stateLock = run.catch(() => {});
  return run;
}

/**
 * Loads the alerts state from disk, falling back to defaults.
 * @param {string} [alertsPath]
 * @returns {Promise<typeof DEFAULT_STATE>}
 */
export async function getAlertState(alertsPath = DEFAULT_ALERTS_PATH) {
  try {
    const raw = await fs.readFile(alertsPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      priceAlerts: Array.isArray(parsed.priceAlerts) ? parsed.priceAlerts : [],
      events: Array.isArray(parsed.events) ? parsed.events : [],
      seenQuakeIds: Array.isArray(parsed.seenQuakeIds) ? parsed.seenQuakeIds : [],
      quakeBaselineDone: Boolean(parsed.quakeBaselineDone),
      settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) }
    };
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      console.warn(`[J.A.R.V.I.S. SENTINEL] Alerts state unreadable, resetting: ${error.message}`);
    }
    return structuredClone(DEFAULT_STATE);
  }
}

/**
 * Writes the alerts state to disk.
 * @param {typeof DEFAULT_STATE} state
 * @param {string} [alertsPath]
 */
async function saveAlertState(state, alertsPath = DEFAULT_ALERTS_PATH) {
  await fs.mkdir(path.dirname(alertsPath), { recursive: true });
  await fs.writeFile(alertsPath, JSON.stringify(state, null, 2), 'utf-8');
}

// ---------------------------------------------------------------------------
// Natural-language price alert parsing
// ---------------------------------------------------------------------------

/**
 * Resolves the symbol for a price alert from aliases or explicit tickers.
 * @param {string} fullText - Entire user message
 * @param {string} prefixText - Text preceding the direction keyword
 * @param {number} threshold
 * @param {boolean} isPercent
 * @returns {string}
 */
function resolveAlertSymbol(fullText, prefixText, threshold, isPercent) {
  if (/黃金|金價|\bgold\b|\bXAU\b|GC=F/i.test(fullText)) {
    const mentionsTwd = /NT\$|台幣|新台幣|台錢|每錢|一錢|存摺|台銀|\bTWD\b/i.test(fullText);
    // NT$ per 台錢 is ~5 digits; USD per oz is ~4 digits.
    if (mentionsTwd || (!isPercent && threshold >= 8000)) return GOLD_TWD_SYMBOL;
    return 'GC=F';
  }

  for (const alias of SYMBOL_ALIASES) {
    if (alias.pattern.test(fullText)) return alias.symbol;
  }

  const tickerRegex =
    /(?<![A-Za-z0-9])(\^?[A-Z]{1,5}(?:[=.-][A-Z]{1,4})?|\d{4,6}[A-Z]?(?:\.TW)?)(?![A-Za-z0-9])/g;
  const candidates = [...prefixText.matchAll(tickerRegex)]
    .map((m) => m[1])
    .filter((tok) => !TICKER_STOPWORDS.has(tok));

  if (candidates.length === 0) return '';
  return normalizeWatchlistSymbol(candidates[candidates.length - 1]);
}

/**
 * Parses natural-language price alert commands.
 * Examples:
 *  - "黃金漲破 NT$16,000 通知我"      → GOLD_TWD above 16000
 *  - "0050 跌 3% 提醒我"              → 0050.TW change_down 3
 *  - "alert me if NVDA drops below 100" → NVDA below 100
 *  - "0050 > 180" (requireTrigger=false, used by the +ALERT button)
 * @param {string} userMessage
 * @param {{requireTrigger?: boolean}} [options]
 * @returns {{symbol: string, condition: 'above' | 'below' | 'change_up' | 'change_down', threshold: number} | null}
 */
export function parseAlertCommand(userMessage, { requireTrigger = true } = {}) {
  if (!userMessage || typeof userMessage !== 'string') return null;
  const text = userMessage.trim();

  if (
    requireTrigger &&
    !/(通知|提醒|警示|告訴我|叫我|\balert\b|\bnotify\b|\bremind\b|\btell\s+me\b|\bping\s+me\b)/i.test(text)
  ) {
    return null;
  }

  const numberPart = '(?:NT\\$|US\\$|\\$)?\\s*([\\d,]+(?:\\.\\d+)?)';

  const percentMatch = text.match(
    /(漲|跌|上漲|下跌|\bup\b|\bdown\b|\brises?\b|\bdrops?\b|\bfalls?\b|\bgains?\b|\bloses?\b)\s*(?:超過|逾|達|by|of|more\s+than|over)?\s*([\d.]+)\s*%/i
  );
  if (percentMatch) {
    const threshold = Number(percentMatch[2]);
    if (!(threshold > 0)) return null;
    const isUp = /漲|up|rise|gain/i.test(percentMatch[1]);
    const symbol = resolveAlertSymbol(text, text.slice(0, percentMatch.index), threshold, true);
    if (!symbol) return null;
    return { symbol, condition: isUp ? 'change_up' : 'change_down', threshold };
  }

  const belowMatch = text.match(
    new RegExp(
      `(跌破|低於|跌到|跌至|小於|(?:drops?|falls?|goes|dips?)\\s+(?:below|under)|\\bbelow\\b|\\bunder\\b|<=?|≤)\\s*${numberPart}`,
      'i'
    )
  );
  const aboveMatch = text.match(
    new RegExp(
      `(漲破|突破|超過|高於|站上|漲到|漲至|大於|(?:rises?|goes|climbs?|breaks?)\\s+(?:above|over)|\\babove\\b|\\bover\\b|\\bexceeds?\\b|>=?|≥)\\s*${numberPart}`,
      'i'
    )
  );

  const directionMatch = belowMatch || aboveMatch;
  if (!directionMatch) return null;

  const threshold = Number(directionMatch[2].replace(/,/g, ''));
  if (!(threshold > 0)) return null;

  const symbol = resolveAlertSymbol(text, text.slice(0, directionMatch.index), threshold, false);
  if (!symbol) return null;

  return { symbol, condition: belowMatch ? 'below' : 'above', threshold };
}

/**
 * Builds a human-readable description of a price alert.
 * @param {{symbol: string, condition: string, threshold: number}} alert
 * @returns {string}
 */
export function describeAlert(alert) {
  const name = alert.symbol === GOLD_TWD_SYMBOL ? '台銀黃金存摺 (NT$/台錢)' : alert.symbol;
  const value = Number(alert.threshold).toLocaleString();
  switch (alert.condition) {
    case 'above':
      return `${name} ≥ ${value}`;
    case 'below':
      return `${name} ≤ ${value}`;
    case 'change_up':
      return `${name} 單日漲幅 ≥ +${value}%`;
    case 'change_down':
      return `${name} 單日跌幅 ≥ -${value}%`;
    default:
      return `${name} ${alert.condition} ${value}`;
  }
}

/**
 * Evaluates whether a price alert condition is met by a quote snapshot.
 * @param {{condition: string, threshold: number}} alert
 * @param {{price: number, changePercent?: number} | null | undefined} quote
 * @returns {boolean}
 */
export function evaluatePriceAlert(alert, quote) {
  if (!quote || typeof quote.price !== 'number' || Number.isNaN(quote.price)) return false;
  const pct = typeof quote.changePercent === 'number' ? quote.changePercent : 0;
  switch (alert.condition) {
    case 'above':
      return quote.price >= alert.threshold;
    case 'below':
      return quote.price <= alert.threshold;
    case 'change_up':
      return pct >= alert.threshold;
    case 'change_down':
      return pct <= -alert.threshold;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// Price alert CRUD
// ---------------------------------------------------------------------------

/**
 * Creates a new price alert.
 * @param {{symbol: string, condition: string, threshold: number}} spec
 * @param {string} [alertsPath]
 */
export async function addPriceAlert(spec, alertsPath = DEFAULT_ALERTS_PATH) {
  if (!spec || !spec.symbol || !(Number(spec.threshold) > 0)) {
    throw new Error('Valid alert symbol, condition, and threshold are required');
  }
  if (!['above', 'below', 'change_up', 'change_down'].includes(spec.condition)) {
    throw new Error(`Unsupported alert condition: ${spec.condition}`);
  }

  return withStateLock(async () => {
    const state = await getAlertState(alertsPath);
    const alert = {
      id: crypto.randomUUID(),
      symbol: spec.symbol,
      condition: spec.condition,
      threshold: Number(spec.threshold),
      label: describeAlert(spec),
      triggered: false,
      createdAt: new Date().toISOString()
    };
    state.priceAlerts.unshift(alert);
    state.priceAlerts = state.priceAlerts.slice(0, MAX_PRICE_ALERTS);
    await saveAlertState(state, alertsPath);
    return alert;
  });
}

/**
 * Deletes a price alert by ID.
 * @param {string} id
 * @param {string} [alertsPath]
 */
export async function deletePriceAlert(id, alertsPath = DEFAULT_ALERTS_PATH) {
  return withStateLock(async () => {
    const state = await getAlertState(alertsPath);
    state.priceAlerts = state.priceAlerts.filter((a) => a.id !== id);
    await saveAlertState(state, alertsPath);
    return state;
  });
}

/**
 * Marks alert events as acknowledged (already shown on the HUD).
 * @param {string[]} ids
 * @param {string} [alertsPath]
 */
export async function acknowledgeAlertEvents(ids, alertsPath = DEFAULT_ALERTS_PATH) {
  const idSet = new Set(Array.isArray(ids) ? ids : []);
  return withStateLock(async () => {
    const state = await getAlertState(alertsPath);
    for (const evt of state.events) {
      if (idSet.has(evt.id)) evt.acknowledged = true;
    }
    await saveAlertState(state, alertsPath);
    return state;
  });
}

/**
 * Updates sentinel settings (earthquake alerts toggle / magnitude threshold).
 * @param {{earthquakeAlertsEnabled?: boolean, minQuakeMagnitude?: number}} patch
 * @param {string} [alertsPath]
 */
export async function updateAlertSettings(patch, alertsPath = DEFAULT_ALERTS_PATH) {
  return withStateLock(async () => {
    const state = await getAlertState(alertsPath);
    if (typeof patch?.earthquakeAlertsEnabled === 'boolean') {
      state.settings.earthquakeAlertsEnabled = patch.earthquakeAlertsEnabled;
    }
    const mag = Number(patch?.minQuakeMagnitude);
    if (mag >= 2.5 && mag <= 9) {
      state.settings.minQuakeMagnitude = mag;
    }
    await saveAlertState(state, alertsPath);
    return state;
  });
}

// ---------------------------------------------------------------------------
// Earthquake telemetry (USGS GeoJSON, no API key required)
// ---------------------------------------------------------------------------

/**
 * Great-circle distance in kilometres.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number}
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Filters a USGS GeoJSON feed down to earthquakes in/near Taiwan.
 * @param {object} geojson
 * @param {{minMagnitude?: number, radiusKm?: number}} [options]
 * @returns {Array<{id: string, magnitude: number, place: string, time: number, depthKm: number, lat: number, lon: number, distanceToKaohsiungKm: number, distanceToTaipeiKm: number, url: string}>}
 */
export function filterTaiwanQuakes(geojson, { minMagnitude = 4.5, radiusKm = 350 } = {}) {
  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  const quakes = [];

  for (const f of features) {
    const mag = f?.properties?.mag;
    const coords = f?.geometry?.coordinates;
    if (typeof mag !== 'number' || !Array.isArray(coords) || coords.length < 2) continue;
    if (mag < minMagnitude) continue;

    const [lon, lat, depth] = coords;
    if (haversineKm(lat, lon, TAIWAN_CENTER.lat, TAIWAN_CENTER.lon) > radiusKm) continue;

    quakes.push({
      id: String(f.id),
      magnitude: Number(mag.toFixed(1)),
      place: f.properties.place || 'Taiwan region',
      time: Number(f.properties.time) || 0,
      depthKm: typeof depth === 'number' ? Number(depth.toFixed(1)) : 0,
      lat,
      lon,
      distanceToKaohsiungKm: Math.round(haversineKm(lat, lon, KAOHSIUNG.lat, KAOHSIUNG.lon)),
      distanceToTaipeiKm: Math.round(haversineKm(lat, lon, TAIPEI.lat, TAIPEI.lon)),
      url: f.properties.url || 'https://earthquake.usgs.gov/earthquakes/map/'
    });
  }

  return quakes.sort((a, b) => b.time - a.time);
}

/**
 * Formats a quake into a Traditional Chinese / English summary line.
 * @param {ReturnType<typeof filterTaiwanQuakes>[number]} q
 * @returns {string}
 */
export function formatQuakeLine(q) {
  const when = new Date(q.time).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
  return (
    `M${q.magnitude} — ${q.place} | ${when} (台灣時間) | 深度 ${q.depthKm} km | ` +
    `距高雄 ${q.distanceToKaohsiungKm} km / 距台北 ${q.distanceToTaipeiKm} km`
  );
}

/**
 * Fetches recent earthquakes near Taiwan from USGS.
 * @param {{feed?: '2.5_hour' | '2.5_day' | '2.5_week', minMagnitude?: number, radiusKm?: number}} [options]
 */
export async function fetchTaiwanEarthquakes({
  feed = '2.5_week',
  minMagnitude = 4.0,
  radiusKm = 350
} = {}) {
  const url = `${USGS_FEED_BASE}/${feed}.geojson`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`USGS HTTP ${res.status}`);

    const quakes = filterTaiwanQuakes(await res.json(), { minMagnitude, radiusKm });
    const top = quakes.slice(0, 8);

    return {
      skill: 'earthquake_telemetry',
      quakes,
      items: top.map((q) => ({
        title: `🌋 ${formatQuakeLine(q)}`,
        link: q.url,
        source: 'USGS Seismic Feed'
      })),
      summaryText:
        top.length > 0
          ? `[Taiwan Region Seismic Telemetry — USGS, M${minMagnitude}+ within ${radiusKm} km]:\n${top
              .map((q, i) => `${i + 1}. ${formatQuakeLine(q)}`)
              .join('\n')}`
          : `No M${minMagnitude}+ earthquakes recorded near Taiwan in the selected window (USGS ${feed}).`
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Network error';
    return {
      skill: 'earthquake_telemetry',
      quakes: [],
      items: [],
      summaryText: `Seismic telemetry unavailable: ${reason}`
    };
  }
}

// ---------------------------------------------------------------------------
// Monitor cycle
// ---------------------------------------------------------------------------

/**
 * Pushes a new event into state (newest first, capped).
 * @param {typeof DEFAULT_STATE} state
 * @param {{kind: string, title: string, message: string, link?: string}} evt
 */
function pushEvent(state, evt) {
  const event = {
    id: crypto.randomUUID(),
    acknowledged: false,
    createdAt: new Date().toISOString(),
    ...evt
  };
  state.events.unshift(event);
  state.events = state.events.slice(0, MAX_EVENTS);
  return event;
}

/**
 * Runs a single sentinel check cycle: evaluates price alerts and scans for new Taiwan earthquakes.
 * Dependencies are injectable for unit testing.
 * @param {object} deps
 * @param {(symbols: string[]) => Promise<Record<string, {price: number, changePercent?: number}>>} deps.fetchQuotes
 * @param {(opts: object) => Promise<{quakes: Array<object>}>} [deps.fetchQuakes]
 * @param {string} [deps.alertsPath]
 * @param {number} [deps.now]
 * @returns {Promise<Array<object>>} Newly created events
 */
export async function runAlertCheckCycle({
  fetchQuotes,
  fetchQuakes = fetchTaiwanEarthquakes,
  alertsPath = DEFAULT_ALERTS_PATH,
  now = Date.now()
}) {
  const snapshot = await getAlertState(alertsPath);
  const pending = snapshot.priceAlerts.filter((a) => !a.triggered);
  const symbols = [...new Set(pending.map((a) => a.symbol))];

  let quotes = {};
  if (symbols.length > 0) {
    try {
      quotes = (await fetchQuotes(symbols)) || {};
    } catch (error) {
      console.warn(`[J.A.R.V.I.S. SENTINEL] Quote fetch failed: ${error.message}`);
    }
  }

  let quakeResult = null;
  if (snapshot.settings.earthquakeAlertsEnabled) {
    try {
      quakeResult = await fetchQuakes({
        feed: '2.5_day',
        minMagnitude: snapshot.settings.minQuakeMagnitude,
        radiusKm: snapshot.settings.quakeRadiusKm
      });
    } catch (error) {
      console.warn(`[J.A.R.V.I.S. SENTINEL] Quake fetch failed: ${error.message}`);
    }
  }

  return withStateLock(async () => {
    const state = await getAlertState(alertsPath);
    const newEvents = [];

    for (const alert of state.priceAlerts) {
      if (alert.triggered) continue;
      const quote = quotes[alert.symbol];
      if (!evaluatePriceAlert(alert, quote)) continue;

      alert.triggered = true;
      alert.triggeredAt = new Date(now).toISOString();
      alert.triggeredPrice = quote.price;

      const priceText =
        alert.symbol === GOLD_TWD_SYMBOL
          ? `NT$${Math.round(quote.price).toLocaleString()} / 台錢`
          : `${Number(quote.price).toLocaleString()}`;
      const pctText =
        typeof quote.changePercent === 'number'
          ? ` (單日 ${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}%)`
          : '';

      newEvents.push(
        pushEvent(state, {
          kind: 'price',
          title: `📈 PRICE ALERT: ${alert.label}`,
          message: `價格警示觸發：${alert.label}。目前報價 ${priceText}${pctText}。`,
          link:
            alert.symbol === GOLD_TWD_SYMBOL
              ? 'https://rate.bot.com.tw/gold?Lang=zh-TW'
              : `https://finance.yahoo.com/quote/${encodeURIComponent(alert.symbol)}`
        })
      );
    }

    if (quakeResult && Array.isArray(quakeResult.quakes)) {
      const seen = new Set(state.seenQuakeIds);

      if (!state.quakeBaselineDone) {
        // First run: record existing quakes silently to avoid an alert flood.
        quakeResult.quakes.forEach((q) => seen.add(q.id));
        state.quakeBaselineDone = true;
      } else {
        for (const q of quakeResult.quakes) {
          if (seen.has(q.id)) continue;
          seen.add(q.id);
          // Ignore stale quakes (older than 3 hours) that appear late in the feed.
          if (now - q.time > 3 * 3600 * 1000) continue;

          newEvents.push(
            pushEvent(state, {
              kind: 'earthquake',
              title: `🌋 SEISMIC ALERT: M${q.magnitude} near Taiwan`,
              message: `地震警示：${formatQuakeLine(q)}。`,
              link: q.url
            })
          );
        }
      }

      state.seenQuakeIds = [...seen].slice(-MAX_SEEN_QUAKES);
    }

    await saveAlertState(state, alertsPath);
    return newEvents;
  });
}

/**
 * Pushes an arbitrary alert event into state (used by automation triggers).
 * @param {{kind: string, title: string, message: string, link?: string, speechText?: string}} evt
 * @param {string} [alertsPath]
 * @returns {Promise<object>}
 */
export async function pushAlertEvent(evt, alertsPath = DEFAULT_ALERTS_PATH) {
  return withStateLock(async () => {
    const state = await getAlertState(alertsPath);
    const event = pushEvent(state, evt);
    await saveAlertState(state, alertsPath);
    return event;
  });
}

let monitorTimer = null;

/**
 * Starts the background sentinel monitor.
 * @param {object} options
 * @param {(symbols: string[]) => Promise<Record<string, {price: number, changePercent?: number}>>} options.fetchQuotes
 * @param {number} [options.intervalMs=60000]
 */
export function startAlertMonitor({ fetchQuotes, intervalMs = 60000 }) {
  stopAlertMonitor();
  const tick = async () => {
    try {
      const events = await runAlertCheckCycle({ fetchQuotes });
      for (const evt of events) {
        console.log(`[J.A.R.V.I.S. SENTINEL] ${evt.title}`);
      }
    } catch (error) {
      console.warn(`[J.A.R.V.I.S. SENTINEL] Check cycle failed: ${error.message}`);
    }
  };
  monitorTimer = setInterval(tick, intervalMs);
  monitorTimer.unref();
  setTimeout(tick, 5000).unref();
}

/** Stops the background sentinel monitor. */
export function stopAlertMonitor() {
  if (monitorTimer) {
    clearInterval(monitorTimer);
    monitorTimer = null;
  }
}
