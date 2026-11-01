import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getSystemTelemetry, getTelemetryHistory } from './services/telemetryService.js';
import {
  getOllamaStatus,
  generateJarvisResponse,
  streamJarvisResponse,
  PERSONA_MODES
} from './services/llmService.js';
import {
  fetchTodaysNews,
  searchWebIntelligence,
  browseUrlContent,
  fetchWeatherTelemetry,
  fetchMarketTelemetry,
  generateMorningBriefing,
  fetchHackerNewsTop,
  searchArxivPapers,
  searchGithubRepos
} from './services/webSkillsService.js';
import {
  runCyberSecurityScan,
  evaluateQuantumSandbox,
  checkTcpPort
} from './services/networkScannerService.js';
import {
  getVaultState,
  addMemory,
  deleteMemory,
  addTask,
  toggleTask,
  deleteTask,
  addWatchlistSymbol,
  removeWatchlistSymbol
} from './services/memoryVaultService.js';
import {
  getAlertState,
  parseAlertCommand,
  addPriceAlert,
  deletePriceAlert,
  acknowledgeAlertEvents,
  updateAlertSettings,
  fetchTaiwanEarthquakes,
  pushAlertEvent
} from './services/alertService.js';
import {
  getAutomationState,
  updateAutomationSettings,
  generateScheduledMorningBriefing,
  generateEndOfDayDebrief,
  checkServiceHealth,
  checkUptimeSentinel,
  restartOllamaService
} from './services/automationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');
const SOLAR_DIR = path.resolve(__dirname, '../../solarSystem');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav'
};

/**
 * Reads and parses a JSON request body safely.
 * @param {http.IncomingMessage} req
 * @returns {Promise<object>}
 */
async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf-8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

/**
 * Sends a JSON HTTP response.
 * @param {http.ServerResponse} res
 * @param {number} statusCode
 * @param {object} payload
 */
