import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  getCpuUsagePercent,
  getSystemTelemetry
} from '../src/server/services/telemetryService.js';

describe('J.A.R.V.I.S. Telemetry Service', () => {
  it('returns CPU usage percentage within valid 0-100 bounds', () => {
    const usage = getCpuUsagePercent();
    assert.equal(typeof usage, 'number');
    assert.ok(usage >= 0 && usage <= 100);
  });

  it('returns complete Mark LXXXV system telemetry metrics', () => {
    const telemetry = getSystemTelemetry();
    assert.ok('hostname' in telemetry);
    assert.ok('cpuUsagePercent' in telemetry);
    assert.ok('memoryTotalGb' in telemetry);
    assert.ok('memoryUsagePercent' in telemetry);
    assert.ok('arcReactorOutputPercent' in telemetry);
    assert.equal(telemetry.suitIntegrityPercent, 100);
  });
});
