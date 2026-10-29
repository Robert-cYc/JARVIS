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
 * Supports both (port, host, timeoutMs) and (host, port, timeoutMs) argument orders.
 * @param {number|string} portOrHost
 * @param {string|number} [hostOrPort='127.0.0.1']
 * @param {number} [timeoutMs=450]
 * @returns {Promise<{port: number, open: boolean, latencyMs: number}>}
 */
export function checkTcpPort(portOrHost, hostOrPort = '127.0.0.1', timeoutMs = 450) {
  const port = typeof portOrHost === 'number' ? portOrHost : Number(hostOrPort);
  const host = typeof portOrHost === 'string' ? portOrHost : String(hostOrPort);

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
 * @returns {Promise<{skill: string, securityStatus: string, internetLatencyMs: number, openPorts: Array<object>, closedCount: number, externalPings: Array<object>, items: Array<object>, summaryText: string}>}
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
  const internetLatencyMs = cfPing.open ? cfPing.latencyMs : googlePing.latencyMs;
  const securityStatus =
    openPorts.length <= 4 ? 'NOMINAL // STARK FIREWALL ACTIVE' : 'ELEVATED // MULTIPLE PORTS OPEN';

  const externalPings = [
    {
      target: 'Cloudflare Edge (1.1.1.1:443)',
      reachable: cfPing.open,
      latencyMs: cfPing.latencyMs
    },
    {
      target: 'Google Global DNS (8.8.8.8:443)',
      reachable: googlePing.open,
      latencyMs: googlePing.latencyMs
    }
  ];

  const items = openPorts.map((p) => ({
    title: `Localhost TCP Port ${p.port} (${p.service}) — OPEN [${p.latencyMs}ms]`,
    link: `http://localhost:${p.port}`,
    source: 'Stark Port Scanner'
  }));

  const portLines = openPorts.map(
    (p) => `- Port ${p.port} [OPEN]: ${p.service} (${p.latencyMs}ms)`
  );
  const pingLines = externalPings.map(
    (e) => `- ${e.target}: ${e.reachable ? `ONLINE (${e.latencyMs}ms)` : 'UNREACHABLE'}`
  );

  const summaryText = [
    `[STARK CYBER-SECURITY & NETWORK DIAGNOSTIC SCAN]:`,
    `- Security Posture: ${securityStatus}`,
    `- Active Localhost Ports (${openPorts.length} Open / ${closedCount} Closed):`,
    ...(portLines.length > 0 ? portLines : ['- No common dev ports open']),
    `- External Uplink Latency:`,
    ...pingLines
  ].join('\n');

  return {
    skill: 'cyber_security_scan',
    securityStatus,
    internetLatencyMs,
    openPorts,
    closedCount,
    externalPings,
    items,
    summaryText
  };
}

/**
 * Evaluates a safe mathematical, cryptographic hash, Base64, or UUID expression in a restricted sandbox.
 * @param {string} rawInput
 * @returns {{skill: string, success: boolean, mode: string, output: string, result: string, items: Array<object>, summaryText: string}}
 */
export function evaluateQuantumSandbox(rawInput) {
  const text = (rawInput || '').trim();
  if (!text) {
    return {
      skill: 'quantum_sandbox',
      success: false,
      mode: 'Empty',
      output: '',
      result: '',
      items: [],
      summaryText: 'No sandbox expression provided.'
    };
  }

  let mode = 'Quantum Math VM';
  let output = '';

  try {
    // 1. Check for SHA-256 request ("sha256: xxx" or "sha256 xxx")
    const shaMatch = text.match(/sha256\s*[：:]?\s*([^\s，。,]+)/i);
    if (shaMatch && !text.includes('sha256(')) {
      mode = 'SHA-256 Hash';
      const targetStr = shaMatch[1].trim();
      output = crypto.createHash('sha256').update(targetStr).digest('hex');
    } else if (/base64\s*(?:encode|編碼)?\s*[：:]\s*(.+)$/i.test(text)) {
      // 2. Check for Base64 Encode
      const b64Match = text.match(/base64\s*(?:encode|編碼)?\s*[：:]\s*(.+)$/i);
      mode = 'Base64 Encoder';
      output = Buffer.from(b64Match[1].trim(), 'utf-8').toString('base64');
    } else if (/\buuid\b/i.test(text) && !text.includes('uuid(')) {
      // 3. Check for UUID generation
      mode = 'UUID v4 Generator';
      output = crypto.randomUUID();
    } else {
      // 4. Extract math expression or run in isolated VM
      const mathExtracted = text
        .replace(
          /(JARVIS|賈維斯|請|幫我算|幫我|精確|計算一下|計算|算一下|算|的數值|是多少|calculate|evaluate|[，。？?])/gi,
          ' '
        )
        .trim();

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

      const res = vm.runInNewContext(mathExtracted || text, sandbox, { timeout: 350 });
      output = typeof res === 'object' ? JSON.stringify(res) : String(res);
    }

    // If user asked both SHA256 AND math in one sentence, also append math result if present
    let summaryText = `[Stark Quantum Sandbox — ${mode}]\n- Input: ${text}\n- Computed Output: ${output}`;
    const extraMath = text.match(/\([\d\s+*\/-]+\)\s*[*\/+-]\s*\d+/);
    if (mode === 'SHA-256 Hash' && extraMath) {
      try {
        const mathVal = vm.runInNewContext(extraMath[0], { Math }, { timeout: 200 });
        summaryText += `\n- Additional Math (${extraMath[0]}): ${mathVal}`;
      } catch {
        // Ignore secondary math error
      }
    }

    return {
      skill: 'quantum_sandbox',
      success: true,
      mode,
      output,
      result: output,
      items: [
        {
          title: `[${mode}] Output: ${output}`,
          link: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math',
          source: 'Stark Quantum VM'
        }
      ],
      summaryText
    };
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Evaluation error';
    return {
      skill: 'quantum_sandbox',
      success: false,
      mode: 'Error',
      output: '',
      result: '',
      items: [],
      summaryText: `Quantum Sandbox error: ${errMsg}`
    };
  }
}
