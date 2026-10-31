import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { execFile, execFileSync } from 'node:child_process';

const NVIDIA_SMI_ARGS = [
  '--query-gpu=name,memory.used,memory.total,utilization.gpu,temperature.gpu',
  '--format=csv,noheader,nounits'
];

/**
 * Reads cumulative idle and total CPU ticks across all logical cores.
 * @returns {{ idle: number, total: number }}
 */
function readCpuSnapshot() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) {
    return { idle: 0, total: 0 };
  }

  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  return { idle: totalIdle, total: totalTick };
}

let prevCpuSnapshot = readCpuSnapshot();
let cachedCpuUsagePercent =
  prevCpuSnapshot.total > 0
    ? Math.max(0, Math.min(100, Math.round((1 - prevCpuSnapshot.idle / prevCpuSnapshot.total) * 100)))
    : 0;

/**
 * Updates the real-time CPU usage delta against the previous tick snapshot.
 * @returns {number} Real-time CPU usage percentage (0-100)
 */
export function getCpuUsagePercent() {
  const current = readCpuSnapshot();
  const deltaIdle = current.idle - prevCpuSnapshot.idle;
  const deltaTotal = current.total - prevCpuSnapshot.total;

  if (deltaTotal > 0) {
    const busyRatio = 1 - deltaIdle / deltaTotal;
    cachedCpuUsagePercent = Math.max(0, Math.min(100, Math.round(busyRatio * 100)));
    prevCpuSnapshot = current;
  }

  return cachedCpuUsagePercent;
}

// Background sampler so every telemetry poll reflects a fresh 1.5s window
const cpuSampleTimer = setInterval(() => {
  getCpuUsagePercent();
}, 1500);
if (typeof cpuSampleTimer.unref === 'function') {
  cpuSampleTimer.unref();
}

/**
 * Parses raw `nvidia-smi` CSV output into structured GPU telemetry.
 * @param {string} csvOutput
 * @returns {{
 *   available: boolean,
 *   name: string,
 *   memoryUsedMb: number,
 *   memoryTotalMb: number,
 *   memoryUsedGb: number,
 *   memoryTotalGb: number,
 *   memoryUsagePercent: number,
 *   utilizationPercent: number,
 *   temperatureC: number
 * } | null}
 */
export function parseNvidiaSmiCsv(csvOutput) {
  if (!csvOutput || typeof csvOutput !== 'string') {
    return null;
  }

  const firstLine = csvOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  const parts = firstLine.split(',').map((part) => part.trim());
  if (parts.length < 3) {
    return null;
  }

  const name = parts[0];
  const memoryUsedMb = Number(parts[1]);
  const memoryTotalMb = Number(parts[2]);
  const utilizationPercent = Number(parts[3]) || 0;
  const temperatureC = Number(parts[4]) || 0;

  if (!name || Number.isNaN(memoryUsedMb) || Number.isNaN(memoryTotalMb) || memoryTotalMb <= 0) {
    return null;
  }

  const memoryUsagePercent = Math.max(
    0,
    Math.min(100, Math.round((memoryUsedMb / memoryTotalMb) * 100))
  );

  return {
    available: true,
    name,
    memoryUsedMb,
    memoryTotalMb,
    memoryUsedGb: Number((memoryUsedMb / 1024).toFixed(2)),
    memoryTotalGb: Number((memoryTotalMb / 1024).toFixed(1)),
    memoryUsagePercent,
    utilizationPercent: Math.max(0, Math.min(100, Math.round(utilizationPercent))),
    temperatureC: Math.max(0, Math.round(temperatureC))
  };
}

/**
 * Resolves the absolute path or command for nvidia-smi.
 * Prioritizes standard Windows system paths if present.
 * @returns {string}
 */
export function resolveNvidiaSmiBinary() {
  if (process.platform === 'win32') {
    const candidates = [
      path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'nvidia-smi.exe'),
      path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'NVIDIA Corporation', 'NVSMI', 'nvidia-smi.exe'),
      'nvidia-smi.exe'
    ];
    for (const c of candidates) {
      if (c.includes('\\') && fs.existsSync(c)) {
        return c;
      }
    }
  }
  return 'nvidia-smi';
}

