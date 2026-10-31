/**
 * Stark Automation Core — Autonomous Morning Briefing, End-of-Day Debrief & Service Sentinel
 * Pure Node.js built-ins only (fs, path, net, crypto).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkTcpPort } from './networkScannerService.js';
import { getVaultState } from './memoryVaultService.js';
import { fetchMarketTelemetry, fetchWeatherTelemetry, fetchTodaysNews, fetchTaiwanFuelPrices } from './webSkillsService.js';
import { getSystemTelemetry } from './telemetryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_AUTOMATION_PATH = path.resolve(__dirname, '../../../data/jarvis_automation.json');
const REPORTS_DIR = path.resolve(__dirname, '../../../reports');

export const DEFAULT_MONITORED_SERVICES = [
  { name: 'Ollama Local LLM', port: 11434, host: '127.0.0.1' },
  { name: 'Node Dev Server', port: 3000, host: '127.0.0.1' },
  { name: 'PostgreSQL Database', port: 5432, host: '127.0.0.1' }
];

export const DEFAULT_UPTIME_ENDPOINTS = [
  { name: 'Google Search', url: 'https://www.google.com', expectedStatus: 200, timeoutMs: 5000 },
  { name: 'GitHub Status', url: 'https://www.githubstatus.com', expectedStatus: 200, timeoutMs: 5000 }
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
      time: '18:30', // HH:MM
      autoSaveMarkdown: true
    },
    serviceSentinel: {
      enabled: true,
      intervalSec: 30,
      services: DEFAULT_MONITORED_SERVICES,
      autoRestartOllama: true,
      restartCooldownMs: 60000
    },
    uptimeSentinel: {
      enabled: true,
      intervalSec: 60,
      endpoints: DEFAULT_UPTIME_ENDPOINTS
    },
    fridayFuelAlert: {
      enabled: true,
      dayOfWeek: 5, // Friday
      time: '17:00'
    },
    hourlyChime: {
      enabled: true
    },
    focusHealthSentinel: {
      enabled: true,
      intervalMinutes: 50
    },
    hardwareSentinel: {
      enabled: true,
      cpuThresholdPercent: 90,
      ramThresholdPercent: 90,
      diskMinFreeGb: 10,
      diskMaxUsagePercent: 90,
      cooldownMinutes: 15
    }
  },
  lastFired: {
    morningBriefingDate: '',
    endOfDayDebriefDate: '',
    fridayFuelAlertDate: '',
    lastChimeHour: -1,
    lastFocusAlertMs: 0
  },
  hardwareCooldowns: {},
  serviceStatus: {}, // { "Ollama Local LLM": { open: true, lastCheck: "..." } }
  uptimeStatus: {}, // { "https://...": { name: "...", isUp: true, statusCode: 200, latencyMs: 50, lastCheck: "..." } }
  lastOllamaRestartMs: 0
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
        serviceSentinel: { ...DEFAULT_STATE.settings.serviceSentinel, ...(parsed.settings?.serviceSentinel || {}) },
        uptimeSentinel: { ...DEFAULT_STATE.settings.uptimeSentinel, ...(parsed.settings?.uptimeSentinel || {}) },
        fridayFuelAlert: { ...DEFAULT_STATE.settings.fridayFuelAlert, ...(parsed.settings?.fridayFuelAlert || {}) },
        hourlyChime: { ...DEFAULT_STATE.settings.hourlyChime, ...(parsed.settings?.hourlyChime || {}) },
        focusHealthSentinel: { ...DEFAULT_STATE.settings.focusHealthSentinel, ...(parsed.settings?.focusHealthSentinel || {}) },
        hardwareSentinel: { ...DEFAULT_STATE.settings.hardwareSentinel, ...(parsed.settings?.hardwareSentinel || {}) }
      },
      lastFired: { ...DEFAULT_STATE.lastFired, ...(parsed.lastFired || {}) },
      hardwareCooldowns: parsed.hardwareCooldowns || {},
      serviceStatus: parsed.serviceStatus || {},
      uptimeStatus: parsed.uptimeStatus || {},
      lastOllamaRestartMs: typeof parsed.lastOllamaRestartMs === 'number' ? parsed.lastOllamaRestartMs : 0
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
    if (patch.uptimeSentinel) {
      state.settings.uptimeSentinel = { ...state.settings.uptimeSentinel, ...patch.uptimeSentinel };
    }
    if (patch.fridayFuelAlert) {
      state.settings.fridayFuelAlert = { ...state.settings.fridayFuelAlert, ...patch.fridayFuelAlert };
    }
    if (patch.hourlyChime) {
      state.settings.hourlyChime = { ...state.settings.hourlyChime, ...patch.hourlyChime };
    }
    if (patch.focusHealthSentinel) {
      state.settings.focusHealthSentinel = { ...state.settings.focusHealthSentinel, ...patch.focusHealthSentinel };
    }
    if (patch.hardwareSentinel) {
      state.settings.hardwareSentinel = {
        ...DEFAULT_STATE.settings.hardwareSentinel,
        ...state.settings.hardwareSentinel,
        ...patch.hardwareSentinel
      };
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
// 6. Localhost Service Health Sentinel & Ollama Auto-Restart Self-Healing
// ---------------------------------------------------------------------------

/**
 * Spawns an Ollama instance to recover local LLM service.
 * @param {object} [options]
 * @param {Function} [options.spawner]
 * @returns {{success: boolean, pid?: number, error?: string}}
 */
