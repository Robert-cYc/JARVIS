/**
 * Stark Industries Core Telemetry — Process Manager & Resource Hog Sentinel
 * Cross-platform process discovery, resource consumption aggregation, and safe termination guardrails.
 */

import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Critical system processes protected from termination
const PROTECTED_PROCESS_NAMES = new Set([
  'system',
  'system idle process',
  'registry',
  'smss',
  'smss.exe',
  'csrss',
  'csrss.exe',
  'wininit',
  'wininit.exe',
  'services',
  'services.exe',
  'lsass',
  'lsass.exe',
  'winlogon',
  'winlogon.exe',
  'fontdrvhost',
  'fontdrvhost.exe',
  'dwm',
  'dwm.exe',
  'explorer',
  'explorer.exe',
  'svchost',
  'svchost.exe',
  'init',
  'systemd',
  'launchd',
  'kernel_task',
  'sshd',
  'bash',
  'zsh'
]);

/**
 * Checks whether a given PID or process name is protected by Stark Sentinel guardrails.
 * @param {number|string} pid
 * @param {string} [name='']
 * @returns {{protected: boolean, reason?: string}}
 */
export function isProtectedProcess(pid, name = '') {
  const numericPid = typeof pid === 'number' ? pid : parseInt(pid, 10);

  // Guardrail 1: J.A.R.V.I.S. itself and direct parent
  if (numericPid === process.pid) {
    return { protected: true, reason: 'Protected: Cannot terminate J.A.R.V.I.S. server host instance' };
  }
  if (numericPid === process.ppid) {
    return { protected: true, reason: 'Protected: Cannot terminate J.A.R.V.I.S. parent shell process' };
  }
  if (numericPid <= 4 && !isNaN(numericPid)) {
    return { protected: true, reason: 'Protected: Root OS Kernel / System Idle process (PID <= 4)' };
  }

  // Guardrail 2: System-level critical processes by name
  const cleanName = (name || '').toLowerCase().trim().replace(/\.exe$/, '');
  if (PROTECTED_PROCESS_NAMES.has(cleanName)) {
    return { protected: true, reason: `Protected: '${cleanName}' is a critical OS daemon` };
  }

  return { protected: false };
}

/**
 * Discovers running processes on Windows platforms using PowerShell or tasklist fallback.
 * @returns {Promise<Array<{pid: number, name: string, memoryBytes: number, cpuSec: number}>>}
 */
async function fetchWindowsProcesses() {
  try {
    const psScript = 'Get-Process | Select-Object Id, ProcessName, WorkingSet, CPU | ConvertTo-Json -Compress';
    const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', psScript], {
      timeout: 5000,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true
    });

    const parsed = JSON.parse(stdout);
    const list = Array.isArray(parsed) ? parsed : [parsed];

    return list
      .filter((p) => p && typeof p.Id === 'number')
      .map((p) => ({
        pid: p.Id,
        name: p.ProcessName || 'unknown',
        memoryBytes: typeof p.WorkingSet === 'number' ? p.WorkingSet : 0,
        cpuSec: typeof p.CPU === 'number' ? Math.round(p.CPU * 10) / 10 : 0
      }));
  } catch (psErr) {
    // Fallback to tasklist /FO CSV /NH
    try {
      const { stdout } = await execFileAsync('tasklist.exe', ['/FO', 'CSV', '/NH'], {
        timeout: 4000,
        windowsHide: true
      });

      const lines = stdout.trim().split(/\r?\n/);
      const results = [];

      for (const line of lines) {
        if (!line.trim()) continue;
        const cols = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
        if (cols.length >= 5) {
          const name = cols[0];
          const pid = parseInt(cols[1], 10);
          const memStr = cols[4].replace(/[^\d]/g, '');
          const memoryBytes = parseInt(memStr, 10) * 1024 || 0;

          if (!isNaN(pid)) {
            results.push({ pid, name, memoryBytes, cpuSec: 0 });
          }
        }
      }
      return results;
    } catch {
      return [];
    }
  }
}

