/**
 * Stark Industries Global Telemetry — World Time & Timezone Matrix Service
 * Utilizes native ECMAScript Intl.DateTimeFormat with zero external dependencies.
 */

export const MAJOR_TIMEZONES = [
  { id: 'taipei', name: '台北', english: 'Taipei', tz: 'Asia/Taipei', flag: '🇹🇼', isBase: true },
  { id: 'tokyo', name: '東京', english: 'Tokyo', tz: 'Asia/Tokyo', flag: '🇯🇵' },
  { id: 'singapore', name: '新加坡', english: 'Singapore', tz: 'Asia/Singapore', flag: '🇸🇬' },
  { id: 'dubai', name: '杜拜', english: 'Dubai', tz: 'Asia/Dubai', flag: '🇦🇪' },
  { id: 'zurich', name: '蘇黎世', english: 'Zurich', tz: 'Europe/Zurich', flag: '🇨🇭' },
  { id: 'london', name: '倫敦', english: 'London', tz: 'Europe/London', flag: '🇬🇧' },
  { id: 'new_york', name: '紐約', english: 'New York', tz: 'America/New_York', flag: '🇺🇸' },
  { id: 'san_francisco', name: '舊金山', english: 'San Francisco', tz: 'America/Los_Angeles', flag: '🇺🇸' },
  { id: 'sydney', name: '雪梨', english: 'Sydney', tz: 'Australia/Sydney', flag: '🇦🇺' }
];

const CITY_SYNONYMS = {
  taipei: ['台北', '臺北', '台灣', '臺灣', 'taipei', 'taiwan'],
  tokyo: ['東京', '日本', 'tokyo', 'japan'],
  singapore: ['新加坡', '星加坡', 'singapore', 'sg'],
  dubai: ['杜拜', '阿聯酋', 'dubai', 'uae'],
  zurich: ['蘇黎世', '瑞士', '法蘭克福', '柏林', 'zurich', 'switzerland', 'frankfurt', 'berlin'],
  london: ['倫敦', '英國', '格林威治', 'london', 'uk', 'gmt'],
  new_york: ['紐約', '美東', 'new york', 'nyc', 'us east', 'est', 'edt'],
  san_francisco: ['舊金山', '矽谷', '洛杉磯', '美西', '加州', 'san francisco', 'sf', 'silicon valley', 'los angeles', 'la', 'us west', 'pst', 'pdt'],
  sydney: ['雪梨', '悉尼', '澳洲', '墨爾本', 'sydney', 'australia', 'melbourne']
};

/**
 * Calculates UTC offset in minutes for a specific IANA time zone at the given date.
 * @param {string} timeZone
 * @param {Date} date
 * @returns {number}
 */
export function getTimezoneOffsetMinutes(timeZone, date = new Date()) {
  const utcDate = new Date(date.toLocaleString('en-US', { timeZone: 'UTC' }));
  const tzDate = new Date(date.toLocaleString('en-US', { timeZone }));
  return Math.round((tzDate.getTime() - utcDate.getTime()) / 60000);
}

/**
 * Formats timezone offset as UTC string (e.g. "UTC+8", "UTC-4").
 * @param {number} offsetMinutes
 * @returns {string}
 */
export function formatUtcOffset(offsetMinutes) {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `UTC${sign}${hours}${mins > 0 ? `:${mins.toString().padStart(2, '0')}` : ''}`;
}

/**
 * Evaluates world time matrix across major global financial and tech hubs.
 * @param {Date} [refDate=new Date()]
 * @returns {Array<{city: string, english: string, flag: string, tz: string, time24: string, time12: string, date: string, weekday: string, utcOffset: string, diffFromTaipei: string, isBusinessHour: boolean, statusIcon: string}>}
 */
