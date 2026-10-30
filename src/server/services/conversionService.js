/**
 * Stark Precision Converter — Live Currency & Scientific/Imperial Unit Conversion Engine
 * Zero external dependencies: uses built-in math & Yahoo Finance FX quotes.
 */

// ---------------------------------------------------------------------------
// Unit conversion tables (Length, Mass, Volume, Temperature, Area, Speed, Data)
// ---------------------------------------------------------------------------

const LENGTH_FACTORS = {
  m: 1,
  meter: 1,
  meters: 1,
  米: 1,
  公尺: 1,
  km: 1000,
  kilometer: 1000,
  kilometers: 1000,
  公里: 1000,
  cm: 0.01,
  centimeter: 0.01,
  centimeters: 0.01,
  公分: 0.01,
  mm: 0.001,
  millimeter: 0.001,
  公釐: 0.001,
  毫米: 0.001,
  inch: 0.0254,
  inches: 0.0254,
  in: 0.0254,
  吋: 0.0254,
  英寸: 0.0254,
  foot: 0.3048,
  feet: 0.3048,
  ft: 0.3048,
  呎: 0.3048,
  英尺: 0.3048,
  yard: 0.9144,
  yards: 0.9144,
  yd: 0.9144,
  碼: 0.9144,
  mile: 1609.344,
  miles: 1609.344,
  mi: 1609.344,
  英里: 1609.344,
  哩: 1609.344,
  nmi: 1852,
  海里: 1852,
  浬: 1852
};

const MASS_FACTORS = {
  kg: 1,
  kilogram: 1,
  kilograms: 1,
  公斤: 1,
  g: 0.001,
  gram: 0.001,
  grams: 0.001,
  克: 0.001,
  公克: 0.001,
  mg: 0.000001,
  milligram: 0.000001,
  毫克: 0.000001,
  lb: 0.45359237,
  lbs: 0.45359237,
  pound: 0.45359237,
  pounds: 0.45359237,
  磅: 0.45359237,
  oz: 0.028349523125,
  ounce: 0.028349523125,
  ounces: 0.028349523125,
  盎司: 0.028349523125,
  ton: 1000,
  tons: 1000,
  tonne: 1000,
  公噸: 1000,
  噸: 1000,
  // Taiwan traditional weight units
  台斤: 0.6,
  市斤: 0.5,
  斤: 0.6,
  台兩: 0.0375,
  兩: 0.0375,
  台錢: 0.00375,
  錢: 0.00375
};

const VOLUME_FACTORS = {
  l: 1,
  liter: 1,
  liters: 1,
  公升: 1,
  升: 1,
  ml: 0.001,
  milliliter: 0.001,
  毫升: 0.001,
  cc: 0.001,
  gal: 3.785411784,
  gallon: 3.785411784,
  gallons: 3.785411784,
  加侖: 3.785411784,
  美加侖: 3.785411784,
  fl_oz: 0.0295735295625,
  液體盎司: 0.0295735295625,
  pint: 0.473176473,
  品脫: 0.473176473,
  cup: 0.24,
  杯: 0.24
};

const AREA_FACTORS = {
  m2: 1,
  平方公尺: 1,
  平方米: 1,
  sqm: 1,
  km2: 1000000,
  平方公里: 1000000,
  sqft: 0.09290304,
  平方英尺: 0.09290304,
  平方呎: 0.09290304,
  acre: 4046.8564224,
  acres: 4046.8564224,
  英畝: 4046.8564224,
  ha: 10000,
  公頃: 10000,
  // Taiwan traditional area
  坪: 3.305785,
  甲: 9699.17
};

const SPEED_FACTORS = {
  kmh: 1,
  'km/h': 1,
  公里小時: 1,
  時速: 1,
  mph: 1.609344,
  英里小時: 1.609344,
  ms: 3.6,
  'm/s': 3.6,
  公尺秒: 3.6,
  knot: 1.852,
  knots: 1.852,
  節: 1.852
};

