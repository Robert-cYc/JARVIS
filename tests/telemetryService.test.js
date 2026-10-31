import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCpuUsagePercent,
  getSystemTelemetry,
  getDiskTelemetry,
  getTelemetryHistory,
  recordTelemetryHistoryPoint,
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
    assert.ok(Array.isArray(telemetry.disks));
    assert.ok(telemetry.disks.length > 0);
    assert.ok('internet' in telemetry);
    assert.equal(typeof telemetry.internet.online, 'boolean');
    assert.ok('arcReactorOutputPercent' in telemetry);
    assert.equal(telemetry.suitIntegrityPercent, 100);
  });

  it('resolves real-time disk storage volume telemetry', () => {
    const disks = getDiskTelemetry();
    assert.ok(Array.isArray(disks));
    assert.ok(disks.length > 0);
    const primary = disks[0];
    assert.ok('drive' in primary);
    assert.equal(typeof primary.totalGb, 'number');
    assert.equal(typeof primary.freeGb, 'number');
    assert.equal(typeof primary.usedGb, 'number');
    assert.equal(typeof primary.usagePercent, 'number');
    assert.ok(primary.totalGb > 0);
    assert.ok(primary.usagePercent >= 0 && primary.usagePercent <= 100);
  });

  it('records and provides 5m, 10m, 30m, 1h, 8h, 12h, and 24h historical telemetry trends with statistics', () => {
    // Record mock points
    const now = Date.now();
    recordTelemetryHistoryPoint({
      timestamp: now - 60000,
      cpu: 45,
      gpu: { utilizationPercent: 20, memoryUsagePercent: 35 },
      ram: 50
    });
    recordTelemetryHistoryPoint({
      timestamp: now,
      cpu: 55,
      gpu: { utilizationPercent: 30, memoryUsagePercent: 40 },
      ram: 52
    });

    for (const mins of [5, 10, 30, 60, 480, 720, 1440]) {
      const history = getTelemetryHistory(mins);
      assert.equal(history.windowMinutes, mins);
      assert.ok(Array.isArray(history.points));
      assert.ok(history.points.length > 0);
      assert.ok('summary' in history);
      assert.ok('cpu' in history.summary);
      assert.ok('ram' in history.summary);
      assert.ok('gpu' in history.summary);
      assert.ok('gpuMem' in history.summary);

      // Verify CPU metrics
      assert.equal(typeof history.summary.cpu.current, 'number');
      assert.equal(typeof history.summary.cpu.avg, 'number');
      assert.equal(typeof history.summary.cpu.max, 'number');
      assert.equal(typeof history.summary.cpu.min, 'number');
      assert.ok(history.summary.cpu.max >= history.summary.cpu.min);

      // Verify RAM metrics
      assert.equal(typeof history.summary.ram.current, 'number');
      assert.equal(typeof history.summary.ram.avg, 'number');
      assert.equal(typeof history.summary.ram.max, 'number');
      assert.equal(typeof history.summary.ram.min, 'number');
      assert.ok(history.summary.ram.max >= history.summary.ram.min);

      // Verify GPU & VRAM metrics
      assert.equal(typeof history.summary.gpu.current, 'number');
      assert.equal(typeof history.summary.gpuMem.current, 'number');
    }
  });
});
