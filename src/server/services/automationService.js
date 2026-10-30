/**
 * Stark Automation Core — Autonomous Morning Briefing, End-of-Day Debrief & Service Sentinel
 * Pure Node.js built-ins only (fs, path, net, crypto).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { checkTcpPort } from './networkScannerService.js';
import { getVaultState } from './memoryVaultService.js';
import { fetchMarketTelemetry, fetchWeatherTelemetry, fetchTodaysNews } from './webSkillsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_AUTOMATION_PATH = path.resolve(__dirname, '../../../data/jarvis_automation.json');
const REPORTS_DIR = path.resolve(__dirname, '../../../reports');

export const DEFAULT_MONITORED_SERVICES = [
  { name: 'Ollama Local LLM', port: 11434, host: '127.0.0.1' },
  { name: 'Node Dev Server', port: 3000, host: '127.0.0.1' },
  { name: 'PostgreSQL Database', port: 5432, host: '127.0.0.1' }
];

const DEFAULT_STATE = {
  settings: {
    morningBriefing: {
      enabled: true,
      time: '08:00', // HH:MM
      city: '高雄,台北'
    },
    endOfDayDebrief: {
      enabled: true,
      time: '18:00', // HH:MM
      autoSaveMarkdown: true
    },
    serviceSentinel: {
      enabled: true,
      intervalSec: 30,
      services: DEFAULT_MONITORED_SERVICES
    }
  },
  lastFired: {
    morningBriefingDate: '',
    endOfDayDebriefDate: ''
  },
  serviceStatus: {} // { "Ollama Local LLM": { open: true, lastCheck: "..." } }
};

let autoLock = Promise.resolve();
function withLock(fn) {
  const run = autoLock.then(fn, fn);
  autoLock = run.catch(() => {});
  return run;
}

/**
 * Loads the automation state from disk.
 * @param {string} [filePath]
 * @returns {Promise<typeof DEFAULT_STATE>}
 */
export async function getAutomationState(filePath = DEFAULT_AUTOMATION_PATH) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      settings: {
        morningBriefing: { ...DEFAULT_STATE.settings.morningBriefing, ...(parsed.settings?.morningBriefing || {}) },
        endOfDayDebrief: { ...DEFAULT_STATE.settings.endOfDayDebrief, ...(parsed.settings?.endOfDayDebrief || {}) },
        serviceSentinel: { ...DEFAULT_STATE.settings.serviceSentinel, ...(parsed.settings?.serviceSentinel || {}) }
      },
      lastFired: { ...DEFAULT_STATE.lastFired, ...(parsed.lastFired || {}) },
      serviceStatus: parsed.serviceStatus || {}
    };
  } catch {
    return structuredClone(DEFAULT_STATE);
  }
}

/**
 * Saves the automation state to disk.
 * @param {typeof DEFAULT_STATE} state
 * @param {string} [filePath]
 */
export async function saveAutomationState(state, filePath = DEFAULT_AUTOMATION_PATH) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Updates automation settings.
 * @param {object} patch
 * @param {string} [filePath]
 */
export async function updateAutomationSettings(patch, filePath = DEFAULT_AUTOMATION_PATH) {
  return withLock(async () => {
    const state = await getAutomationState(filePath);
    if (patch.morningBriefing) {
      state.settings.morningBriefing = { ...state.settings.morningBriefing, ...patch.morningBriefing };
    }
    if (patch.endOfDayDebrief) {
      state.settings.endOfDayDebrief = { ...state.settings.endOfDayDebrief, ...patch.endOfDayDebrief };
    }
    if (patch.serviceSentinel) {
      state.settings.serviceSentinel = { ...state.settings.serviceSentinel, ...patch.serviceSentinel };
    }
    await saveAutomationState(state, filePath);
    return state;
  });
}

// ---------------------------------------------------------------------------
// 1. Morning Briefing Content Generator
// ---------------------------------------------------------------------------

/**
 * Generates an automated morning briefing payload for autonomous transmission.
 * @param {object} [options]
 * @param {string} [options.city='高雄,台北']
 * @returns {Promise<{title: string, message: string, speechText: string, markdownReport: string, items: Array<object>}>}
 */
