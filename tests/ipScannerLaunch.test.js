import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { isIpScannerPort, resolveIpScannerPort } from '../src/server/app.js';

describe('IP Scanner Port Resolution & Endpoint Signature Verification', () => {
  it('returns false for inactive or non-IP-scanner ports', async () => {
    // Non-existent port
    const inactive = await isIpScannerPort(59999);
    assert.equal(inactive, false);

    // Active port that does NOT return /api/my-ip signature
    const dummyServer = http.createServer((req, res) => {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise((resolve) => dummyServer.listen(0, '127.0.0.1', resolve));
    const dummyPort = dummyServer.address().port;

    try {
      const isScanner = await isIpScannerPort(dummyPort);
      assert.equal(isScanner, false);
    } finally {
      await new Promise((resolve) => dummyServer.close(resolve));
    }
  });

  it('returns true when port responds to /api/my-ip with valid subnet payload', async () => {
    const scannerServer = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/api/my-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ip: '192.168.1.100',
          subnet: '192.168.1',
          host: 100,
          hostname: 'STARK-NODE'
        }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => scannerServer.listen(0, '127.0.0.1', resolve));
    const scannerPort = scannerServer.address().port;

    try {
      const isScanner = await isIpScannerPort(scannerPort);
      assert.equal(isScanner, true);
    } finally {
      await new Promise((resolve) => scannerServer.close(resolve));
    }
  });

  it('resolveIpScannerPort respects .active_port marker and excludes JARVIS own port', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'jarvis-scanner-test-'));

    const scannerServer = http.createServer((req, res) => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/api/my-ip') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ subnet: '192.168.1' }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise((resolve) => scannerServer.listen(0, '127.0.0.1', resolve));
    const scannerPort = scannerServer.address().port;

    try {
      // 1. Write active port to marker file
      await fs.writeFile(path.join(tempDir, '.active_port'), String(scannerPort), 'utf-8');

      // 2. Normal resolution finds scannerPort
      const foundPort = await resolveIpScannerPort(tempDir);
      assert.equal(foundPort, scannerPort);

      // 3. If marker points to excludedPort (e.g. JARVIS's own port), marker is ignored and excludedPort is never returned
      const excludedResult = await resolveIpScannerPort(tempDir, scannerPort);
      assert.notEqual(excludedResult, scannerPort);
    } finally {
      await new Promise((resolve) => scannerServer.close(resolve));
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
