import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  getAutomationState,
  saveAutomationState,
  updateAutomationSettings,
  generateScheduledMorningBriefing,
  generateEndOfDayDebrief,
  checkServiceHealth,
  checkHardwareHealth,
  runAutomationTick
} from '../src/server/services/automationService.js';

const tmpAutoPath = path.join(os.tmpdir(), `jarvis_test_auto_${Date.now()}.json`);
const tmpReportsDir = path.join(os.tmpdir(), `jarvis_test_reports_${Date.now()}`);

describe('J.A.R.V.I.S. Automation Core (Briefing, Debrief, Service Sentinel)', () => {
  after(async () => {
    await fs.rm(tmpAutoPath, { force: true }).catch(() => {});
    await fs.rm(tmpReportsDir, { recursive: true, force: true }).catch(() => {});
  });

  it('manages automation settings and state persistence', async () => {
    const state = await getAutomationState(tmpAutoPath);
    assert.ok(state.settings);
    assert.equal(state.settings.morningBriefing.enabled, true);

    const updated = await updateAutomationSettings(
      {
        morningBriefing: { time: '09:00' },
        serviceSentinel: { intervalSec: 15 }
      },
      tmpAutoPath
    );

    assert.equal(updated.settings.morningBriefing.time, '09:00');
    assert.equal(updated.settings.serviceSentinel.intervalSec, 15);
  });

  it('generates an autonomous morning briefing payload', async () => {
    const briefing = await generateScheduledMorningBriefing({ city: '台北' });
    assert.ok(briefing.title);
    assert.ok(briefing.speechText);
    assert.ok(briefing.markdownReport.includes('MORNING BRIEFING'));
  });

  it('generates and saves an End-of-Day Tactical Debrief to a markdown file', async () => {
    const debrief = await generateEndOfDayDebrief({
      saveToFile: true,
      reportsDir: tmpReportsDir
    });

    assert.ok(debrief.title);
    assert.ok(debrief.filePath);
    assert.ok(debrief.markdownReport.includes('END-OF-DAY TACTICAL DEBRIEF'));

    const fileContent = await fs.readFile(debrief.filePath, 'utf-8');
    assert.ok(fileContent.includes('Completed Tasks'));
  });

  it('detects service health status and offline/recovered transitions', async () => {
    // 1. Initial check - all services checked
    const mockServices = [
      { name: 'Mock Open Service', port: 63219, host: '127.0.0.1' }, // typically open or closed
      { name: 'Mock Nonexistent Service', port: 59999, host: '127.0.0.1' }
    ];

    const alerts1 = await checkServiceHealth(mockServices, tmpAutoPath);
    assert.ok(Array.isArray(alerts1));

    const state1 = await getAutomationState(tmpAutoPath);
    assert.ok(state1.serviceStatus['Mock Nonexistent Service']);
    assert.equal(state1.serviceStatus['Mock Nonexistent Service'].open, false);

    // 2. Simulate was previously open, now offline
    state1.serviceStatus['Simulated Service'] = { open: true, port: 44444 };
    await saveAutomationState(state1, tmpAutoPath);

    const alerts2 = await checkServiceHealth(
      [{ name: 'Simulated Service', port: 44444, host: '127.0.0.1' }],
      tmpAutoPath
    );

    assert.equal(alerts2.length, 1);
    assert.equal(alerts2[0].status, 'offline');
    assert.ok(alerts2[0].message.includes('44444'));
  });

  it('triggers scheduled morning briefing on matching clock tick', async () => {
    const events = [];
    const fixedTime = new Date('2026-10-30T09:00:00');

    await runAutomationTick({
      filePath: tmpAutoPath,
      currentTime: fixedTime,
      onEvent: (evt) => events.push(evt)
    });

    assert.ok(events.length >= 1);
    assert.equal(events[0].kind, 'morning_briefing');

    // Second tick on same date shouldn't fire again
    const events2 = [];
    await runAutomationTick({
      filePath: tmpAutoPath,
      currentTime: fixedTime,
      onEvent: (evt) => events2.push(evt)
    });

    assert.equal(events2.length, 0);
  });

  it('evaluates hardware and disk sentinel health alerts with cooldown', async () => {
    // 1. Nominal telemetry should produce 0 alerts
    const nominalTelemetry = {
      cpuUsagePercent: 35,
      memoryUsagePercent: 50,
      memoryFreeGb: 16.0,
      disks: [
        { drive: 'C:', freeGb: 80.0, usagePercent: 60 }
      ]
    };

    const alertsNominal = await checkHardwareHealth({
      filePath: tmpAutoPath,
      telemetry: nominalTelemetry
    });
    assert.equal(alertsNominal.length, 0);

    // 2. High CPU, High RAM, Low Disk telemetry should produce 3 alerts
    const criticalTelemetry = {
      cpuUsagePercent: 96,
      memoryUsagePercent: 93,
      memoryFreeGb: 1.2,
      disks: [
        { drive: 'C:', freeGb: 4.5, usagePercent: 95 }
      ]
    };

    const alertsCritical = await checkHardwareHealth({
      filePath: tmpAutoPath,
      telemetry: criticalTelemetry
    });

    assert.equal(alertsCritical.length, 3);
    const metrics = alertsCritical.map((a) => a.metric);
    assert.ok(metrics.includes('cpu'));
    assert.ok(metrics.includes('ram'));
    assert.ok(metrics.includes('disk'));
    assert.ok(alertsCritical[0].speechText.includes('Sir'));

    // 3. Immediately checking again should be silenced by cooldown
    const alertsDuringCooldown = await checkHardwareHealth({
      filePath: tmpAutoPath,
      telemetry: criticalTelemetry
    });
    assert.equal(alertsDuringCooldown.length, 0);

    // 4. Updating settings for hardware sentinel persists
    const updated = await updateAutomationSettings(
      {
        hardwareSentinel: {
          cpuThresholdPercent: 85,
          diskMinFreeGb: 15
        }
      },
      tmpAutoPath
    );
    assert.equal(updated.settings.hardwareSentinel.cpuThresholdPercent, 85);
    assert.equal(updated.settings.hardwareSentinel.diskMinFreeGb, 15);
  });
});