export async function generateScheduledMorningBriefing({ city = '高雄,台北' } = {}) {
  const vault = await getVaultState();
  const [weatherRes, marketRes, newsRes] = await Promise.all([
    fetchWeatherTelemetry(city).catch(() => null),
    fetchMarketTelemetry(['GC=F', '^TWII', '2330.TW', 'NVDA', 'TWD=X'], vault.watchlist || []).catch(() => null),
    fetchTodaysNews({ edition: 'tw', limit: 4 }).catch(() => null)
  ]);

  const pendingTasks = (vault.tasks || []).filter((t) => !t.completed);
  const now = new Date();
  const dateStr = now.toLocaleDateString('zh-TW', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const weatherSummary = weatherRes?.summaryText?.split('\n')?.[1] || '氣象衛星數據調閱中';
  const goldQuote = marketRes?.quotes?.find((q) => q.symbol === 'GC=F');
  const goldText = goldQuote
    ? `黃金金價每盎司 $${goldQuote.price.toLocaleString()} USD (${goldQuote.changePercent >= 0 ? '+' : ''}${goldQuote.changePercent}%)`
    : '黃金數據暫不可用';

  const speechText =
    `早安，Sir。現在是 ${dateStr} 晨間時段。為您呈報今日綜合情報：${city}天氣概況：${weatherSummary}。` +
    `金融市場方面：${goldText}。您目前有 ${pendingTasks.length} 項待辦事項。已為您啟動今日戰術排程。`;

  const lines = [
    `# 🌅 J.A.R.V.I.S. // STARK AUTONOMOUS MORNING BRIEFING`,
    `- **時間**: ${now.toLocaleString('zh-TW')}`,
    `- **天候**: ${weatherSummary}`,
    `- **金融**: ${goldText}`,
    `- **待辦**: ${pendingTasks.length} 項未完成任務`,
    `---`,
    `### 📋 今日重點待辦`,
    ...(pendingTasks.length > 0
      ? pendingTasks.slice(0, 5).map((t, idx) => `${idx + 1}. [ ] ${t.title}`)
      : ['_目前無未完成任務，各項排程準備就緒，Sir。_']),
    `---`,
    `### 📡 晨間頭條大事`,
    ...(newsRes?.items?.slice(0, 3)?.map((n, i) => `${i + 1}. [${n.source || '新聞'}] ${n.title}`) || ['暫無最新頭條'])
  ];

  return {
    title: '🌅 J.A.R.V.I.S. AUTONOMOUS MORNING BRIEFING',
    message: speechText,
    speechText,
    markdownReport: lines.join('\n'),
    items: [
      ...(weatherRes?.items?.slice(0, 2) || []),
      ...(marketRes?.items?.slice(0, 2) || []),
      ...(newsRes?.items?.slice(0, 2) || [])
    ]
  };
}

// ---------------------------------------------------------------------------
// 5. End-of-Day Tactical Debrief Generator & Markdown Exporter
// ---------------------------------------------------------------------------

/**
 * Generates an End-of-Day Tactical Debrief and saves it as a markdown file.
 * @param {object} [options]
 * @param {boolean} [options.saveToFile=true]
 * @param {string} [options.reportsDir]
 * @returns {Promise<{title: string, message: string, speechText: string, markdownReport: string, filePath?: string}>}
 */
export async function generateEndOfDayDebrief({ saveToFile = true, reportsDir = REPORTS_DIR } = {}) {
  const vault = await getVaultState();
  const marketRes = await fetchMarketTelemetry(['GC=F', '^TWII', '2330.TW', 'NVDA', 'TWD=X'], vault.watchlist || []).catch(() => null);

  const completedTasks = (vault.tasks || []).filter((t) => t.completed);
  const pendingTasks = (vault.tasks || []).filter((t) => !t.completed);
  const now = new Date();
  const dateKey = now.toISOString().slice(0, 10);

  const marketHighlights = (marketRes?.quotes || []).slice(0, 5).map(
    (q) => `- **${q.name}** [${q.symbol}]: ${q.price} ${q.currency} (${q.changePercent >= 0 ? '+' : ''}${q.changePercent}%)`
  );

  const lines = [
    `# 🌆 J.A.R.V.I.S. // END-OF-DAY TACTICAL DEBRIEF`,
    `- **產生日誌時間**: ${now.toLocaleString('zh-TW')}`,
    `- **任務達成狀態**: 今日完成 ${completedTasks.length} 項任務 / 剩餘 ${pendingTasks.length} 項進行中`,
    `---`,
    `### ✅ 今日已完成任務 (Completed Tasks)`,
    ...(completedTasks.length > 0
      ? completedTasks.map((t) => `- [✓] ${t.title}`)
      : ['_今日暫無標註完成的任務。_']),
    ``,
    `### ⏳ 尚在進行中的任務 (Pending Tasks)`,
    ...(pendingTasks.length > 0
      ? pendingTasks.map((t) => `- [ ] ${t.title}`)
      : ['_太棒了，所有任務均已全數清空！_']),
    `---`,
    `### 📈 自選股與市場收盤表現 (Market & Watchlist Recap)`,
    ...(marketHighlights.length > 0 ? marketHighlights : ['_市場數據調閱中。_']),
    `---`,
    `*J.A.R.V.I.S. Mark LXXXV Protocol: 每日戰術回顧自動儲存完畢。*`
  ];

  const markdownReport = lines.join('\n');
  const speechText =
    `Sir，今日下班工作總結已編制完成。您今天一共完成了 ${completedTasks.length} 項任務，` +
    `尚有 ${pendingTasks.length} 項任務進行中。自選股與黃金行情已完成盤後紀錄，戰術日誌已為您儲存歸檔。`;

  let savedFilePath = undefined;
  if (saveToFile) {
    try {
      await fs.mkdir(reportsDir, { recursive: true });
      savedFilePath = path.join(reportsDir, `Debrief_${dateKey}.md`);
      await fs.writeFile(savedFilePath, markdownReport, 'utf-8');
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. DEBRIEF] Failed to write report file: ${err.message}`);
    }
  }

  return {
    title: '🌆 J.A.R.V.I.S. END-OF-DAY TACTICAL DEBRIEF',
    message: speechText,
    speechText,
    markdownReport,
    filePath: savedFilePath
  };
}

// ---------------------------------------------------------------------------
// 6. Localhost Service Health Sentinel (Ollama, Port 3000, Postgres, etc.)
// ---------------------------------------------------------------------------

/**
 * Checks the status of all configured services and detects any transition (online -> offline or offline -> online).
 * @param {Array<{name: string, port: number, host?: string}>} [services]
 * @param {string} [filePath]
 * @returns {Promise<Array<{name: string, port: number, status: 'offline'|'recovered', message: string}>>} Alert events
 */
export async function checkServiceHealth(services, filePath = DEFAULT_AUTOMATION_PATH) {
  const state = await getAutomationState(filePath);
  const targetServices = services || state.settings.serviceSentinel.services || DEFAULT_MONITORED_SERVICES;
  const alertEvents = [];

  const checks = await Promise.all(
    targetServices.map(async (svc) => {
      const res = await checkTcpPort(svc.port, svc.host || '127.0.0.1', 400);
      return { name: svc.name, port: svc.port, open: res.open, latencyMs: res.latencyMs };
    })
  );

  return withLock(async () => {
    const currentState = await getAutomationState(filePath);
    const prevStatus = currentState.serviceStatus || {};
    const updatedStatus = { ...prevStatus };

    for (const chk of checks) {
      const wasOpen = prevStatus[chk.name]?.open;
      const isOpen = chk.open;

      // Transition detected
      if (wasOpen === true && isOpen === false) {
        alertEvents.push({
          name: chk.name,
          port: chk.port,
          status: 'offline',
          message: `⚠️ 本機服務警告：${chk.name} (Port ${chk.port}) 失去連線，已停止響應。`
        });
      } else if (wasOpen === false && isOpen === true) {
        alertEvents.push({
          name: chk.name,
          port: chk.port,
          status: 'recovered',
          message: `✅ 本機服務復原：${chk.name} (Port ${chk.port}) 已恢復在線連線。`
        });
      }

      updatedStatus[chk.name] = {
        open: isOpen,
        port: chk.port,
        lastCheck: new Date().toISOString(),
        latencyMs: chk.latencyMs
      };
    }

    currentState.serviceStatus = updatedStatus;
    await saveAutomationState(currentState, filePath);
    return alertEvents;
  });
}

// ---------------------------------------------------------------------------
// Autonomous Automation Scheduler Loop
// ---------------------------------------------------------------------------

let schedulerTimer = null;

/**
 * Evaluates whether scheduled tasks should fire at the current minute.
 * @param {object} deps
 * @param {(event: {kind: string, title: string, message: string, speechText?: string, markdownReport?: string}) => void} deps.onEvent
 * @param {string} [deps.filePath]
 * @param {Date} [deps.currentTime]
 */
export async function runAutomationTick({ onEvent, filePath = DEFAULT_AUTOMATION_PATH, currentTime = new Date() }) {
  const state = await getAutomationState(filePath);
  const now = currentTime;
  const currentHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const currentDateKey = now.toISOString().slice(0, 10);

  // 1. Scheduled Morning Briefing Check
  if (
    state.settings.morningBriefing.enabled &&
    state.settings.morningBriefing.time === currentHHMM &&
    state.lastFired.morningBriefingDate !== currentDateKey
  ) {
    state.lastFired.morningBriefingDate = currentDateKey;
    await saveAutomationState(state, filePath);

    try {
      const briefing = await generateScheduledMorningBriefing({ city: state.settings.morningBriefing.city });
      onEvent({
        kind: 'morning_briefing',
        title: briefing.title,
        message: briefing.markdownReport,
        speechText: briefing.speechText
      });
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] Morning briefing trigger failed: ${err.message}`);
    }
  }

  // 2. Scheduled End-of-Day Debrief Check
  if (
    state.settings.endOfDayDebrief.enabled &&
    state.settings.endOfDayDebrief.time === currentHHMM &&
    state.lastFired.endOfDayDebriefDate !== currentDateKey
  ) {
    state.lastFired.endOfDayDebriefDate = currentDateKey;
    await saveAutomationState(state, filePath);

    try {
      const debrief = await generateEndOfDayDebrief({ saveToFile: state.settings.endOfDayDebrief.autoSaveMarkdown });
      onEvent({
        kind: 'end_of_day_debrief',
        title: debrief.title,
        message: debrief.markdownReport,
        speechText: debrief.speechText
      });
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] End-of-day debrief trigger failed: ${err.message}`);
    }
  }

  // 3. Service Sentinel Health Check
  if (state.settings.serviceSentinel.enabled) {
    try {
      const alerts = await checkServiceHealth(state.settings.serviceSentinel.services, filePath);
      for (const al of alerts) {
        onEvent({
          kind: 'service_alert',
          title: al.status === 'offline' ? `🚨 SERVICE OFFLINE: ${al.name}` : `🟢 SERVICE RESTORED: ${al.name}`,
          message: al.message,
          speechText: al.message
        });
      }
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] Service health check error: ${err.message}`);
    }
  }
}

/**
 * Starts the continuous automation loop (every 30 seconds).
 * @param {object} options
 * @param {(event: object) => void} options.onEvent
 * @param {string} [options.filePath]
 * @param {number} [options.intervalMs=30000]
 */
export function startAutomationScheduler({ onEvent, filePath = DEFAULT_AUTOMATION_PATH, intervalMs = 30000 }) {
  stopAutomationScheduler();
  const tick = () => runAutomationTick({ onEvent, filePath, currentTime: new Date() });
  schedulerTimer = setInterval(tick, intervalMs);
  schedulerTimer.unref();
  setTimeout(tick, 3000).unref();
}

/** Stops the automation loop. */
export function stopAutomationScheduler() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
  }
}
