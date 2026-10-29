#!/usr/bin/env node
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from './src/server/app.js';
import { getOllamaStatus } from './src/server/services/llmService.js';
import { getVaultState } from './src/server/services/memoryVaultService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * @typedef {Object} LauncherOptions
 * @property {number} port
 * @property {boolean} openBrowserOnStart
 * @property {boolean} skipOllamaBoot
 * @property {boolean} runTestsFirst
 */

/**
 * Parses CLI arguments into structured launcher options.
 * @param {string[]} argv
 * @returns {LauncherOptions}
 */
export function parseCliArgs(argv = []) {
  /** @type {LauncherOptions} */
  const options = {
    port: Number(process.env.PORT) || 3000,
    openBrowserOnStart: true,
    skipOllamaBoot: false,
    runTestsFirst: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--no-open') {
      options.openBrowserOnStart = false;
    } else if (arg === '--skip-ollama') {
      options.skipOllamaBoot = true;
    } else if (arg === '--test' || arg === '--run-tests') {
      options.runTestsFirst = true;
    } else if (arg === '--port' && argv[i + 1]) {
      const parsedPort = Number(argv[i + 1]);
      if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        options.port = parsedPort;
      }
      i += 1;
    } else if (arg.startsWith('--port=')) {
      const parsedPort = Number(arg.split('=')[1]);
      if (Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort <= 65535) {
        options.port = parsedPort;
      }
    }
  }

  return options;
}

/**
 * Parses raw `.env` file content into a key-value map.
 * @param {string} rawContent
 * @returns {Record<string, string>}
 */
export function parseEnvContent(rawContent) {
  /** @type {Record<string, string>} */
  const parsed = {};
  if (typeof rawContent !== 'string') return parsed;

  const lines = rawContent.split(/\r?\n/);
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    let value = normalized.slice(eqIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    parsed[key] = value;
  }

  return parsed;
}

/**
 * Ensures `.env` exists (bootstrapping from `.env.example` if missing) and loads variables into `process.env`.
 * @param {{ envPath?: string, examplePath?: string }} [paths]
 * @returns {Promise<{ createdFromExample: boolean, loadedKeys: string[] }>}
 */
export async function ensureEnvFile(paths = {}) {
  const envPath = paths.envPath || path.join(__dirname, '.env');
  const examplePath = paths.examplePath || path.join(__dirname, '.env.example');
  let createdFromExample = false;

  try {
    if (!existsSync(envPath) && existsSync(examplePath)) {
      await fs.copyFile(examplePath, envPath);
      createdFromExample = true;
    }

    if (!existsSync(envPath)) {
      return { createdFromExample, loadedKeys: [] };
    }

    const content = await fs.readFile(envPath, 'utf-8');
    const envVars = parseEnvContent(content);
    const loadedKeys = [];

    for (const [key, value] of Object.entries(envVars)) {
      if (process.env[key] === undefined && value !== '') {
        process.env[key] = value;
        loadedKeys.push(key);
      }
    }

    return { createdFromExample, loadedKeys };
  } catch (error) {
    console.warn(
      `[J.A.R.V.I.S. BOOT] Warning: Failed to initialize .env file (${error instanceof Error ? error.message : String(error)})`
    );
    return { createdFromExample: false, loadedKeys: [] };
  }
}

/**
 * Resolves the platform-specific command and arguments to open a URL in the default browser.
 * @param {string} url
 * @param {NodeJS.Platform} [platform]
 * @returns {{ command: string, args: string[] }}
 */
export function getBrowserOpenCommand(url, platform = process.platform) {
  if (platform === 'win32') {
    return { command: 'cmd', args: ['/c', 'start', '', url] };
  }
  if (platform === 'darwin') {
    return { command: 'open', args: [url] };
  }
  return { command: 'xdg-open', args: [url] };
}

/**
 * Launches the system default browser pointing to the given URL.
 * @param {string} url
 * @param {NodeJS.Platform} [platform]
 * @returns {boolean}
 */
