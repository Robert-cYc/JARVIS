import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCpuUsagePercent,
  getSystemTelemetry,
  parseNvidiaSmiCsv,
  resolveNvidiaSmiBinary
} from '../src/server/services/telemetryService.js';

describe('J.A.R.V.I.S. Telemetry Service', () => {
  it('returns CPU usage percentage within valid 0-100 bounds', () => {
    const usage = getCpuUsagePercent();
    assert.equal(typeof usage, 'number');
    assert.ok(usage >= 0 && usage <= 100);
  });

  it('parses nvidia-smi CSV output into structured GPU memory telemetry', () => {
    const sampleCsv = 'NVIDIA GeForce RTX 4060 Laptop GPU, 2048, 8188, 35, 54\n';
    const gpu = parseNvidiaSmiCsv(sampleCsv);
    assert.ok(gpu);
    assert.equal(gpu.available, true);
    assert.equal(gpu.name, 'NVIDIA GeForce RTX 4060 Laptop GPU');
    assert.equal(gpu.memoryUsedMb, 2048);
    assert.equal(gpu.memoryTotalMb, 8188);
    assert.equal(gpu.memoryUsedGb, 2);
    assert.equal(gpu.memoryTotalGb, 8);
    assert.equal(gpu.memoryUsagePercent, 25);
    assert.equal(gpu.utilizationPercent, 35);
    assert.equal(gpu.temperatureC, 54);
    assert.equal(parseNvidiaSmiCsv(''), null);
  });

  it('resolves a valid binary path or command name for nvidia-smi', () => {
    const bin = resolveNvidiaSmiBinary();
    assert.equal(typeof bin, 'string');
    assert.ok(bin.length > 0);
  });

  it('returns complete Mark LXXXV system telemetry metrics', () => {
    const telemetry = getSystemTelemetry();
    assert.ok('hostname' in telemetry);
    assert.ok('cpuUsagePercent' in telemetry);
    assert.ok('memoryTotalGb' in telemetry);
    assert.ok('memoryUsagePercent' in telemetry);
    assert.ok('gpu' in telemetry);
    assert.ok('arcReactorOutputPercent' in telemetry);
    assert.equal(telemetry.suitIntegrityPercent, 100);
  });
});