export function getWorldTimeMatrix(refDate = new Date()) {
  const taipeiOffset = getTimezoneOffsetMinutes('Asia/Taipei', refDate);

  return MAJOR_TIMEZONES.map((zone) => {
    const time24 = refDate.toLocaleTimeString('en-US', {
      timeZone: zone.tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    const time12 = refDate.toLocaleTimeString('en-US', {
      timeZone: zone.tz,
      hour12: true,
      hour: 'numeric',
      minute: '2-digit'
    });

    const dateStr = refDate.toLocaleDateString('zh-TW', {
      timeZone: zone.tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });

    const weekday = refDate.toLocaleDateString('zh-TW', {
      timeZone: zone.tz,
      weekday: 'short'
    });

    const hour = parseInt(time24.split(':')[0], 10);
    const isBusinessHour = hour >= 9 && hour < 18;
    const isDaylight = hour >= 6 && hour < 18;
    const statusIcon = isDaylight ? (isBusinessHour ? '☀️ 營業中' : '🌤️ 日間') : '🌙 夜間/休市';

    const offsetMin = getTimezoneOffsetMinutes(zone.tz, refDate);
    const utcOffset = formatUtcOffset(offsetMin);

    const diffHours = (offsetMin - taipeiOffset) / 60;
    const diffSign = diffHours > 0 ? `+${diffHours}` : `${diffHours}`;
    const diffFromTaipei = diffHours === 0 ? '基準 (台北)' : `${diffSign}h`;

    return {
      id: zone.id,
      city: zone.name,
      english: zone.english,
      flag: zone.flag,
      tz: zone.tz,
      time24,
      time12,
      date: dateStr,
      weekday,
      utcOffset,
      diffFromTaipei,
      isBusinessHour,
      statusIcon
    };
  });
}

/**
 * Searches for a specific city or country in the user query.
 * @param {string} text
 * @returns {object|null}
 */
export function matchCityFromQuery(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  for (const [zoneId, synonyms] of Object.entries(CITY_SYNONYMS)) {
    for (const syn of synonyms) {
      if (lower.includes(syn)) {
        return MAJOR_TIMEZONES.find((z) => z.id === zoneId) || null;
      }
    }
  }
  return null;
}

/**
 * Generates an executive briefing markdown block for J.A.R.V.I.S. HUD.
 * @param {Date} [refDate=new Date()]
 * @param {string} [filterCity=null]
 * @returns {{summaryText: string, items: Array<any>}}
 */
export function formatWorldTimeBriefing(refDate = new Date(), filterCity = null) {
  const matrix = getWorldTimeMatrix(refDate);

  let targetList = matrix;
  let headerTitle = '🌐 STARK GLOBAL CHRONOMETER // 全球時區矩陣';

  if (filterCity) {
    const matched = matrix.filter(
      (m) =>
        m.city.includes(filterCity) ||
        m.english.toLowerCase().includes(filterCity.toLowerCase()) ||
        m.id === filterCity
    );
    if (matched.length > 0) {
      targetList = matched;
      headerTitle = `🌐 STARK CHRONOMETER // ${matched[0].flag} ${matched[0].city} (${matched[0].english}) 即時時間`;
    }
  }

  let text = `### ${headerTitle}\n\n`;
  text += `| 城市 (City) | 旗幟 | 本地時間 (Local) | 日期 | 時差 (Taipei) | 狀態 |\n`;
  text += `| :--- | :---: | :---: | :---: | :---: | :--- |\n`;

  for (const item of targetList) {
    text += `| **${item.city}** (${item.english}) | ${item.flag} | \`${item.time24}\` (${item.time12}) | ${item.date} (${item.weekday}) | \`${item.diffFromTaipei}\` | ${item.statusIcon} |\n`;
  }

  text += `\n*基準時間 (Reference): 台北 Asia/Taipei (UTC+8) | 即時演算: Stark Precision Satellite Clock*\n`;

  const items = targetList.map((t) => ({
    title: `${t.flag} ${t.city}: ${t.time24} (${t.utcOffset})`,
    link: '#',
    source: `${t.statusIcon} | ${t.diffFromTaipei}`
  }));

  return { summaryText: text, items };
}
