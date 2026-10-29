import net from 'node:net';
import crypto from 'node:crypto';
import vm from 'node:vm';

export const COMMON_DEV_PORTS = [
  { port: 3000, service: 'J.A.R.V.I.S. HUD / Node Dev' },
  { port: 5173, service: 'Vite Frontend Server' },
  { port: 8000, service: 'Python / FastAPI / Django' },
  { port: 8080, service: 'HTTP Proxy / Spring / Go' },
  { port: 11434, service: 'Ollama Local LLM Engine' },
  { port: 5432, service: 'PostgreSQL Database' },
  { port: 6379, service: 'Redis Cache Server' },
  { port: 27017, service: 'MongoDB Server' }
];

/**
 * Checks if a single TCP port is open on the target host.
 * @param {number} port
 * @param {string} [host='127.0.0.1']
 * @param {number} [timeoutMs=450]
 * @returns {Promise<{port: number, open: boolean, latencyMs: number}>}
 */
export function checkTcpPort(port, host = '127.0.0.1', timeoutMs = 450) {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (open) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({
        port,
        open,
        latencyMs: Date.now() - start
      });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

/**
 * Scans common local development ports and measures external DNS/TCP latency.
 * @returns {Promise<{openPorts: Array<object>, closedCount: number, externalPings: Array<object>, summaryText: string}>}
 */
export async function runCyberSecurityScan() {
  const [portChecks, cfPing, googlePing] = await Promise.all([
    Promise.all(
      COMMON_DEV_PORTS.map(async (item) => {
        const res = await checkTcpPort(item.port, '127.0.0.1', 400);
        return {
          ...item,
          open: res.open,
          latencyMs: res.latencyMs
        };
      })
    ),
    checkTcpPort(443, '1.1.1.1', 1500),
    checkTcpPort(443, '8.8.8.8', 1500)
  ]);

  const openPorts = portChecks.filter((p) => p.open);
  const closedCount = portChecks.length - openPorts.length;

  const externalPings = [
    { target: 'Cloudflare Edge (1.1.1.1:443)', reachable: cfPing.open, latencyMs: cfPing.latencyMs },
    { target: 'Google Global DNS (8.8.8.8:443)', reachable: googlePing.open, latencyMs: googlePing.latencyMs }
  ];

  const portLines = openPorts.map(
    (p) => `- Port ${p.port} [OPEN]: ${p.service} (${p.latencyMs}ms)`
  );
  const pingLines = externalPings.map(
    (e) => `- ${e.target}: ${e.reachable ? `ONLINE (${e.latencyMs}ms)` : 'UNREACHABLE'}`
  );

  const summaryText = [
    `[STARK CYBER-SECURITY & NETWORK DIAGNOSTIC SCAN]:`,
    `Active Localhost Ports (${openPorts.length} Open / ${closedCount} Closed):`,
    ...(portLines.length > 0 ? portLines : ['- No common dev ports open']),
    `External Uplink Latency:`,
    ...pingLines
  ].join('\n');

  return {
    openPorts,
    closedCount,
    externalPings,
    summaryText
  };
}

/**
 * Evaluates a safe mathematical or data transformation expression in a restricted VM sandbox.
 * @param {string} expression
 * @returns {{success: boolean, result: string, error?: string}}
 */
export function evaluateQuantumSandbox(expression) {
  const clean = (expression || '').trim();
  if (!clean) {
    return { success: false, result: '', error: 'Empty expression' };
  }

  try {
    const sandbox = {
      Math,
      Date,
      Number,
      String,
      Array,
      Object,
      JSON,
      parseInt,
      parseFloat,
      sha256: (str) => crypto.createHash('sha256').update(String(str)).digest('hex'),
      uuid: () => crypto.randomUUID(),
      base64Encode: (str) => Buffer.from(String(str), 'utf-8').toString('base64'),
      base64Decode: (str) => Buffer.from(String(str), 'base64').toString('utf-8')
    };

    const result = vm.runInNewContext(clean, sandbox, { timeout: 350 });
    return {
      success: true,
      result: typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
    };
  } catch (error) {
    return {
      success: false,
      result: '',
      error: error instanceof Error ? error.message : 'Sandbox evaluation error'
    };
  }
}
