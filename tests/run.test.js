import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  parseCliArgs,
  parseEnvContent,
  ensureEnvFile,
  getBrowserOpenCommand,
  listenWithPortFallback
} from '../run.js';

describe('J.A.R.V.I.S. Unified Launcher (run.js)', () => {
  it('parses CLI flags accurately', () => {
    const options = parseCliArgs(['--port', '4500', '--no-open', '--skip-ollama', '--test']);
    assert.equal(options.port, 4500);
    assert.equal(options.openBrowserOnStart, false);
    assert.equal(options.skipOllamaBoot, true);
    assert.equal(options.runTestsFirst, true);

    const inlinePort = parseCliArgs(['--port=8080']);
    assert.equal(inlinePort.port, 8080);
    assert.equal(inlinePort.openBrowserOnStart, true);
  });

  it('parses .env content including comments, exports, and quotes', () => {
    const raw = `
      # Comment line
      PORT=3100
      export OLLAMA_BASE_URL="http://127.0.0.1:11434"
      GEMINI_API_KEY='secret-key'
      EMPTY_KEY=
    `;
    const parsed = parseEnvContent(raw);
    assert.equal(parsed.PORT, '3100');
    assert.equal(parsed.OLLAMA_BASE_URL, 'http://127.0.0.1:11434');
    assert.equal(parsed.GEMINI_API_KEY, 'secret-key');
    assert.equal(parsed.EMPTY_KEY, '');
  });

  it('bootstraps .env from .env.example when .env is missing', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-env-test-'));
    const envPath = path.join(tempDir, '.env');
    const examplePath = path.join(tempDir, '.env.example');

    try {
      await fs.writeFile(examplePath, 'JARVIS_TEST_BOOT_VAR=stark_mark_85\n', 'utf-8');
      delete process.env.JARVIS_TEST_BOOT_VAR;

      const result = await ensureEnvFile({ envPath, examplePath });
      assert.equal(result.createdFromExample, true);
      assert.ok(result.loadedKeys.includes('JARVIS_TEST_BOOT_VAR'));
      assert.equal(process.env.JARVIS_TEST_BOOT_VAR, 'stark_mark_85');
    } finally {
      delete process.env.JARVIS_TEST_BOOT_VAR;
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns correct platform-specific browser launch commands', () => {
    const winCmd = getBrowserOpenCommand('http://localhost:3000', 'win32');
    assert.equal(winCmd.command, 'cmd');
    assert.deepEqual(winCmd.args, ['/c', 'start', '', 'http://localhost:3000']);

    const macCmd = getBrowserOpenCommand('http://localhost:3000', 'darwin');
    assert.equal(macCmd.command, 'open');
    assert.deepEqual(macCmd.args, ['http://localhost:3000']);

    const linuxCmd = getBrowserOpenCommand('http://localhost:3000', 'linux');
    assert.equal(linuxCmd.command, 'xdg-open');
    assert.deepEqual(linuxCmd.args, ['http://localhost:3000']);
  });

  it('falls back to the next available port when preferred port is in use', async () => {
    const blocker = http.createServer();
    const server = http.createServer();

    try {
      const basePort = await listenWithPortFallback(blocker, 0);
      const fallbackPort = await listenWithPortFallback(server, basePort, 5);
      assert.ok(fallbackPort > basePort);
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