/**
 * Discovers running processes on Unix / POSIX platforms (macOS / Linux).
 * @returns {Promise<Array<{pid: number, name: string, memoryBytes: number, cpuSec: number}>>}
 */
async function fetchPosixProcesses() {
  try {
    // pid, rss in KB, %cpu, comm
    const { stdout } = await execFileAsync('ps', ['-eo', 'pid,rss,%cpu,comm'], {
      timeout: 4000
    });

    const lines = stdout.trim().split('\n').slice(1);
    const results = [];

    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.+)$/);
      if (match) {
        const pid = parseInt(match[1], 10);
        const rssKb = parseInt(match[2], 10);
        const cpu = parseFloat(match[3]) || 0;
        const name = match[4].split('/').pop();

        results.push({
          pid,
          name,
          memoryBytes: rssKb * 1024,
          cpuSec: cpu
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Retrieves comprehensive process telemetry, sorted by top resource consumers and application groups.
 * @param {object} [options]
 * @param {number} [options.limit=10]
 * @returns {Promise<{processes: Array<object>, topMemory: Array<object>, topCpu: Array<object>, appGroups: Array<object>, systemMemory: object, totalProcessCount: number}>}
 */
export async function fetchProcessSnapshot({ limit = 10 } = {}) {
  const isWin = process.platform === 'win32';
  const rawList = isWin ? await fetchWindowsProcesses() : await fetchPosixProcesses();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const usedPercent = Math.round((usedMem / totalMem) * 1000) / 10;

  // Process mapping and stats
  const processes = rawList.map((p) => {
    const memoryMb = Math.round((p.memoryBytes / (1024 * 1024)) * 10) / 10;
    const memSharePercent = totalMem > 0 ? Math.round((p.memoryBytes / totalMem) * 1000) / 10 : 0;
    return {
      pid: p.pid,
      name: p.name,
      memoryBytes: p.memoryBytes,
      memoryMb,
      memSharePercent,
      cpuSec: p.cpuSec
    };
  });

  // Top individual processes by Memory
  const topMemory = [...processes]
    .sort((a, b) => b.memoryBytes - a.memoryBytes)
    .slice(0, limit);

  // Top individual processes by CPU
  const topCpu = [...processes]
    .filter((p) => p.cpuSec > 0)
    .sort((a, b) => b.cpuSec - a.cpuSec)
    .slice(0, limit);

  // Group by application name
  const groupMap = new Map();
  for (const p of processes) {
    const groupName = p.name.toLowerCase().replace(/\.exe$/, '');
    if (!groupMap.has(groupName)) {
      groupMap.set(groupName, {
        name: p.name,
        groupKey: groupName,
        count: 0,
        totalMemoryBytes: 0,
        totalCpuSec: 0,
        pids: []
      });
    }
    const group = groupMap.get(groupName);
    group.count++;
    group.totalMemoryBytes += p.memoryBytes;
    group.totalCpuSec += p.cpuSec;
    group.pids.push(p.pid);
  }

  const appGroups = Array.from(groupMap.values())
    .map((g) => ({
      name: g.name,
      count: g.count,
      totalMemoryMb: Math.round((g.totalMemoryBytes / (1024 * 1024)) * 10) / 10,
      totalCpuSec: Math.round(g.totalCpuSec * 10) / 10,
      pids: g.pids
    }))
    .sort((a, b) => b.totalMemoryMb - a.totalMemoryMb)
    .slice(0, limit);

  return {
    processes,
    topMemory,
    topCpu,
    appGroups,
    systemMemory: {
      totalMb: Math.round((totalMem / (1024 * 1024)) * 10) / 10,
      usedMb: Math.round((usedMem / (1024 * 1024)) * 10) / 10,
      freeMb: Math.round((freeMem / (1024 * 1024)) * 10) / 10,
      usedPercent
    },
    totalProcessCount: processes.length
  };
}

/**
 * Formats an executive Stark Industries Process & Resource Hog report.
 * @param {object} snapshot
 * @returns {{summaryText: string, items: Array<object>}}
 */
export function formatProcessBriefing(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.topMemory)) {
    return {
      summaryText: '⚠️ 無法取得本機行程遙測數據。',
      items: []
    };
  }

  const { topMemory, topCpu, appGroups, systemMemory, totalProcessCount } = snapshot;

  let text = `### ⚡ STARK PROCESS SENTINEL // 本機行程與資源暴走雷達\n\n`;

  // RAM telemetry summary
  text += `> 💾 **系統記憶體總負載**: \`${(systemMemory.usedMb / 1024).toFixed(2)} GB\` / \`${(systemMemory.totalMb / 1024).toFixed(2)} GB\` (**${systemMemory.usedPercent}%**) | 運行中行程總數: \`${totalProcessCount}\` 項\n\n`;

  // Table 1: Top Application Groups (Consolidated footprint)
  text += `#### 🏢 應用程式群組記憶體佔用排行 (Top App Footprint)\n\n`;
  text += `| 應用程式 (Application) | 實例數 (Instances) | 總記憶體 (Total RAM) | 總累計 CPU (Sec) |\n`;
  text += `| :--- | :---: | :---: | :---: |\n`;

  for (const g of appGroups.slice(0, 6)) {
    text += `| **${g.name}** | \`${g.count}\` | \`${g.totalMemoryMb.toLocaleString()} MB\` | \`${g.totalCpuSec}\`s |\n`;
  }

  // Table 2: Top Individual Processes by Memory
  text += `\n#### 🎯 獨立行程記憶體排行 (Top Memory Hogs)\n\n`;
  text += `| PID | 行程名稱 (Process Name) | 佔用記憶體 (Working Set) | 系統佔比 (Share) |\n`;
  text += `| :---: | :--- | :---: | :---: |\n`;

  for (const p of topMemory.slice(0, 5)) {
    text += `| \`${p.pid}\` | **${p.name}** | \`${p.memoryMb.toLocaleString()} MB\` | \`${p.memSharePercent}%\` |\n`;
  }

  // Table 3: Top CPU Hogs (if available)
  if (topCpu && topCpu.length > 0 && topCpu[0].cpuSec > 0) {
    text += `\n#### 🔥 累計 CPU 時間排行 (Top CPU Time)\n\n`;
    text += `| PID | 行程名稱 | 累計運算時間 (CPU Time) |\n`;
    text += `| :---: | :--- | :---: |\n`;
    for (const p of topCpu.slice(0, 4)) {
      text += `| \`${p.pid}\` | **${p.name}** | \`${p.cpuSec}s\` |\n`;
    }
  }

  text += `\n*終止行程指令範例: 「結束 PID 12345」 或 「關閉孤立的 node 行程」 (具備 Stark Sentinel 核心安全保護機制)*\n`;

  const items = topMemory.slice(0, 5).map((p) => ({
    title: `PID ${p.pid}: ${p.name} (${p.memoryMb} MB, ${p.memSharePercent}%)`,
    link: '#',
    source: `Memory Hog | ${p.cpuSec}s CPU`
  }));

  return { summaryText: text, items };
}

/**
 * Terminates a target process by PID or Name, protected by strict security guardrails.
 * @param {object} params
 * @param {number|string} [params.pid]
 * @param {string} [params.name]
 * @param {boolean} [params.force=false]
 * @returns {Promise<{success: boolean, target: string|number, killedCount: number, message: string, error?: string}>}
 */
export async function terminateProcessTarget({ pid, name, force = false } = {}) {
  // Validate target input
  if (!pid && !name) {
    return { success: false, target: 'none', killedCount: 0, message: '請指定欲終止之 PID 數字或行程名稱 (Name)' };
  }

  // Target by numeric PID
  if (pid !== undefined && pid !== null && pid !== '') {
    const numPid = typeof pid === 'number' ? pid : parseInt(pid, 10);
    if (isNaN(numPid) || numPid <= 0) {
      return { success: false, target: pid, killedCount: 0, message: `無效的 PID 數值: [${pid}]` };
    }

    const guard = isProtectedProcess(numPid);
    if (guard.protected) {
      return { success: false, target: numPid, killedCount: 0, message: `🛑 操作拒絕: ${guard.reason}` };
    }

    try {
      if (process.platform === 'win32') {
        const flag = force ? '/F' : '/T';
        await execFileAsync('taskkill.exe', ['/PID', numPid.toString(), '/F'], { windowsHide: true });
      } else {
        process.kill(numPid, force ? 'SIGKILL' : 'SIGTERM');
      }
      return {
        success: true,
        target: numPid,
        killedCount: 1,
        message: `✅ 已成功終止行程 [PID: ${numPid}]`
      };
    } catch (err) {
      return {
        success: false,
        target: numPid,
        killedCount: 0,
        message: `終止行程 [PID: ${numPid}] 失敗: ${err.message || '行程可能不存在或權限不足'}`
      };
    }
  }

  // Target by process name
  if (name && typeof name === 'string') {
    const cleanName = name.trim();
    const guard = isProtectedProcess(null, cleanName);
    if (guard.protected) {
      return { success: false, target: cleanName, killedCount: 0, message: `🛑 操作拒絕: ${guard.reason}` };
    }

    try {
      if (process.platform === 'win32') {
        const imName = cleanName.toLowerCase().endsWith('.exe') ? cleanName : `${cleanName}.exe`;
        const { stdout } = await execFileAsync('taskkill.exe', ['/IM', imName, '/F'], { windowsHide: true });
        return {
          success: true,
          target: cleanName,
          killedCount: 1,
          message: `✅ 已終止應用程式 [${imName}] 行程: ${stdout.trim() || '成功'}`
        };
      } else {
        await execFileAsync('pkill', [force ? '-9' : '-15', cleanName]);
        return {
          success: true,
          target: cleanName,
          killedCount: 1,
          message: `✅ 已終止應用程式 [${cleanName}] 行程`
        };
      }
    } catch (err) {
      return {
        success: false,
        target: cleanName,
        killedCount: 0,
        message: `終止行程 [${cleanName}] 失敗: 未找到符合名稱之行程或權限不足 (${err.message})`
      };
    }
  }

  return { success: false, target: 'unknown', killedCount: 0, message: '未指定終止目標' };
}

/**
 * Detects whether user message refers to process inspection or process termination.
 * @param {string} text
 * @returns {{isProcessCommand: boolean, action: 'inspect'|'kill', pid?: number, targetName?: string, query: string}}
 */
export function detectProcessIntent(text) {
  if (!text || typeof text !== 'string') {
    return { isProcessCommand: false, action: 'inspect', query: '' };
  }

  const trimmed = text.trim();

  // 1. Check for termination / kill intent
  const killPattern =
    /(?:結束|關閉|殺掉|強制結束|停止|終止|kill)\s*(?:行程|處理程序|程式|進程|process)?\s*(?:pid\s*:?\s*)?(\d+|[a-zA-Z0-9_\-.]+)?/i;

  if (/(?:結束|關閉|殺掉|強制結束|kill)\s*(?:行程|處理程序|程式|進程|pid|node|python|chrome)/i.test(trimmed)) {
    const match = trimmed.match(killPattern);
    const target = match && match[1] ? match[1].trim() : null;

    if (target) {
      const isNum = /^\d+$/.test(target);
      return {
        isProcessCommand: true,
        action: 'kill',
        pid: isNum ? parseInt(target, 10) : undefined,
        targetName: !isNum ? target : undefined,
        query: trimmed
      };
    }
  }

  // 2. Check for process inspection intent
  if (
    /(?:行程|處理程序|進程|背景程式|資源佔用|吃記憶體|佔用.*記憶體|記憶體.*排行|誰.*(?:佔用|吃).*cpu|暴走行程|工作管理員|task\s*manager|top\s*(?:processes|hogs|ram)|resource\s*hogs?)/i.test(
      trimmed
    )
  ) {
    return {
      isProcessCommand: true,
      action: 'inspect',
      query: trimmed
    };
  }

  return { isProcessCommand: false, action: 'inspect', query: trimmed };
}
