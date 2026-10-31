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
  checkUptimeSentinel,
  restartOllamaService,
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

  it('triggers Ollama crash self-healing auto-restart via spawner', async () => {
    let spawnedCmd = null;
    let spawnedArgs = null;
    let unrefCalled = false;

    const mockSpawner = (cmd, args) => {
      spawnedCmd = cmd;
      spawnedArgs = args;
      return {
        pid: 9988,
        unref: () => {
          unrefCalled = true;
        }
      };
    };

    // 1. Direct restart function test
    const restartResult = restartOllamaService({ spawner: mockSpawner });
    assert.equal(restartResult.success, true);
    assert.equal(restartResult.pid, 9988);
    assert.equal(spawnedCmd, 'ollama');
    assert.deepEqual(spawnedArgs, ['serve']);
    assert.equal(unrefCalled, true);

    // 2. Transition test: was open -> now closed -> triggers auto-restart alert
    const state = await getAutomationState(tmpAutoPath);
    state.serviceStatus['Ollama Local LLM'] = { open: true, port: 11434 };
    state.settings.serviceSentinel.autoRestartOllama = true;
    state.lastOllamaRestartMs = 0;
    await saveAutomationState(state, tmpAutoPath);

    const alerts = await checkServiceHealth(
      [{ name: 'Ollama Local LLM', port: 59998, host: '127.0.0.1' }],
      tmpAutoPath,
      { spawner: mockSpawner }
    );

    const restartedAlert = alerts.find((a) => a.status === 'restarted');
    assert.ok(restartedAlert);
    assert.ok(restartedAlert.message.includes('ollama serve'));
    assert.ok(restartedAlert.speechText.includes('自我修復'));
  });

  it('detects uptime transitions for monitored web endpoints', async () => {
    const endpoints = [
      { name: 'Mock API 1', url: 'https://api.mock.test/v1', timeoutMs: 1000 },
      { name: 'Mock API 2', url: 'https://api.mock.test/v2', timeoutMs: 1000 }
    ];

    // First check: establish baseline (both UP)
    const mockFetcherUp = async () => ({
      ok: true,
      status: 200
    });

    const initAlerts = await checkUptimeSentinel(endpoints, tmpAutoPath, { fetcher: mockFetcherUp });
    assert.equal(initAlerts.length, 0);

    const state1 = await getAutomationState(tmpAutoPath);
    assert.equal(state1.uptimeStatus['https://api.mock.test/v1'].isUp, true);

    // Second check: API 1 goes DOWN (500 or timeout)
    const mockFetcherDown = async (url) => {
      if (url.includes('v1')) {
        throw new Error('Connection refused');
      }
      return { ok: true, status: 200 };
    };

    const downAlerts = await checkUptimeSentinel(endpoints, tmpAutoPath, { fetcher: mockFetcherDown });
    assert.equal(downAlerts.length, 1);
    assert.equal(downAlerts[0].status, 'down');
    assert.equal(downAlerts[0].name, 'Mock API 1');
    assert.ok(downAlerts[0].message.includes('異常'));

    // Third check: API 1 recovers back to UP
    const recoverAlerts = await checkUptimeSentinel(endpoints, tmpAutoPath, { fetcher: mockFetcherUp });
    assert.equal(recoverAlerts.length, 1);
    assert.equal(recoverAlerts[0].status, 'recovered');
    assert.equal(recoverAlerts[0].name, 'Mock API 1');
    assert.ok(recoverAlerts[0].message.includes('已恢復正常連線'));
  });

  it('triggers Friday 17:00 fuel price alert and 18:30 scheduled debrief', async () => {
    // 1. Friday 17:00 fuel alert
    const friday1700 = new Date('2026-10-30T17:00:00'); // 2026-10-30 is a Friday (getDay() === 5)
    assert.equal(friday1700.getDay(), 5);

    const mockFetchFuel = async () => ({
      prices: {
        gas98: 34.5,
        gas95: 31.0,
        gas92: 29.5,
        diesel: 27.2,
        effectiveDate: '2026/10/26'
      }
    });

    const eventsFuel = [];
    await runAutomationTick({
      filePath: tmpAutoPath,
      currentTime: friday1700,
      fetchPrices: mockFetchFuel,
      onEvent: (evt) => eventsFuel.push(evt)
    });

    const fuelAlert = eventsFuel.find((e) => e.kind === 'friday_fuel_alert');
    assert.ok(fuelAlert);
    assert.ok(fuelAlert.title.includes('週五油價'));
    assert.ok(fuelAlert.message.includes('95 無鉛汽油'));
    assert.ok(fuelAlert.speechText.includes('週五油價週末戰備提醒'));

    // 2. Daily 18:30 End-of-Day debrief
    const state = await getAutomationState(tmpAutoPath);
    state.settings.endOfDayDebrief.time = '18:30';
    state.lastFired.endOfDayDebriefDate = '';
    await saveAutomationState(state, tmpAutoPath);

    const debriefTime = new Date('2026-10-30T18:30:00');
    const eventsDebrief = [];
    await runAutomationTick({
      filePath: tmpAutoPath,
      currentTime: debriefTime,
      onEvent: (evt) => eventsDebrief.push(evt)
    });

    const debriefEvent = eventsDebrief.find((e) => e.kind === 'end_of_day_debrief');
    assert.ok(debriefEvent);
    assert.ok(debriefEvent.title.includes('END-OF-DAY TACTICAL DEBRIEF'));
  });

  it('triggers hourly chrono chime and 50-minute continuous posture rest alert', async () => {
    // 1. Hourly chime on the hour (:00)
    const topOfHour = new Date('2026-10-30T14:00:00');
    const eventsChime = [];

    await runAutomationTick({
      filePath: tmpAutoPath,
      currentTime: topOfHour,
      onEvent: (evt) => eventsChime.push(evt)
    });

    const chimeEvent = eventsChime.find((e) => e.kind === 'hourly_chime');
    assert.ok(chimeEvent);
    assert.ok(chimeEvent.title.includes('整點報時'));
    assert.ok(chimeEvent.speechText.includes('14 點整'));

    // 2. Focus posture & optics rest alert after 50 minutes
    const state = await getAutomationState(tmpAutoPath);
    state.settings.focusHealthSentinel = { enabled: true, intervalMinutes: 50 };
    // Simulate initial activity recorded 51 minutes ago
    state.lastFired.lastFocusAlertMs = topOfHour.getTime();
    await saveAutomationState(state, tmpAutoPath);

    const fiftyOneMinLater = new Date(topOfHour.getTime() + 51 * 60 * 1000); // 14:51:00
    const eventsFocus = [];

    await runAutomationTick({
      filePath: tmpAutoPath,
      currentTime: fiftyOneMinLater,
      onEvent: (evt) => eventsFocus.push(evt)
    });

    const focusAlert = eventsFocus.find((e) => e.kind === 'focus_health_alert');
    assert.ok(focusAlert);
    assert.ok(focusAlert.title.includes('護眼與姿態健康提醒'));
    assert.ok(focusAlert.speechText.includes('50 分鐘'));
  });
});