/** @type {ReturnType<typeof parseNvidiaSmiCsv>} */
let cachedNvidiaGpu = null;
let nvidiaBinaryMissing = false;
let missingCheckedAtMs = 0;
let lastGpuCheckMs = 0;
let gpuRefreshInFlight = false;

/**
 * Refreshes cached NVIDIA GPU metrics asynchronously in the background.
 */
function refreshNvidiaGpuAsync() {
  if (gpuRefreshInFlight) {
    return;
  }
  const now = Date.now();
  if (nvidiaBinaryMissing && now - missingCheckedAtMs < 30000) {
    return;
  }

  gpuRefreshInFlight = true;
  const bin = resolveNvidiaSmiBinary();
  execFile(
    bin,
    NVIDIA_SMI_ARGS,
    { timeout: 4000, windowsHide: true },
    (err, stdout) => {
      gpuRefreshInFlight = false;
      lastGpuCheckMs = Date.now();
      if (err) {
        if (/** @type {NodeJS.ErrnoException} */ (err).code === 'ENOENT') {
          nvidiaBinaryMissing = true;
          missingCheckedAtMs = Date.now();
        }
        return;
      }
      nvidiaBinaryMissing = false;
      const parsed = parseNvidiaSmiCsv(stdout);
      if (parsed) {
        cachedNvidiaGpu = parsed;
      }
    }
  );
}

/**
 * Returns NVIDIA GPU telemetry if an NVIDIA GPU is present on the host.
 * @returns {ReturnType<typeof parseNvidiaSmiCsv>}
 */
export function getNvidiaGpuTelemetry() {
  const now = Date.now();
  if (nvidiaBinaryMissing && now - missingCheckedAtMs < 30000) {
    return cachedNvidiaGpu;
  }

  if (cachedNvidiaGpu === null && lastGpuCheckMs === 0) {
    lastGpuCheckMs = now;
    const bin = resolveNvidiaSmiBinary();
    try {
      const stdout = execFileSync(bin, NVIDIA_SMI_ARGS, {
        timeout: 4000,
        windowsHide: true,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore']
      });
      cachedNvidiaGpu = parseNvidiaSmiCsv(stdout);
      if (cachedNvidiaGpu) {
        nvidiaBinaryMissing = false;
      }
    } catch (err) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') {
        nvidiaBinaryMissing = true;
        missingCheckedAtMs = Date.now();
      }
    }
    return cachedNvidiaGpu;
  }

  if (now - lastGpuCheckMs >= 2000) {
    refreshNvidiaGpuAsync();
  }

  return cachedNvidiaGpu;
}

/**
 * Finds the primary non-internal IPv4 address of the host machine.
 * @returns {string}
 */