const DATA_FACTORS = {
  b: 1,
  byte: 1,
  bytes: 1,
  位元組: 1,
  kb: 1024,
  mb: 1048576,
  gb: 1073741824,
  tb: 1099511627776
};

// ---------------------------------------------------------------------------
// Currency Codes and Alias Mapping
// ---------------------------------------------------------------------------

export const CURRENCY_ALIASES = {
  twd: 'TWD',
  nt: 'TWD',
  ntd: 'TWD',
  台幣: 'TWD',
  新台幣: 'TWD',
  usd: 'USD',
  us: 'USD',
  美金: 'USD',
  美元: 'USD',
  jpy: 'JPY',
  yen: 'JPY',
  日圓: 'JPY',
  日幣: 'JPY',
  eur: 'EUR',
  euro: 'EUR',
  歐元: 'EUR',
  gbp: 'GBP',
  英鎊: 'GBP',
  鎊: 'GBP',
  cny: 'CNY',
  rmb: 'CNY',
  人民幣: 'CNY',
  hkd: 'HKD',
  港幣: 'HKD',
  krw: 'KRW',
  韓元: 'KRW',
  韓幣: 'KRW',
  aud: 'AUD',
  澳幣: 'AUD',
  cad: 'CAD',
  加幣: 'CAD',
  sgd: 'SGD',
  星幣: 'SGD',
  新加坡幣: 'SGD',
  chf: 'CHF',
  瑞郎: 'CHF',
  瑞士法郎: 'CHF',
  btc: 'BTC',
  比特幣: 'BTC',
  eth: 'ETH',
  以太幣: 'ETH'
};

const CURRENCY_SYMBOLS = {
  TWD: 'NT$',
  USD: '$',
  EUR: '€',
  JPY: '¥',
  GBP: '£',
  CNY: '¥',
  HKD: 'HK$',
  KRW: '₩',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
  CHF: 'CHF',
  BTC: '₿',
  ETH: 'Ξ'
};

// ---------------------------------------------------------------------------
// Unit Conversion Logic
// ---------------------------------------------------------------------------

/**
 * Checks if input is temperature conversion and evaluates it.
 * @param {number} value
 * @param {string} fromUnit
 * @param {string} toUnit
 * @returns {{value: number, fromUnit: string, toUnit: string, result: number} | null}
 */
export function convertTemperature(value, fromUnit, toUnit) {
  const normFrom = fromUnit.toLowerCase().trim();
  const normTo = toUnit.toLowerCase().trim();

  const isCelsius = /^(c|celsius|攝氏|度c)$/i.test(normFrom);
  const isFahrenheit = /^(f|fahrenheit|華氏|度f)$/i.test(normFrom);
  const isKelvin = /^(k|kelvin|克氏|絕對溫度)$/i.test(normFrom);

  const targetCelsius = /^(c|celsius|攝氏|度c)$/i.test(normTo);
  const targetFahrenheit = /^(f|fahrenheit|華氏|度f)$/i.test(normTo);
  const targetKelvin = /^(k|kelvin|克氏|絕對溫度)$/i.test(normTo);

  if (!((isCelsius || isFahrenheit || isKelvin) && (targetCelsius || targetFahrenheit || targetKelvin))) {
    return null;
  }

  // First convert to Celsius
  let celsius = value;
  if (isFahrenheit) celsius = (value - 32) * (5 / 9);
  else if (isKelvin) celsius = value - 273.15;

  // Convert from Celsius to target
  let result = celsius;
  if (targetFahrenheit) result = celsius * (9 / 5) + 32;
  else if (targetKelvin) result = celsius + 273.15;

  return {
    value,
    fromUnit: isCelsius ? '°C' : isFahrenheit ? '°F' : 'K',
    toUnit: targetCelsius ? '°C' : targetFahrenheit ? '°F' : 'K',
    result: Number(result.toFixed(2))
  };
}

