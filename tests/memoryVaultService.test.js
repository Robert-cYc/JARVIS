import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  getVaultState,
  addMemory,
  deleteMemory,
  addTask,
  toggleTask,
  deleteTask,
  detectVaultCommand,
  formatVaultContextForPrompt
} from '../src/server/services/memoryVaultService.js';

const tmpVaultPath = path.join(os.tmpdir(), `jarvis_test_vault_${Date.now()}.json`);

describe('J.A.R.V.I.S. Memory Vault & To-Do Service', () => {
  after(async () => {
    await fs.rm(tmpVaultPath, { force: true }).catch(() => {});
  });

  it('detects natural language memory and task commands', () => {
    const memCmd = detectVaultCommand('JARVIS，請記住我的伺服器連接埠是 8080');
    assert.equal(memCmd.action, 'add_memory');
    assert.equal(memCmd.payload, '我的伺服器連接埠是 8080');

    const taskCmd = detectVaultCommand('新增待辦事項：完成量子核心單元測試');
    assert.equal(taskCmd.action, 'add_task');
    assert.equal(taskCmd.payload, '完成量子核心單元測試');

    const noneCmd = detectVaultCommand('今天天氣如何？');
    assert.equal(noneCmd.action, 'none');
  });

  it('persists, toggles, and deletes memories and tasks in the vault', async () => {
    const mem = await addMemory('User prefers TypeScript', 'pref', tmpVaultPath);
    assert.equal(mem.content, 'User prefers TypeScript');

    const task = await addTask('Deploy Mark 85 HUD', tmpVaultPath);
    assert.equal(task.title, 'Deploy Mark 85 HUD');
    assert.equal(task.completed, false);

    let state = await getVaultState(tmpVaultPath);
    assert.equal(state.memories.length, 1);
    assert.equal(state.tasks.length, 1);

    const promptBlock = formatVaultContextForPrompt(state);
    assert.ok(promptBlock.includes('User prefers TypeScript'));
    assert.ok(promptBlock.includes('Deploy Mark 85 HUD'));

    state = await toggleTask(task.id, tmpVaultPath);
    assert.equal(state.tasks[0].completed, true);

    state = await deleteMemory(mem.id, tmpVaultPath);
    assert.equal(state.memories.length, 0);

    state = await deleteTask(task.id, tmpVaultPath);
    assert.equal(state.tasks.length, 0);
  });
});