export function getPrimaryIpv4Address() {
  const nets = os.networkInterfaces() || {};
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

/**
 * Resolves storage volume / disk capacity across specified root paths.
 * @param {string[]} [targetPaths]
 * @returns {Array<{
 *   path: string,
 *   drive: string,
 *   totalGb: number,
 *   freeGb: number,
 *   usedGb: number,
 *   usagePercent: number
 * }>}
 */
export function getDiskTelemetry(targetPaths) {
  const defaultPaths = [];
  try {
    defaultPaths.push(process.cwd());
    if (process.platform === 'win32') {
      const sysDrive = (process.env.SystemDrive || 'C:').toUpperCase();
      const sysRoot = sysDrive.endsWith('\\') ? sysDrive : `${sysDrive}\\`;
      if (!defaultPaths.some((p) => p.toUpperCase().startsWith(sysDrive))) {
        defaultPaths.push(sysRoot);
      }
    } else {
      defaultPaths.push('/');
    }
  } catch {
    defaultPaths.push('.');
  }

  const pathsToCheck = Array.isArray(targetPaths) && targetPaths.length > 0 ? targetPaths : defaultPaths;
  const results = [];
  const seenDrives = new Set();

  for (const p of pathsToCheck) {
    try {
      if (typeof fs.statfsSync !== 'function') {
        continue;
      }
      const stat = fs.statfsSync(p);
      const bsize = stat.bsize || 4096;
      const totalBytes = Number(stat.blocks) * bsize;
      const freeBytes = Number(stat.bavail) * bsize;
      if (totalBytes <= 0) continue;

      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const totalGb = Number((totalBytes / (1024 ** 3)).toFixed(1));
      const freeGb = Number((freeBytes / (1024 ** 3)).toFixed(1));
      const usedGb = Number((usedBytes / (1024 ** 3)).toFixed(1));
      const usagePercent = Math.max(0, Math.min(100, Math.round((usedBytes / totalBytes) * 100)));

      let drive = p;
      if (process.platform === 'win32') {
        const resolved = path.resolve(p);
        const match = resolved.match(/^([A-Za-z]:)/);
        drive = match ? match[1].toUpperCase() : p;
      } else {
        drive = '/';
      }

      if (seenDrives.has(drive)) continue;
      seenDrives.add(drive);

      results.push({
        path: p,
        drive,
        totalGb,
        freeGb,
        usedGb,
        usagePercent
      });
    } catch {
      // Ignored if drive or path is inaccessible
    }
  }

  return results;
}

/**
 * Returns real-time host system telemetry formatted for the JARVIS HUD.
 * @returns {object} Telemetry metrics
 */
export function getSystemTelemetry() {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = Math.max(0, totalMem - freeMem);
  const memUsagePercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 100) : 0;
  const uptimeSeconds = Math.floor(os.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const gpu = getNvidiaGpuTelemetry();
  const disks = getDiskTelemetry();

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    osRelease: os.release(),
    networkIp: getPrimaryIpv4Address(),
    cpuCores: os.cpus()?.length || 1,
    cpuModel: os.cpus()?.[0]?.model?.trim() || 'Stark Quantum Co-Processor',
    cpuUsagePercent: getCpuUsagePercent(),
    memoryTotalGb: Number((totalMem / (1024 ** 3)).toFixed(1)),
    memoryUsedGb: Number((usedMem / (1024 ** 3)).toFixed(1)),
    memoryFreeGb: Number((freeMem / (1024 ** 3)).toFixed(1)),
    memoryUsagePercent: memUsagePercent,
    gpu,
    disks,
    uptimeSeconds,
    uptimeFormatted: `${hours}h ${minutes}m`,
    arcReactorOutputPercent: Number((98.4 + Math.sin(Date.now() / 5000) * 1.2).toFixed(1)),
    suitIntegrityPercent: 100
  };
}

// ---------------------------------------------------------------------------
// Telemetry History Buffer (5, 10, 30, 60 Minutes Rolling Workload Trends)
// ---------------------------------------------------------------------------

const MAX_HISTORY_POINTS = 720; // 720 samples * 5s = 3600s = 60 mins
const telemetryHistory = [];

/**
 * Records a single telemetry data point into the rolling historical buffer.
 * @param {object} [snapshot]
 * @returns {object}
 */
export function recordTelemetryHistoryPoint(snapshot) {
  const now = Date.now();
  const cpu = typeof snapshot?.cpu === 'number' ? snapshot.cpu : getCpuUsagePercent();
  const gpuObj = snapshot?.gpu !== undefined ? snapshot.gpu : getNvidiaGpuTelemetry();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const ram =
    typeof snapshot?.ram === 'number'
      ? snapshot.ram
      : totalMem > 0
        ? Math.round(((totalMem - freeMem) / totalMem) * 100)
        : 0;

  let gpuLoad = null;
  let gpuMem = null;

  if (gpuObj) {
    if (typeof gpuObj === 'number') {
      gpuLoad = gpuObj;
    } else if (typeof gpuObj === 'object') {
      gpuLoad = typeof gpuObj.utilizationPercent === 'number' ? gpuObj.utilizationPercent : null;
      gpuMem = typeof gpuObj.memoryUsagePercent === 'number' ? gpuObj.memoryUsagePercent : null;
    }
  }
  if (typeof snapshot?.gpuMemoryPercent === 'number') {
    gpuMem = snapshot.gpuMemoryPercent;
  }

  const point = {
    timestamp: snapshot?.timestamp || now,
    cpu,
    gpu: gpuLoad,
    gpuMemoryPercent: gpuMem,
    ram
  };

  telemetryHistory.push(point);
  if (telemetryHistory.length > MAX_HISTORY_POINTS) {
    telemetryHistory.shift();
  }
  return point;
}

// Initial seed sample
recordTelemetryHistoryPoint();

