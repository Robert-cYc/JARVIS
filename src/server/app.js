import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getSystemTelemetry } from './services/telemetryService.js';
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
  evaluateQuantumSandbox
} from './services/networkScannerService.js';
import {
  getVaultState,
  addMemory,
  deleteMemory,
  addTask,
  toggleTask,
  deleteTask
} from './services/memoryVaultService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../../public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
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
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

/**
 * Creates the J.A.R.V.I.S. HTTP server instance.
 * @returns {http.Server}
 */
export function createServer() {
  const server = http.createServer(async (req, res) => {
    try {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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

        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
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
        const market = await fetchMarketTelemetry();
        sendJson(res, 200, market);
        return;
      }

      if (req.method === 'GET' && pathname === '/api/skills/briefing') {
        const city = parsedUrl.searchParams.get('city') || 'Taipei';
        const vault = await getVaultState();
        const pendingTasks = (vault.tasks || []).filter((t) => !t.completed);
        const briefing = await generateMorningBriefing({ city, pendingTasks });
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

        await streamJarvisResponse(body, (eventObj) => {
          res.write(`${JSON.stringify(eventObj)}\n`);
        });
        res.end();
        return;
      }

      if (req.method === 'POST' && pathname === '/api/chat') {
        const body = await readJsonBody(req);
        const {
          provider = 'ollama',
          model = 'llama3.2',
          messages = [],
          personaMode = 'butler',
          language = 'auto',
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

      // Serve static files from /public
      const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
      const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
      const fullPath = path.join(PUBLIC_DIR, safePath);

      if (!fullPath.startsWith(PUBLIC_DIR)) {
        sendJson(res, 403, { error: 'Access denied by Stark Firewall.' });
        return;
      }

      const fileBuffer = await fs.readFile(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream'
      });
      res.end(fileBuffer);
    } catch (error) {
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
