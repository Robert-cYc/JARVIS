import os from 'node:os';

/**
 * Computes average CPU utilization percentage across all logical cores.
 * @returns {number} CPU usage percentage (0-100)
 */
export function getCpuUsagePercent() {
  const cpus = os.cpus();
  if (!cpus || cpus.length === 0) {
    return 0;
  }

  let totalIdle = 0;
  let totalTick = 0;

  for (const cpu of cpus) {
    for (const type of Object.keys(cpu.times)) {
      totalTick += cpu.times[type];
    }
    totalIdle += cpu.times.idle;
  }

  if (totalTick === 0) {
    return 0;
  }

  const idleRatio = totalIdle / totalTick;
  return Math.max(0, Math.min(100, Math.round((1 - idleRatio) * 100)));
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

  return {
    timestamp: new Date().toISOString(),
    hostname: os.hostname(),
    platform: `${os.type()} ${os.arch()}`,
    cpuCores: os.cpus()?.length || 1,
    cpuModel: os.cpus()?.[0]?.model?.trim() || 'Stark Quantum Co-Processor',
    cpuUsagePercent: getCpuUsagePercent(),
    memoryTotalGb: Number((totalMem / (1024 ** 3)).toFixed(1)),
    memoryUsedGb: Number((usedMem / (1024 ** 3)).toFixed(1)),
    memoryUsagePercent: memUsagePercent,
    uptimeSeconds: Math.floor(os.uptime()),
    arcReactorOutputPercent: Number((98.4 + Math.sin(Date.now() / 5000) * 1.2).toFixed(1)),
    suitIntegrityPercent: 100
  };
}