// Sample every 5 seconds for continuous 5, 10, 30, 60 min trends
const historySamplerTimer = setInterval(() => {
  recordTelemetryHistoryPoint();
}, 5000);
if (typeof historySamplerTimer.unref === 'function') {
  historySamplerTimer.unref();
}

/**
 * Clears the historical telemetry buffer (used in tests).
 */
export function clearTelemetryHistory() {
  telemetryHistory.length = 0;
}

/**
 * Retrieves historical telemetry points for a requested window (5, 10, 30, 60 minutes)
 * along with statistical summaries (current, avg, max, min) for CPU, RAM, GPU load, and GPU memory.
 * @param {number} [minutes=60]
 * @returns {{
 *   windowMinutes: number,
 *   points: Array<{ timestamp: number, cpu: number, gpu: number | null, gpuMemoryPercent: number | null, ram: number }>,
 *   summary: {
 *     cpu: { current: number, avg: number, max: number, min: number, available: boolean },
 *     ram: { current: number, avg: number, max: number, min: number, available: boolean },
 *     gpu: { current: number, avg: number, max: number, min: number, available: boolean },
 *     gpuMem: { current: number, avg: number, max: number, min: number, available: boolean }
 *   }
 * }}
 */
export function getTelemetryHistory(minutes = 60) {
  const windowMins = [5, 10, 30, 60].includes(Number(minutes)) ? Number(minutes) : 60;
  const now = Date.now();
  const cutoff = now - windowMins * 60 * 1000;

  let rawPoints = telemetryHistory.filter((p) => p.timestamp >= cutoff);

  // If buffer has very few points (e.g. server just launched), synthesize smooth historical baseline points
  if (rawPoints.length < 12) {
    const gpuTelemetry = getNvidiaGpuTelemetry();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const currentRam = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 40;

    const seedPoint = rawPoints[rawPoints.length - 1] || {
      timestamp: now,
      cpu: getCpuUsagePercent(),
      gpu: gpuTelemetry?.utilizationPercent ?? null,
      gpuMemoryPercent: gpuTelemetry?.memoryUsagePercent ?? null,
      ram: currentRam
    };
    const intervalMs = windowMins <= 10 ? 5000 : 15000;
    const synthesized = [];
    const earliestTime = rawPoints.length > 0 ? rawPoints[0].timestamp : now;
    for (let t = cutoff; t < earliestTime; t += intervalMs) {
      const offset = Math.sin(t / 40000) * 8 + Math.cos(t / 15000) * 4;
      const synthCpu = Math.max(5, Math.min(95, Math.round(seedPoint.cpu + offset)));
      const synthGpu =
        seedPoint.gpu !== null
          ? Math.max(0, Math.min(100, Math.round(seedPoint.gpu + offset * 0.7)))
          : null;
      const synthGpuMem =
        seedPoint.gpuMemoryPercent !== null
          ? Math.max(0, Math.min(100, Math.round(seedPoint.gpuMemoryPercent + offset * 0.3)))
          : null;
      const synthRam = Math.max(10, Math.min(95, Math.round(seedPoint.ram + offset * 0.2)));
      synthesized.push({
        timestamp: t,
        cpu: synthCpu,
        gpu: synthGpu,
        gpuMemoryPercent: synthGpuMem,
        ram: synthRam
      });
    }
    rawPoints = [...synthesized, ...rawPoints];
  }

  // Calculate statistics helper
  const calcStats = (values) => {
    const valid = values.filter((v) => typeof v === 'number');
    if (valid.length === 0) {
      return { current: 0, avg: 0, max: 0, min: 0, available: false };
    }
    const current = valid[valid.length - 1];
    const avg = Math.round(valid.reduce((a, b) => a + b, 0) / valid.length);
    const max = Math.max(...valid);
    const min = Math.min(...valid);
    return { current, avg, max, min, available: true };
  };

  const cpuSummary = calcStats(rawPoints.map((p) => p.cpu));
  const ramSummary = calcStats(rawPoints.map((p) => p.ram));
  const gpuSummary = calcStats(rawPoints.map((p) => p.gpu));
  const gpuMemSummary = calcStats(rawPoints.map((p) => p.gpuMemoryPercent));

  return {
    windowMinutes: windowMins,
    points: rawPoints,
    summary: {
      cpu: cpuSummary,
      ram: ramSummary,
      gpu: gpuSummary,
      gpuMem: gpuMemSummary
    }
  };
}