export function restartOllamaService({ spawner = spawn } = {}) {
  try {
    const proc = spawner('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore'
    });
    if (proc && typeof proc.unref === 'function') {
      proc.unref();
    }
    return { success: true, pid: proc?.pid };
  } catch (err) {
    console.warn(`[J.A.R.V.I.S. AUTOMATION] Ollama auto-restart spawn error: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Checks the status of all configured services and detects any transition (online -> offline or offline -> online).
 * Automatically triggers Ollama self-healing restart if Ollama crashes.
 * @param {Array<{name: string, port: number, host?: string}>} [services]
 * @param {string} [filePath]
 * @param {object} [options]
 * @param {Function} [options.spawner]
 * @returns {Promise<Array<{name: string, port: number, status: 'offline'|'recovered'|'restarted', message: string, kind?: string, title?: string, speechText?: string}>>} Alert events
 */
export async function checkServiceHealth(services, filePath = DEFAULT_AUTOMATION_PATH, { spawner = spawn } = {}) {
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
    const nowMs = Date.now();
    const autoRestart = currentState.settings.serviceSentinel?.autoRestartOllama ?? true;
    const cooldownMs = currentState.settings.serviceSentinel?.restartCooldownMs ?? 60000;
    const lastRestart = currentState.lastOllamaRestartMs || 0;

    for (const chk of checks) {
      const wasOpen = prevStatus[chk.name]?.open;
      const isOpen = chk.open;

      // Transition detected: online -> offline
      if (wasOpen === true && isOpen === false) {
        alertEvents.push({
          name: chk.name,
          port: chk.port,
          status: 'offline',
          message: `⚠️ 本機服務警告：${chk.name} (Port ${chk.port}) 失去連線，已停止響應。`
        });

        // Option 1: Ollama auto-restart self healing
        if (chk.name.toLowerCase().includes('ollama') && autoRestart) {
          if (nowMs - lastRestart >= cooldownMs) {
            currentState.lastOllamaRestartMs = nowMs;
            const restartRes = restartOllamaService({ spawner });
            if (restartRes.success) {
              alertEvents.push({
                name: chk.name,
                port: chk.port,
                status: 'restarted',
                kind: 'service_alert',
                title: '🔄 OLLAMA AUTO-RESTART',
                message: `檢測到 Ollama 離線 (Port ${chk.port})，J.A.R.V.I.S. 自我修復協定已自動重啟 Ollama (ollama serve)。`,
                speechText: '檢測到 Ollama 服務離線，J.A.R.V.I.S. 已啟動自我修復並為您重新啟動 Ollama 服務。'
              });
            }
          }
        }
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
// 7. Custom Website / API Uptime Sentinel Monitor
// ---------------------------------------------------------------------------

/**
 * Checks the uptime of configured external/internal websites and APIs.
 * @param {Array<{name: string, url: string, expectedStatus?: number, timeoutMs?: number}>} [endpoints]
 * @param {string} [filePath]
 * @param {object} [options]
 * @param {Function} [options.fetcher]
 * @returns {Promise<Array<{name: string, url: string, status: 'down'|'recovered', statusCode?: number, latencyMs: number, message: string, speechText: string}>>}
 */
export async function checkUptimeSentinel(endpoints, filePath = DEFAULT_AUTOMATION_PATH, { fetcher = fetch } = {}) {
  const state = await getAutomationState(filePath);
  const targetEndpoints = endpoints || state.settings.uptimeSentinel?.endpoints || DEFAULT_UPTIME_ENDPOINTS;
  if (!state.settings.uptimeSentinel?.enabled && !endpoints) {
    return [];
  }

  const alertEvents = [];

  const checks = await Promise.all(
    targetEndpoints.map(async (ep) => {
      const start = Date.now();
      const timeoutMs = ep.timeoutMs || 5000;
      let isUp = false;
      let statusCode = 0;
      try {
        const res = await fetcher(ep.url, {
          signal: AbortSignal.timeout(timeoutMs),
          headers: { 'User-Agent': 'JARVIS-Uptime-Sentinel/85.0' }
        });
        statusCode = res.status;
        const expected = ep.expectedStatus || 200;
        isUp = statusCode === expected || (expected === 200 && res.ok);
      } catch (err) {
        isUp = false;
        statusCode = 0;
      }
      const latencyMs = Date.now() - start;
      return { name: ep.name, url: ep.url, isUp, statusCode, latencyMs };
    })
  );

  return withLock(async () => {
    const currentState = await getAutomationState(filePath);
    const prevStatus = currentState.uptimeStatus || {};
    const updatedStatus = { ...prevStatus };

    for (const chk of checks) {
      const prev = prevStatus[chk.url];
      const wasUp = prev ? prev.isUp : undefined;

      if (wasUp === true && chk.isUp === false) {
        const msg = `⚠️ 網站/API 異常：${chk.name} (${chk.url}) 失去連線或回應異常代碼 (狀態碼: ${chk.statusCode || 'Timeout'})。`;
        alertEvents.push({
          name: chk.name,
          url: chk.url,
          status: 'down',
          statusCode: chk.statusCode,
          latencyMs: chk.latencyMs,
          message: msg,
          speechText: `Sir，監控端點 ${chk.name} 目前離線，連線異常。`
        });
      } else if (wasUp === false && chk.isUp === true) {
        const msg = `✅ 網站/API 復原：${chk.name} (${chk.url}) 已恢復正常連線 (${chk.latencyMs}ms)。`;
        alertEvents.push({
          name: chk.name,
          url: chk.url,
          status: 'recovered',
          statusCode: chk.statusCode,
          latencyMs: chk.latencyMs,
          message: msg,
          speechText: `Sir，監控端點 ${chk.name} 已恢復正常連線。`
        });
      }

      updatedStatus[chk.url] = {
        name: chk.name,
        url: chk.url,
        isUp: chk.isUp,
        statusCode: chk.statusCode,
        latencyMs: chk.latencyMs,
        lastCheck: new Date().toISOString()
      };
    }

    currentState.uptimeStatus = updatedStatus;
    await saveAutomationState(currentState, filePath);
    return alertEvents;
  });
}

// ---------------------------------------------------------------------------
// 7. Hardware (CPU, RAM) & Storage Capacity Sentinel
// ---------------------------------------------------------------------------

/**
 * Evaluates host hardware (CPU, RAM) and storage volume telemetry against sentinel thresholds.
 * @param {object} [options]
 * @param {object} [options.settings]
 * @param {string} [options.filePath]
 * @param {object} [options.telemetry] - optional injected telemetry for testing
 * @returns {Promise<Array<{
 *   kind: 'hardware_alert',
 *   metric: 'cpu' | 'ram' | 'disk',
 *   severity: 'warning' | 'critical',
 *   title: string,
 *   message: string,
 *   speechText: string
 * }>>}
 */
export async function checkHardwareHealth({
  settings,
  filePath = DEFAULT_AUTOMATION_PATH,
  telemetry = null
} = {}) {
  const state = await getAutomationState(filePath);
  const cfg = {
    ...DEFAULT_STATE.settings.hardwareSentinel,
    ...(state.settings?.hardwareSentinel || {}),
    ...(settings || {})
  };

  if (!cfg.enabled) {
    return [];
  }

  const currentTelemetry = telemetry || getSystemTelemetry();
  const alertEvents = [];
  const nowMs = Date.now();
  const cooldownMs = Math.max(1, cfg.cooldownMinutes || 15) * 60 * 1000;

  return withLock(async () => {
    const currentState = await getAutomationState(filePath);
    const cooldowns = currentState.hardwareCooldowns || {};

    const isCooldownActive = (key) => {
      const last = cooldowns[key];
      return typeof last === 'number' && nowMs - last < cooldownMs;
    };

    // 1. CPU Load Check
    const cpuUsage = typeof currentTelemetry.cpuUsagePercent === 'number' ? currentTelemetry.cpuUsagePercent : 0;
    if (cpuUsage >= cfg.cpuThresholdPercent) {
      if (!isCooldownActive('cpu')) {
        cooldowns['cpu'] = nowMs;
        alertEvents.push({
          kind: 'hardware_alert',
          metric: 'cpu',
          severity: cpuUsage >= 95 ? 'critical' : 'warning',
          title: `⚠️ CPU 負載超載警戒 (${cpuUsage}%)`,
          message: `主機 CPU 運算負載已達 ${cpuUsage}%，已超過 ${cfg.cpuThresholdPercent}% 設定警戒值。`,
          speechText: `Sir，主機 CPU 運算負載已達百分之 ${cpuUsage}，已超過安全警戒水位。`
        });
      }
    }

    // 2. RAM Memory Check
    const ramUsage = typeof currentTelemetry.memoryUsagePercent === 'number' ? currentTelemetry.memoryUsagePercent : 0;
    const freeGb = currentTelemetry.memoryFreeGb ?? 0;
    if (ramUsage >= cfg.ramThresholdPercent) {
      if (!isCooldownActive('ram')) {
        cooldowns['ram'] = nowMs;
        alertEvents.push({
          kind: 'hardware_alert',
          metric: 'ram',
          severity: ramUsage >= 95 ? 'critical' : 'warning',
          title: `⚠️ 記憶體容量警戒 (${ramUsage}%)`,
          message: `主機 RAM 記憶體使用率已達 ${ramUsage}% (剩餘 ${freeGb} GB)，已超過 ${cfg.ramThresholdPercent}% 警戒值。`,
          speechText: `Sir，主機記憶體使用率已達百分之 ${ramUsage}，剩餘容量不足，建議清理背景行程。`
        });
      }
    }

    // 3. Disk Space Capacity Check
    const disks = Array.isArray(currentTelemetry.disks) ? currentTelemetry.disks : [];
    for (const disk of disks) {
      const driveKey = disk.drive || disk.path || 'Primary';
      const key = `disk:${driveKey}`;
      const isLowFree = typeof disk.freeGb === 'number' && disk.freeGb < cfg.diskMinFreeGb;
      const isHighUsage = typeof disk.usagePercent === 'number' && disk.usagePercent >= cfg.diskMaxUsagePercent;

      if (isLowFree || isHighUsage) {
        if (!isCooldownActive(key)) {
          cooldowns[key] = nowMs;
          alertEvents.push({
            kind: 'hardware_alert',
            metric: 'disk',
            severity: typeof disk.freeGb === 'number' && disk.freeGb < 5 ? 'critical' : 'warning',
            title: `⚠️ 磁碟容量告急 [${driveKey}]`,
            message: `磁碟槽 [${driveKey}] 剩餘空間僅 ${disk.freeGb} GB (${disk.usagePercent}% 已滿)，已低於安全門檻 ${cfg.diskMinFreeGb} GB。`,
            speechText: `Sir，${driveKey} 槽磁碟空間僅剩 ${disk.freeGb} GB，已達容量警戒水位。`
          });
        }
      }
    }

    currentState.hardwareCooldowns = cooldowns;
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
 * @param {Function} [deps.fetchPrices]
 * @param {Function} [deps.spawner]
 * @param {Function} [deps.fetcher]
 */
export async function runAutomationTick({
  onEvent,
  filePath = DEFAULT_AUTOMATION_PATH,
  currentTime = new Date(),
  fetchPrices = fetchTaiwanFuelPrices,
  spawner = spawn,
  fetcher = fetch
}) {
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

  // 2. Scheduled End-of-Day Tactical Debrief Check (Option 2: 18:30 Markdown Auto-Generation)
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

  // 3. Friday Afternoon Upcoming Fuel Price Alert (Option 2: Friday 17:00 Alert)
  const fuelCfg = state.settings.fridayFuelAlert;
  if (
    fuelCfg?.enabled &&
    now.getDay() === (fuelCfg.dayOfWeek ?? 5) &&
    currentHHMM === (fuelCfg.time || '17:00') &&
    state.lastFired.fridayFuelAlertDate !== currentDateKey
  ) {
    state.lastFired.fridayFuelAlertDate = currentDateKey;
    await saveAutomationState(state, filePath);

    try {
      const fuel = await fetchPrices().catch(() => null);
      const p = fuel?.prices || {};
      const speech = `Sir，週五油價週末戰備提醒：台灣中油目前最新牌價：95無鉛每公升 ${p.gas95 || '31.0'} 元、98無鉛 ${p.gas98 || '33.0'} 元。下週油價調整前，建議您於週末前評估愛車油量排程。`;
      const md = [
        `### ⛽ 台灣中油週五牌價週末預警`,
        `- **95 無鉛汽油**: $${p.gas95 || '-'} 元 / 公升`,
        `- **98 無鉛汽油**: $${p.gas98 || '-'} 元 / 公升`,
        `- **92 無鉛汽油**: $${p.gas92 || '-'} 元 / 公升`,
        `- **超級柴油**: $${p.diesel || '-'} 元 / 公升`,
        `- **牌價生效日期**: ${p.effectiveDate || '即時牌價'}`,
        `---`,
        `*週末油料戰術建議：下週油價生效前，建議評估油箱存量，及早加油以維持最佳出勤狀態，Sir。*`
      ].join('\n');

      onEvent({
        kind: 'friday_fuel_alert',
        title: '⛽ 台灣中油週五油價週末戰備預警',
        message: md,
        speechText: speech
      });
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] Friday fuel alert trigger failed: ${err.message}`);
    }
  }

  // 4. Hourly Vocal Chrono Chime (Option 3)
  const chimeCfg = state.settings.hourlyChime;
  if (
    chimeCfg?.enabled &&
    now.getMinutes() === 0 &&
    state.lastFired.lastChimeHour !== now.getHours()
  ) {
    state.lastFired.lastChimeHour = now.getHours();
    await saveAutomationState(state, filePath);

    const h = now.getHours();
    const padH = String(h).padStart(2, '0');
    onEvent({
      kind: 'hourly_chime',
      title: `🔔 J.A.R.V.I.S. 整點報時 [${padH}:00]`,
      message: `現在時間是 ${h} 點整。方舟反應爐與主機遙測系統運作正常，Sir。`,
      speechText: `Sir，現在時間是 ${h} 點整。`
    });
  }

  // 5. 50-Minute Continuous Coding Posture & Optics Rest Alert (Option 3)
  const focusCfg = state.settings.focusHealthSentinel;
  if (focusCfg?.enabled) {
    const intervalMs = Math.max(1, focusCfg.intervalMinutes || 50) * 60 * 1000;
    const nowMs = now.getTime();
    if (!state.lastFired.lastFocusAlertMs) {
      state.lastFired.lastFocusAlertMs = nowMs;
      await saveAutomationState(state, filePath);
    } else if (nowMs - state.lastFired.lastFocusAlertMs >= intervalMs) {
      state.lastFired.lastFocusAlertMs = nowMs;
      await saveAutomationState(state, filePath);

      onEvent({
        kind: 'focus_health_alert',
        title: '🧘 護眼與姿態健康提醒 (50分鐘專注)',
        message: 'Sir，您已持續專注工作 50 分鐘。建議您起立活動頸椎與背部肌群，並遠眺 6 公尺（20 呎）外景物以放鬆眼部睫狀肌。',
        speechText: 'Sir，您已持續專注工作 50 分鐘。請稍微站起伸展，放鬆雙眼。'
      });
    }
  }

  // 6. Service Sentinel Health Check & Ollama Self-Healing (Option 1)
  if (state.settings.serviceSentinel.enabled) {
    try {
      const alerts = await checkServiceHealth(state.settings.serviceSentinel.services, filePath, { spawner });
      for (const al of alerts) {
        onEvent({
          kind: al.kind || 'service_alert',
          title: al.title || (al.status === 'offline' ? `🚨 SERVICE OFFLINE: ${al.name}` : `🟢 SERVICE RESTORED: ${al.name}`),
          message: al.message,
          speechText: al.speechText || al.message
        });
      }
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] Service health check error: ${err.message}`);
    }
  }

  // 7. Custom Website / API Uptime Sentinel Check (Option 1)
  if (state.settings.uptimeSentinel?.enabled) {
    try {
      const uptimeAlerts = await checkUptimeSentinel(state.settings.uptimeSentinel.endpoints, filePath, { fetcher });
      for (const al of uptimeAlerts) {
        onEvent({
          kind: 'uptime_alert',
          title: al.status === 'down' ? `🚨 ENDPOINT DOWN: ${al.name}` : `🟢 ENDPOINT RESTORED: ${al.name}`,
          message: al.message,
          speechText: al.speechText
        });
      }
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] Uptime sentinel check error: ${err.message}`);
    }
  }

  // 8. Hardware (CPU, RAM, Disk) Sentinel Check
  if (state.settings.hardwareSentinel?.enabled) {
    try {
      const hwAlerts = await checkHardwareHealth({
        settings: state.settings.hardwareSentinel,
        filePath
      });
      for (const al of hwAlerts) {
        onEvent({
          kind: 'hardware_alert',
          title: al.title,
          message: al.message,
          speechText: al.speechText
        });
      }
    } catch (err) {
      console.warn(`[J.A.R.V.I.S. AUTOMATION] Hardware sentinel error: ${err.message}`);
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
