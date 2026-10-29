import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkTcpPort,
  evaluateQuantumSandbox
} from '../src/server/services/networkScannerService.js';

describe('J.A.R.V.I.S. Cyber-Security & Quantum Sandbox Service', () => {
  it('evaluates SHA-256 hashes deterministically in the Quantum Sandbox', () => {
    const res = evaluateQuantumSandbox('sha256: STARK-MARK-85');
    assert.equal(res.skill, 'quantum_sandbox');
    assert.equal(res.mode, 'SHA-256 Hash');
    assert.equal(res.output.length, 64);
  });

  it('evaluates Base64 encoding and UUID v4 generation accurately', () => {
    const b64 = evaluateQuantumSandbox('base64 encode: Hello Sir');
    assert.equal(b64.output, 'SGVsbG8gU2ly');

    const uuidRes = evaluateQuantumSandbox('generate uuid');
    assert.equal(uuidRes.mode, 'UUID v4 Generator');
    assert.match(uuidRes.output, /^[0-9a-f-]{36}$/i);
  });

  it('evaluates mathematical expressions safely inside the isolated VM', () => {
    const mathRes = evaluateQuantumSandbox('幫我算 (256 * 1024) / 8');
    assert.equal(mathRes.mode, 'Quantum Math VM');
    assert.equal(mathRes.output, '32768');
  });

  it('checks localhost TCP ports with a fast timeout', async () => {
    const probe = await checkTcpPort('127.0.0.1', 65432, 150);
    assert.equal(typeof probe.open, 'boolean');
    assert.equal(typeof probe.latencyMs, 'number');
  });
});