/**
 * Converts generic physical units.
 * @param {number} value
 * @param {string} from
 * @param {string} to
 * @returns {{category: string, value: number, fromUnit: string, toUnit: string, result: number} | null}
 */
export function convertPhysicalUnit(value, from, to) {
  const normFrom = from.toLowerCase().replace(/[\s度]/g, '');
  const normTo = to.toLowerCase().replace(/[\s度]/g, '');

  // 1. Temperature
  const tempRes = convertTemperature(value, normFrom, normTo);
  if (tempRes) {
    return { category: 'temperature', ...tempRes };
  }

  // 2. Length
  if (LENGTH_FACTORS[normFrom] && LENGTH_FACTORS[normTo]) {
    const baseMeters = value * LENGTH_FACTORS[normFrom];
    const result = baseMeters / LENGTH_FACTORS[normTo];
    return { category: 'length', value, fromUnit: from, toUnit: to, result: Number(result.toFixed(4)) };
  }

  // 3. Mass
  if (MASS_FACTORS[normFrom] && MASS_FACTORS[normTo]) {
    const baseKg = value * MASS_FACTORS[normFrom];
    const result = baseKg / MASS_FACTORS[normTo];
    return { category: 'mass', value, fromUnit: from, toUnit: to, result: Number(result.toFixed(4)) };
  }

  // 4. Volume
  if (VOLUME_FACTORS[normFrom] && VOLUME_FACTORS[normTo]) {
    const baseL = value * VOLUME_FACTORS[normFrom];
    const result = baseL / VOLUME_FACTORS[normTo];
    return { category: 'volume', value, fromUnit: from, toUnit: to, result: Number(result.toFixed(4)) };
  }

  // 5. Area
  if (AREA_FACTORS[normFrom] && AREA_FACTORS[normTo]) {
    const baseSqm = value * AREA_FACTORS[normFrom];
    const result = baseSqm / AREA_FACTORS[normTo];
    return { category: 'area', value, fromUnit: from, toUnit: to, result: Number(result.toFixed(4)) };
  }

  // 6. Speed
  if (SPEED_FACTORS[normFrom] && SPEED_FACTORS[normTo]) {
    const baseKmh = value * SPEED_FACTORS[normFrom];
    const result = baseKmh / SPEED_FACTORS[normTo];
    return { category: 'speed', value, fromUnit: from, toUnit: to, result: Number(result.toFixed(4)) };
  }

  // 7. Digital Data
  if (DATA_FACTORS[normFrom] && DATA_FACTORS[normTo]) {
    const baseBytes = value * DATA_FACTORS[normFrom];
    const result = baseBytes / DATA_FACTORS[normTo];
    return { category: 'data', value, fromUnit: from, toUnit: to, result: Number(result.toFixed(4)) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Currency Conversion Logic (Live FX Telemetry)
// ---------------------------------------------------------------------------

/**
 * Normalizes user currency string to standard 3-letter ISO code.
 * @param {string} raw
 * @returns {string | null}
 */
export function resolveCurrencyCode(raw) {
  if (!raw) return null;
  const clean = raw.toLowerCase().trim().replace(/[\$¥€£₩]/g, '');
  return CURRENCY_ALIASES[clean] || (clean.length === 3 && /^[a-z]{3}$/.test(clean) ? clean.toUpperCase() : null);
}

/**
 * Fetches real-time exchange rate between two currencies via Yahoo Finance FX pairs.
 * @param {string} fromCurr - Standard currency code (e.g. 'USD')
 * @param {string} toCurr - Standard currency code (e.g. 'TWD')
 * @returns {Promise<{rate: number, pair: string, timestamp: string} | null>}
 */
export async function fetchLiveExchangeRate(fromCurr, toCurr) {
  const from = fromCurr.toUpperCase();
  const to = toCurr.toUpperCase();
  if (from === to) return { rate: 1, pair: `${from}/${to}`, timestamp: new Date().toISOString() };

  // Helper to fetch Yahoo Finance chart price
  const queryPair = async (symbol) => {
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4500);
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return null;
      const json = await res.json();
      const price = json.chart?.result?.[0]?.meta?.regularMarketPrice;
      return typeof price === 'number' && price > 0 ? price : null;
    } catch {
      return null;
    }
  };

  // 1. Direct pair e.g. TWD=X (USD to TWD), EURTWD=X, JPYTWD=X
  let directSymbol = `${from}${to}=X`;
  if (from === 'USD') directSymbol = `${to}=X`; // Yahoo uses TWD=X for USD/TWD
  const directRate = await queryPair(directSymbol);
  if (directRate) {
    return { rate: directRate, pair: `${from}/${to}`, timestamp: new Date().toISOString() };
  }

  // 2. Inverse pair e.g. from TWD to USD
  let inverseSymbol = `${to}${from}=X`;
  if (to === 'USD') inverseSymbol = `${from}=X`;
  const inverseRate = await queryPair(inverseSymbol);
  if (inverseRate) {
    return { rate: Number((1 / inverseRate).toFixed(6)), pair: `${from}/${to}`, timestamp: new Date().toISOString() };
  }

  // 3. Cross rate via USD base
  const [fromUsd, toUsd] = await Promise.all([
    from === 'USD' ? Promise.resolve(1) : queryPair(`${from}=X`),
    to === 'USD' ? Promise.resolve(1) : queryPair(`${to}=X`)
  ]);

  if (fromUsd && toUsd) {
    // If rate is reported as USD/XXX: 1 USD = fromUsd XXX, 1 USD = toUsd YYY
    // So 1 XXX = (toUsd / fromUsd) YYY
    const crossRate = toUsd / fromUsd;
    return { rate: Number(crossRate.toFixed(4)), pair: `${from}/${to}`, timestamp: new Date().toISOString() };
  }

  return null;
}

// ---------------------------------------------------------------------------
// Intent Detection & Execution
// ---------------------------------------------------------------------------

/**
 * Natural language intent parser for both currency and unit conversions.
 * Supports:
 *   - "1500 美金換台幣" / "3000 USD to TWD" / "10 萬日圓等於多少台幣"
 *   - "30 磅是幾公斤" / "250 lbs to kg" / "75 華氏度換攝氏" / "10 坪是幾平方公尺"
 * @param {string} userMessage
 * @returns {{type: 'currency' | 'unit', amount: number, from: string, to: string} | null}
 */
export function detectConversionIntent(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') return null;
  // Normalize colloquial counters e.g. "1 塊錢台幣" / "100 元美金" / "50 塊" -> "1 台幣" / "100 美金"
  const text = userMessage
    .trim()
    .replace(/([0-9]+(?:\.[0-9]+)?)\s*(?:塊錢|塊|元)(?:的)?/g, (match, num) => `${num} `);

  // Pattern: [Amount] [From] (換|等於|折合|變成|轉|是|to|in|into) [To]
  const pattern =
    /(?:幫我|請)?(?:算一下|換算|轉換|查詢)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*(萬|億)?\s*([A-Za-z°℃℉]+|[\u4e00-\u9fa5]{1,4}?)\s*(?:換成|換算成|兌換成|轉換為|等於多少|等於幾|等於|折合|變成|換|轉|是幾|是多少|是|to|in|into|=)\s*(?:多少|幾)?\s*([A-Za-z°℃℉]+|[\u4e00-\u9fa5]{1,6})/gi;

  const matches = [...text.matchAll(pattern)];
  if (matches.length === 0) return null;

  const validIntents = [];

  for (const match of matches) {
    let amount = Number(match[1].replace(/,/g, ''));
    const multiplier = match[2];
    if (multiplier === '萬') amount *= 10000;
    if (multiplier === '億') amount *= 100000000;

    const rawFrom = match[3].trim().replace(/(?:是|等於|多少|幾)$/, '');
    const rawTo = match[4].trim().replace(/^(?:多少|幾|是)/, '');

    // Check currency first
    const currFrom = resolveCurrencyCode(rawFrom);
    const currTo = resolveCurrencyCode(rawTo);
    if (currFrom && currTo) {
      validIntents.push({ type: 'currency', amount, from: currFrom, to: currTo });
      continue;
    }

    // Check physical units
    const physCheck = convertPhysicalUnit(amount, rawFrom, rawTo);
    if (physCheck) {
      validIntents.push({ type: 'unit', amount, from: rawFrom, to: rawTo, details: physCheck });
    }
  }

  if (validIntents.length === 0) return null;
  if (validIntents.length === 1) return validIntents[0];
  return { type: 'multi', list: validIntents };
}

/**
 * Executes a conversion request and returns structured telemetry and text for J.A.R.V.I.S.
 * @param {string} userMessage
 * @returns {Promise<{executed: boolean, skill: string, data: object | null, items: Array<object>, summaryText: string}>}
 */
export async function executeConversionSkill(userMessage) {
  const intent = detectConversionIntent(userMessage);
  if (!intent) {
    return { executed: false, skill: 'conversion', data: null, items: [], summaryText: '' };
  }

  const intentList = intent.type === 'multi' ? intent.list : [intent];
  const items = [];
  const textSections = [];

  for (const item of intentList) {
    if (item.type === 'currency') {
      const fx = await fetchLiveExchangeRate(item.from, item.to);
      if (!fx) {
        textSections.push(`- ${item.amount} ${item.from} ➔ ${item.to}: 目前無法取得即時外匯牌價`);
        continue;
      }
      const convertedAmount = Number((item.amount * fx.rate).toFixed(2));
      const symFrom = CURRENCY_SYMBOLS[item.from] || item.from;
      const symTo = CURRENCY_SYMBOLS[item.to] || item.to;

      textSections.push(
        `- 💱 貨幣匯率換算: ${symFrom}${item.amount.toLocaleString()} ${item.from} = ${symTo}${convertedAmount.toLocaleString()} ${item.to} (即時匯率: 1 ${item.from} = ${fx.rate} ${item.to})`
      );
      items.push({
        title: `💱 ${item.amount.toLocaleString()} ${item.from} = ${convertedAmount.toLocaleString()} ${item.to} (匯率 ${fx.rate})`,
        link: `https://finance.yahoo.com/quote/${item.from}${item.to}=X`,
        source: 'Live FX Telemetry'
      });
    } else if (item.type === 'unit') {
      const res = item.details || convertPhysicalUnit(item.amount, item.from, item.to);
      if (res) {
        textSections.push(
          `- 📐 ${res.category.toUpperCase()} 單位換算: ${res.value.toLocaleString()} ${res.fromUnit} = ${res.result.toLocaleString()} ${res.toUnit}`
        );
        items.push({
          title: `📐 ${res.value.toLocaleString()} ${res.fromUnit} = ${res.result.toLocaleString()} ${res.toUnit}`,
          link: '#',
          source: 'Stark Precision Unit Engine'
        });
      }
    }
  }

  if (textSections.length === 0) {
    return { executed: false, skill: 'conversion', data: null, items: [], summaryText: '' };
  }

  const summaryText =
    `[Stark Live Currency & Precision Unit Conversion Telemetry]:\n` +
    textSections.join('\n') +
    `\n- 備註: 匯率數據由 Yahoo Finance 提供；單位換算由 Stark Quantum Unit Engine 精確運算。`;

  return {
    executed: true,
    skill: 'conversion_telemetry',
    data: { results: textSections },
    items,
    summaryText
  };
}
