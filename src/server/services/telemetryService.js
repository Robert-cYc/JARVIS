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
    uptimeSeconds,
    uptimeFormatted: `${hours}h ${minutes}m`,
    arcReactorOutputPercent: Number((98.4 + Math.sin(Date.now() / 5000) * 1.2).toFixed(1)),
    suitIntegrityPercent: 100
  };
}
