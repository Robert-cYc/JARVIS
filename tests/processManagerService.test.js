import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  isProtectedProcess,
  detectProcessIntent,
  formatProcessBriefing,
  terminateProcessTarget,
  fetchProcessSnapshot
} from '../src/server/services/processManagerService.js';
import {
  detectWebSkillIntent,
  executeWebSkillForMessage
} from '../src/server/services/webSkillsService.js';

describe('J.A.R.V.I.S. Process Manager & Resource Hog Sentinel', () => {
  describe('1. Security Guardrails (isProtectedProcess)', () => {
    it('protects root OS system PIDs and kernel daemons', () => {
      assert.equal(isProtectedProcess(0).protected, true);
      assert.equal(isProtectedProcess(4).protected, true);
      assert.equal(isProtectedProcess(1).protected, true);
    });

    it('strictly protects J.A.R.V.I.S. host process and parent process', () => {
      assert.equal(isProtectedProcess(process.pid).protected, true);
      assert.ok(isProtectedProcess(process.pid).reason.includes('host instance'));
      if (process.ppid) {
        assert.equal(isProtectedProcess(process.ppid).protected, true);
      }
    });

    it('protects critical OS background daemon names', () => {
      assert.equal(isProtectedProcess(null, 'explorer.exe').protected, true);
      assert.equal(isProtectedProcess(null, 'csrss').protected, true);
      assert.equal(isProtectedProcess(null, 'svchost.exe').protected, true);
      assert.equal(isProtectedProcess(null, 'dwm').protected, true);
      assert.equal(isProtectedProcess(null, 'systemd').protected, true);
    });

    it('allows non-protected user processes to be managed', () => {
      assert.equal(isProtectedProcess(98765, 'notepad.exe').protected, false);
      assert.equal(isProtectedProcess(12345, 'my-worker-node').protected, false);
    });
  });

  describe('2. Intent Detection (detectProcessIntent)', () => {
    it('detects natural language process inspection intents', () => {
      const q1 = detectProcessIntent('JARVIS，現在有什麼程式佔用最多記憶體？');
      assert.equal(q1.isProcessCommand, true);
      assert.equal(q1.action, 'inspect');

      const q2 = detectProcessIntent('查看本機行程與資源佔用');
      assert.equal(q2.isProcessCommand, true);
      assert.equal(q2.action, 'inspect');

      const q3 = detectProcessIntent('誰佔用了 CPU？');
      assert.equal(q3.isProcessCommand, true);
      assert.equal(q3.action, 'inspect');
    });

    it('detects process termination commands with PID or Name', () => {
      const k1 = detectProcessIntent('結束 PID 12345');
      assert.equal(k1.isProcessCommand, true);
      assert.equal(k1.action, 'kill');
      assert.equal(k1.pid, 12345);

      const k2 = detectProcessIntent('kill node');
      assert.equal(k2.isProcessCommand, true);
      assert.equal(k2.action, 'kill');
      assert.equal(k2.targetName, 'node');

      const k3 = detectProcessIntent('強制結束行程 python.exe');
      assert.equal(k3.isProcessCommand, true);
      assert.equal(k3.action, 'kill');
      assert.equal(k3.targetName, 'python.exe');
    });

    it('ignores unrelated queries', () => {
      const res = detectProcessIntent('今天台北天氣如何？');
      assert.equal(res.isProcessCommand, false);
    });
  });

  describe('3. Process Formatting & Telemetry (formatProcessBriefing)', () => {
    const mockSnapshot = {
      systemMemory: {
        totalMb: 32768,
        usedMb: 16384,
        freeMb: 16384,
        usedPercent: 50.0
      },
      totalProcessCount: 150,
      appGroups: [
        {
          name: 'chrome',
          count: 15,
          totalMemoryMb: 2048,
          totalCpuSec: 120.5,
          pids: [100, 101, 102]
        },
        {
          name: 'node',
          count: 3,
          totalMemoryMb: 512,
          totalCpuSec: 45.2,
          pids: [200, 201]
        }
      ],
      topMemory: [
        {
          pid: 100,
          name: 'chrome',
          memoryMb: 800,
          memSharePercent: 2.4,
          cpuSec: 60.1
        },
        {
          pid: 200,
          name: 'node',
          memoryMb: 400,
          memSharePercent: 1.2,
          cpuSec: 30.0
        }
      ],
      topCpu: [
        {
          pid: 100,
          name: 'chrome',
          memoryMb: 800,
          memSharePercent: 2.4,
          cpuSec: 60.1
        }
      ]
    };

    it('formats a structured markdown report for J.A.R.V.I.S. HUD', () => {
      const briefing = formatProcessBriefing(mockSnapshot);
      assert.ok(briefing.summaryText.includes('STARK PROCESS SENTINEL'));
      assert.ok(briefing.summaryText.includes('16.00 GB'));
      assert.ok(briefing.summaryText.includes('chrome'));
      assert.ok(briefing.summaryText.includes('PID'));
      assert.ok(briefing.items.length >= 2);
    });
  });

  describe('4. Safe Termination Logic (terminateProcessTarget)', () => {
    it('rejects empty or invalid termination targets', async () => {
      const res1 = await terminateProcessTarget({});
      assert.equal(res1.success, false);

      const res2 = await terminateProcessTarget({ pid: -5 });
      assert.equal(res2.success, false);
    });

    it('strictly blocks terminating protected system PIDs and names', async () => {
      const resPid = await terminateProcessTarget({ pid: 4 });
      assert.equal(resPid.success, false);
      assert.ok(resPid.message.includes('操作拒絕'));

      const resName = await terminateProcessTarget({ name: 'explorer.exe' });
      assert.equal(resName.success, false);
      assert.ok(resName.message.includes('操作拒絕'));

      const resSelf = await terminateProcessTarget({ pid: process.pid });
      assert.equal(resSelf.success, false);
      assert.ok(resSelf.message.includes('操作拒絕'));
    });
  });

  describe('5. Real-time Snapshot & Web Skills Integration', () => {
    it('fetches real live processes from the operating system', async () => {
      const snapshot = await fetchProcessSnapshot({ limit: 5 });
      assert.ok(snapshot.totalProcessCount > 0);
      assert.ok(Array.isArray(snapshot.topMemory));
      assert.ok(snapshot.topMemory.length > 0);
      assert.ok(snapshot.systemMemory.totalMb > 0);
    });

    it('routes process inspection queries through web skills router', async () => {
      const detected = detectWebSkillIntent('JARVIS，查看目前本機行程與資源佔用');
      assert.equal(detected.intent, 'process_management');
      assert.equal(detected.processAction, 'inspect');

      const executed = await executeWebSkillForMessage('JARVIS，查看目前本機行程與資源佔用');
      assert.equal(executed.executed, true);
      assert.equal(executed.skill, 'process_management');
      assert.ok(executed.contextBlock.includes('STARK PROCESS SENTINEL'));
    });
  });
});
