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
    uptimeSeconds,
    uptimeFormatted: `${hours}h ${minutes}m`,
    arcReactorOutputPercent: Number((98.4 + Math.sin(Date.now() / 5000) * 1.2).toFixed(1)),
    suitIntegrityPercent: 100
  };
}