export function openBrowser(url, platform = process.platform) {
  try {
    const { command, args } = getBrowserOpenCommand(url, platform);
    const child = spawn(command, args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('error', (err) => {
      console.warn(`[J.A.R.V.I.S. BOOT] Could not auto-open browser: ${err.message}`);
    });
    child.unref();
    return true;
  } catch (error) {
    console.warn(
      `[J.A.R.V.I.S. BOOT] Browser auto-launch skipped: ${error instanceof Error ? error.message : String(error)}`
    );
    return false;
  }
}

/**
 * Checks whether local Ollama is online, and attempts to start `ollama serve` in the background if offline.
 * @param {string} [baseUrl]
 * @returns {Promise<{ online: boolean, baseUrl: string, models: Array<{name: string}>, autoStarted: boolean }>}
 */
export async function ensureOllamaRunning(baseUrl = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434') {
  const initialStatus = await getOllamaStatus(baseUrl);
  if (initialStatus.online) {
    return { ...initialStatus, autoStarted: false };
  }

  console.log('[J.A.R.V.I.S. BOOT] Local Ollama daemon offline. Attempting background ignition (`ollama serve`)...');

  try {
    const child = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    });
    child.on('error', () => {
      // Handled by subsequent status polling if Ollama binary is not installed
    });
    child.unref();
  } catch {
    return { ...initialStatus, autoStarted: false };
  }

  for (let attempt = 0; attempt < 8; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const currentStatus = await getOllamaStatus(baseUrl);
    if (currentStatus.online) {
      return { ...currentStatus, autoStarted: true };
    }
  }

  return { ...initialStatus, autoStarted: false };
}

/**
 * Runs the native Node.js test suite before server launch.
 * @returns {Promise<boolean>}
 */
export function runTestSuite() {
  return new Promise((resolve) => {
    console.log('[J.A.R.V.I.S. BOOT] Running pre-flight diagnostic test suite...');
    const child = spawn(process.execPath, ['--test'], {
      cwd: __dirname,
      stdio: 'inherit'
    });
    child.on('error', (err) => {
      console.error(`[J.A.R.V.I.S. BOOT] Test runner failed: ${err.message}`);
      resolve(false);
    });
    child.on('close', (code) => {
      resolve(code === 0);
    });
  });
}

/**
 * Binds an HTTP server to a preferred port, falling back to subsequent ports if occupied.
 * @param {import('node:http').Server} server
 * @param {number} preferredPort
 * @param {number} [maxAttempts]
 * @returns {Promise<number>}
 */
export function listenWithPortFallback(server, preferredPort, maxAttempts = 10) {
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

/**
 * Main unified boot sequence for the J.A.R.V.I.S. Mark LXXXV HUD system.
 * @param { string[] } [rawArgv]
 */
export async function bootJarvisSystem(rawArgv = process.argv.slice(2)) {
  console.log('======================================================================');
  console.log('  STARK INDUSTRIES // J.A.R.V.I.S. MARK LXXXV UNIFIED LAUNCHER');
  console.log('======================================================================');

  const envStatus = await ensureEnvFile();
  if (envStatus.createdFromExample) {
    console.log('[J.A.R.V.I.S. BOOT] Created default .env configuration from .env.example.');
  }

  const options = parseCliArgs(rawArgv);

  if (options.runTestsFirst) {
    const testsPassed = await runTestSuite();
    if (!testsPassed) {
      throw new Error('Pre-flight unit tests failed. Aborting launch.');
    }
  }

  await getVaultState();
  console.log('[J.A.R.V.I.S. BOOT] Memory Vault & Task Matrix initialized.');

  if (!options.skipOllamaBoot) {
    const ollama = await ensureOllamaRunning();
    if (ollama.online) {
      const modelNames = ollama.models.map((m) => m.name).join(', ') || 'none installed yet';
      console.log(
        `[J.A.R.V.I.S. BOOT] Ollama Core ONLINE at ${ollama.baseUrl} (${ollama.models.length} models: ${modelNames})`
      );
    } else {
      console.log(
        `[J.A.R.V.I.S. BOOT] Ollama Core offline (${ollama.baseUrl}). Cloud LLMs & HUD diagnostics remain available.`
      );
    }
  }

  const server = createServer();
  const activePort = await listenWithPortFallback(server, options.port);
  const hudUrl = `http://localhost:${activePort}`;

  console.log('----------------------------------------------------------------------');
  console.log(`[J.A.R.V.I.S. SYSTEM ONLINE] Holographic HUD active at: ${hudUrl}`);
  console.log('Press Ctrl+C at any time to power down the Arc Reactor.');
  console.log('----------------------------------------------------------------------');

  if (options.openBrowserOnStart) {
    openBrowser(hudUrl);
  }

  const shutdown = (/** @type {string} */ signal) => {
    console.log(`\n[J.A.R.V.I.S. SYSTEM] ${signal} received. Powering down HUD mainframe, Sir...`);
    server.close(() => {
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));

  return { server, port: activePort, url: hudUrl };
}

const isDirectExecution =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isDirectExecution) {
  bootJarvisSystem().catch((error) => {
    console.error(
      `[J.A.R.V.I.S. CRITICAL FAULT] ${error instanceof Error ? error.message : String(error)}`
    );
    process.exit(1);
  });
}