function sendJson(res, statusCode, payload) {
  if (res.headersSent) {
    if (!res.writableEnded) {
      try {
        res.end();
      } catch {}
    }
    return;
  }
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/**
 * Resolves the active port of the local IP Scanner (LAN Radar) service.
 * Inspects .active_port marker or scans default range (63210 - 63230).
 * @param {string} scannerDir
 * @returns {Promise<number|null>}
 */
async function resolveIpScannerPort(scannerDir) {
  const activePortFile = path.join(scannerDir, '.active_port');
  try {
    const raw = await fs.readFile(activePortFile, 'utf-8').catch(() => null);
    if (raw) {
      const p = parseInt(raw.trim(), 10);
      if (p > 0 && p <= 65535) {
        const check = await checkTcpPort(p, '127.0.0.1', 150).catch(() => ({ open: false }));
        if (check.open) return p;
      }
    }
  } catch {
    // Ignore file read error
  }

  // Scan range 63210 to 63230
  for (let p = 63210; p <= 63230; p++) {
    const check = await checkTcpPort(p, '127.0.0.1', 80).catch(() => ({ open: false }));
    if (check.open) return p;
  }
  return null;
}

/**
 * Creates the J.A.R.V.I.S. HTTP server instance.
 * @returns {http.Server}
 */
export function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const parsedUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      const pathname = parsedUrl.pathname;

      if (req.method === 'GET' && pathname === '/api/health') {
        sendJson(res, 200, {
          status: 'ONLINE',
          system: 'STARK INDUSTRIES J.A.R.V.I.S. CORE v85.4',
          timestamp: new Date().toISOString()
        });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/telemetry') {
        const customOllamaUrl = parsedUrl.searchParams.get('ollamaUrl') || undefined;
        const [telemetry, ollama] = await Promise.all([
          Promise.resolve(getSystemTelemetry()),
          getOllamaStatus(customOllamaUrl)
        ]);
        sendJson(res, 200, { telemetry, ollama });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/telemetry/history') {
        const hours = Number(parsedUrl.searchParams.get('hours'));
        const minutes = hours > 0 ? hours * 60 : (Number(parsedUrl.searchParams.get('minutes')) || 60);
        const history = getTelemetryHistory(minutes);
        sendJson(res, 200, history);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/models') {
        const customOllamaUrl = parsedUrl.searchParams.get('ollamaUrl') || undefined;
        const ollama = await getOllamaStatus(customOllamaUrl);

        sendJson(res, 200, {
          ollama,
          recommendedOllamaModels: [
            { name: 'llama3.2:1b', label: 'Llama 3.2 (1B - Ultra Fast, ~1.3GB)' },
            { name: 'llama3.2', label: 'Llama 3.2 (3B - Balanced, ~2.0GB)' },
            { name: 'qwen2.5:3b', label: 'Qwen 2.5 (3B - Strong Chinese/English, ~1.9GB)' },
            { name: 'qwen2.5:7b', label: 'Qwen 2.5 (7B - High Reasoning, ~4.7GB)' },
            { name: 'gemma2:2b', label: 'Gemma 2 (2B - Compact, ~1.6GB)' }
          ],
          cloudCatalog: {
            gemini: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
            openai: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
            anthropic: ['claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
            custom: ['deepseek-chat', 'llama-3.3-70b-versatile', 'local-model']
          },
          envKeysConfigured: {
            gemini: Boolean(process.env.GEMINI_API_KEY),
            openai: Boolean(process.env.OPENAI_API_KEY),
            anthropic: Boolean(process.env.ANTHROPIC_API_KEY)
          },
          personaModes: PERSONA_MODES
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/ollama/pull') {
        req.socket.setTimeout(0);
        res.setTimeout(0);

        const body = await readJsonBody(req);
        const { model, baseUrl } = body;

        if (!model || typeof model !== 'string') {
          sendJson(res, 400, { error: 'Model name is required, Sir.' });
          return;
        }

        const normalizedModel = model.replace(/\s+/g, '');
        const ollamaUrl = (
          baseUrl ||
          process.env.OLLAMA_BASE_URL ||
          'http://127.0.0.1:11434'
        ).replace(/\/+$/, '');

        const upstream = await fetch(`${ollamaUrl}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: normalizedModel, stream: true })
        });

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text();
          sendJson(res, upstream.status || 500, {
            error: `Ollama pull failed: ${errText || upstream.statusText}`
          });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        try {
          const reader = upstream.body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.writableEnded && !res.destroyed) {
              res.write(value);
            }
          }
        } catch (pullErr) {
          console.warn(`[J.A.R.V.I.S. PULL] Stream read error: ${pullErr.message}`);
        } finally {
          if (!res.writableEnded) {
            res.end();
          }
        }
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/news') {
        const edition = parsedUrl.searchParams.get('edition') || 'tw';
        const query = parsedUrl.searchParams.get('q') || '';
        const news = await fetchTodaysNews({ edition, query, limit: 8 });
        sendJson(res, 200, news);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/search') {
        const query = parsedUrl.searchParams.get('q') || '';
        if (!query.trim()) {
          sendJson(res, 400, { error: 'Search query is required, Sir.' });
          return;
        }
        const results = await searchWebIntelligence(query, 6);
        sendJson(res, 200, results);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/browse') {
        const targetUrl = parsedUrl.searchParams.get('url') || '';
        if (!targetUrl.startsWith('http')) {
          sendJson(res, 400, { error: 'Valid HTTP/HTTPS URL is required, Sir.' });
          return;
        }
        const page = await browseUrlContent(targetUrl);
        sendJson(res, 200, page);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/weather') {
        const city = parsedUrl.searchParams.get('city') || 'Taipei';
        const weather = await fetchWeatherTelemetry(city);
        sendJson(res, 200, weather);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/market') {
        const vault = await getVaultState();
        const market = await fetchMarketTelemetry(
          ['GC=F', '^TWII', '2330.TW', 'NVDA', 'AAPL', 'BTC-USD', 'TWD=X'],
          vault.watchlist || []
        );
        sendJson(res, 200, market);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/briefing') {
        const city = parsedUrl.searchParams.get('city') || '台北,高雄';
        const vault = await getVaultState();
        const pendingTasks = (vault.tasks || []).filter((t) => !t.completed);
        const briefing = await generateMorningBriefing({
          city,
          pendingTasks,
          customWatchlist: vault.watchlist || []
        });
        sendJson(res, 200, briefing);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/cyber-scan') {
        const scan = await runCyberSecurityScan();
        sendJson(res, 200, scan);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/skills/sandbox') {
        const { expression } = await readJsonBody(req);
        const result = evaluateQuantumSandbox(expression || '');
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/rnd') {
        const type = parsedUrl.searchParams.get('type') || 'arxiv';
        const query = parsedUrl.searchParams.get('q') || '';
        if (type === 'hn') {
          const hn = await fetchHackerNewsTop(6);
          sendJson(res, 200, hn);
          return;
        }
        if (type === 'github') {
          const gh = await searchGithubRepos(query || 'ai agent', 5);
          sendJson(res, 200, gh);
          return;
        }
        const arxiv = await searchArxivPapers(query || 'large language models', 5);
        sendJson(res, 200, arxiv);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/vault') {
        const state = await getVaultState();
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/vault/memory') {
        const { content, category } = await readJsonBody(req);
        const item = await addMemory(content, category);
        const state = await getVaultState();
        sendJson(res, 200, { item, state });
        return;
      }

      if (req.method === 'DELETE' && pathname === '/api/vault/memory') {
        const id = parsedUrl.searchParams.get('id') || '';
        const state = await deleteMemory(id);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/vault/task') {
        const { title } = await readJsonBody(req);
        const task = await addTask(title);
        const state = await getVaultState();
        sendJson(res, 200, { task, state });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/vault/task/toggle') {
        const { id } = await readJsonBody(req);
        const state = await toggleTask(id);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'DELETE' && pathname === '/api/vault/task') {
        const id = parsedUrl.searchParams.get('id') || '';
        const state = await deleteTask(id);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/vault/watchlist') {
        const { symbol } = await readJsonBody(req);
        await addWatchlistSymbol(symbol);
        const state = await getVaultState();
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'DELETE' && pathname === '/api/vault/watchlist') {
        const symbol = parsedUrl.searchParams.get('symbol') || '';
        const state = await removeWatchlistSymbol(symbol);
        sendJson(res, 200, state);
        return;
      }

      // --- Stark Sentinel: Price Alerts & Earthquake Monitor ---
      if (req.method === 'GET' && pathname === '/api/alerts') {
        const state = await getAlertState();
        sendJson(res, 200, {
          priceAlerts: state.priceAlerts,
          events: state.events.filter((e) => !e.acknowledged),
          settings: state.settings
        });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/alerts') {
        const { text } = await readJsonBody(req);
        const spec = parseAlertCommand(String(text || ''), { requireTrigger: false });
        if (!spec) {
          sendJson(res, 400, {
            error: 'Unable to parse alert, Sir. Try "0050 > 180", "黃金漲破 NT$16000", or "NVDA 跌 3%".'
          });
          return;
        }
        const alert = await addPriceAlert(spec);
        sendJson(res, 200, { alert });
        return;
      }

      if (req.method === 'DELETE' && pathname === '/api/alerts') {
        const id = parsedUrl.searchParams.get('id') || '';
        const state = await deletePriceAlert(id);
        sendJson(res, 200, { priceAlerts: state.priceAlerts });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/alerts/ack') {
        const { ids } = await readJsonBody(req);
        await acknowledgeAlertEvents(ids);
        sendJson(res, 200, { ok: true });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/alerts/settings') {
        const patch = await readJsonBody(req);
        const state = await updateAlertSettings(patch);
        sendJson(res, 200, { settings: state.settings });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/earthquakes') {
        const minMagnitude = Number(parsedUrl.searchParams.get('min')) || 4.0;
        const quakes = await fetchTaiwanEarthquakes({ feed: '2.5_week', minMagnitude });
        sendJson(res, 200, quakes);
        return;
      }

      // --- Stark Automation: Morning Briefing, Debrief & Service Sentinel ---
      if (req.method === 'GET' && pathname === '/api/automation') {
        const state = await getAutomationState();
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/automation/settings') {
        const patch = await readJsonBody(req);
        const state = await updateAutomationSettings(patch);
        sendJson(res, 200, state);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/automation/debrief') {
        const debrief = await generateEndOfDayDebrief({ saveToFile: true });
        sendJson(res, 200, debrief);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/automation/briefing') {
        const briefing = await generateScheduledMorningBriefing();
        sendJson(res, 200, briefing);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/automation/services') {
        const alerts = await checkServiceHealth();
        const state = await getAutomationState();
        sendJson(res, 200, { serviceStatus: state.serviceStatus, alerts });
        return;
      }

      if (req.method === 'GET' && pathname === '/api/automation/uptime') {
        const alerts = await checkUptimeSentinel();
        const state = await getAutomationState();
        sendJson(res, 200, { uptimeStatus: state.uptimeStatus, alerts });
        return;
      }

      if (req.method === 'POST' && pathname === '/api/automation/ollama/restart') {
        const result = restartOllamaService();
        sendJson(res, 200, result);
        return;
      }

      if (req.method === 'POST' && pathname === '/api/chat/stream') {
        req.socket.setTimeout(0);
        res.setTimeout(0);

        const body = await readJsonBody(req);
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
          sendJson(res, 400, { error: 'No transmission payload detected, Sir.' });
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Transfer-Encoding': 'chunked',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive'
        });

        try {
          await streamJarvisResponse(body, (eventObj) => {
            if (!res.writableEnded && !res.destroyed) {
              res.write(`${JSON.stringify(eventObj)}\n`);
            }
          });
        } catch (streamErr) {
          console.warn(`[J.A.R.V.I.S. STREAM] Streaming error: ${streamErr.message}`);
        } finally {
          if (!res.writableEnded) {
            res.end();
          }
        }
        return;
      }

      if (req.method === 'POST' && pathname === '/api/chat') {
        const body = await readJsonBody(req);
        const {
          provider = 'ollama',
          model = 'llama3.2',
          messages = [],
          personaMode = 'witty',
          language = 'en-GB',
          honorific = 'Sir',
          apiKey = '',
          baseUrl = '',
          webSearchEnabled = true,
          forceWebSearch = false,
          attachment = null,
          imageDataUrl = ''
        } = body;

        if (!Array.isArray(messages) || messages.length === 0) {
          sendJson(res, 400, { error: 'No transmission payload detected, Sir.' });
          return;
        }

        const result = await generateJarvisResponse({
          provider,
          model,
          messages,
          personaMode,
          language,
          honorific,
          apiKey,
          baseUrl,
          webSearchEnabled,
          forceWebSearch,
          attachment,
          imageDataUrl
        });

        sendJson(res, 200, result);
        return;
      }

      // Launch SolarSystem application directly on host OS
      if (req.method === 'POST' && pathname === '/api/launch/solar-system') {
        const solarIndexPath = path.join(SOLAR_DIR, 'index.html');
        let launched = false;
        try {
          if (process.platform === 'win32') {
            const child = spawn('cmd.exe', ['/c', 'start', '', solarIndexPath], {
              detached: true,
              stdio: 'ignore'
            });
            child.on('error', () => {});
            child.unref();
            launched = true;
          } else if (process.platform === 'darwin') {
            const child = spawn('open', [solarIndexPath], { detached: true, stdio: 'ignore' });
            child.on('error', () => {});
            child.unref();
            launched = true;
          } else {
            const child = spawn('xdg-open', [solarIndexPath], { detached: true, stdio: 'ignore' });
            child.on('error', () => {});
            child.unref();
            launched = true;
          }
        } catch {
          launched = false;
        }

        sendJson(res, 200, {
          success: true,
          launched,
          filePath: solarIndexPath,
          webUrl: '/solarSystem/index.html'
        });
        return;
      }

      // Launch IP Scanner application (Autorun.bat) directly on host OS
      if (req.method === 'POST' && pathname === '/api/launch/ip-scanner') {
        const ipScannerBatPath = path.resolve(process.cwd(), 'ipScanner', 'Autorun.bat');
        const ipScannerDir = path.resolve(process.cwd(), 'ipScanner');
        let launched = false;
        let activePort = await resolveIpScannerPort(ipScannerDir);

        if (activePort) {
          launched = true;
        } else {
          try {
            if (process.platform === 'win32') {
              const child = spawn('cmd.exe', ['/c', 'start', 'Local Network IP Scanner', 'cmd.exe', '/c', 'Autorun.bat'], {
                cwd: ipScannerDir,
                env: { ...process.env, NO_BROWSER: '1' },
                detached: true,
                stdio: 'ignore'
              });
              child.on('error', (err) => console.warn('[J.A.R.V.I.S.] Failed to spawn Autorun.bat:', err.message));
              child.unref();
              launched = true;
            } else if (process.platform === 'darwin') {
              const child = spawn('open', [ipScannerBatPath], {
                cwd: ipScannerDir,
                env: { ...process.env, NO_BROWSER: '1' },
                detached: true,
                stdio: 'ignore'
              });
              child.on('error', () => {});
              child.unref();
              launched = true;
            } else {
              const child = spawn('bash', ['-c', `cd "${ipScannerDir}" && ./Autorun.bat`], {
                cwd: ipScannerDir,
                env: { ...process.env, NO_BROWSER: '1' },
                detached: true,
                stdio: 'ignore'
              });
              child.on('error', () => {});
              child.unref();
              launched = true;
            }

            // Await dynamic port assignment (probe up to 1.5 seconds)
            for (let i = 0; i < 15; i++) {
              await new Promise((r) => setTimeout(r, 100));
              activePort = await resolveIpScannerPort(ipScannerDir);
              if (activePort) break;
            }
          } catch {
            launched = false;
          }
        }

        const finalPort = activePort || 63210;
        sendJson(res, 200, {
          success: true,
          launched,
          port: finalPort,
          filePath: ipScannerBatPath,
          webUrl: `http://localhost:${finalPort}`
        });
        return;
      }

      // Serve SolarSystem application files
      if (pathname === '/solarSystem' || pathname.startsWith('/solarSystem/')) {
        const relSolar = pathname === '/solarSystem' || pathname === '/solarSystem/'
          ? 'index.html'
          : pathname.replace(/^\/solarSystem\/?/, '') || 'index.html';
        const safeSolar = path.normalize(relSolar).replace(/^(\.\.(\/|\\|$))+/, '');
        const fullSolar = path.join(SOLAR_DIR, safeSolar);

        if (!fullSolar.startsWith(SOLAR_DIR)) {
          sendJson(res, 403, { error: 'Access denied by Stark Firewall.' });
          return;
        }

        const fileBuffer = await fs.readFile(fullSolar);
        const ext = path.extname(fullSolar).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
        });
        res.end(fileBuffer);
        return;
      }

      // Serve static files from /public
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      let fullPath = path.join(PUBLIC_DIR, safePath);

      if (!fullPath.startsWith(PUBLIC_DIR)) {
        sendJson(res, 403, { error: 'Access denied by Stark Firewall.' });
        return;
      }

      const stat = await fs.stat(fullPath).catch(() => null);
      if (stat && stat.isDirectory()) {
        fullPath = path.join(fullPath, 'index.html');
      }

      const fileBuffer = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(fileBuffer);
    } catch (error) {
      if (res.headersSent) {
        if (!res.writableEnded) {
          try {
            res.end();
          } catch {}
        }
        return;
      }
      if (error && error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Holographic resource not found, Sir.' });
        return;
      }
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : 'Internal mainframe exception'
      });
    }
  });

  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.keepAliveTimeout = 0;
  return server;
}

/**
 * Binds an HTTP server to a preferred port, falling back to subsequent ports if occupied.
 * @param {import('node:http').Server} server
 * @param {number} preferredPort
 * @param {number} [maxAttempts=50]
 * @returns {Promise<number>}
 */
export function listenWithPortFallback(server, preferredPort, maxAttempts = 50) {
  return new Promise((resolve, reject) => {
    let currentPort = preferredPort;
    let attempts = 0;

    const tryListen = () => {
      attempts += 1;

      const onError = (/** @type {NodeJS.ErrnoException} */ err) => {
        server.removeListener('listening', onListening);
        if (err.code === 'EADDRINUSE' && attempts < maxAttempts) {
          console.warn(
            `[J.A.R.V.I.S. BOOT] Port ${currentPort} is occupied. Re-routing to port ${currentPort + 1}...`
          );
          currentPort += 1;
          tryListen();
        } else {
          reject(err);
        }
      };

      const onListening = () => {
        server.removeListener('error', onError);
        const address = server.address();
        const boundPort =
          typeof address === 'object' && address !== null ? address.port : currentPort;
        resolve(boundPort);
      };

      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(currentPort);
    };

    tryListen();
  });
}
