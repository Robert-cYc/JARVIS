import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_VAULT_PATH = path.resolve(__dirname, '../../../data/jarvis_vault.json');

const DEFAULT_STATE = {
  memories: [],
  tasks: []
};

/**
 * Ensures the vault JSON file exists and returns its parsed state.
 * @param {string} [vaultPath]
 * @returns {Promise<{memories: Array<object>, tasks: Array<object>}>}
 */
export async function getVaultState(vaultPath = DEFAULT_VAULT_PATH) {
  try {
    const raw = await fs.readFile(vaultPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : []
    };
  } catch {
    return { memories: [...DEFAULT_STATE.memories], tasks: [...DEFAULT_STATE.tasks] };
  }
}

/**
 * Saves the vault state to disk atomically.
 * @param {{memories: Array<object>, tasks: Array<object>}} state
 * @param {string} [vaultPath]
 */
export async function saveVaultState(state, vaultPath = DEFAULT_VAULT_PATH) {
  const dir = path.dirname(vaultPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(vaultPath, JSON.stringify(state, null, 2), 'utf-8');
}

/**
 * Adds a persistent memory note to the Stark Vault.
 * @param {string} content
 * @param {string} [category='general']
 * @param {string} [vaultPath]
 */
export async function addMemory(content, category = 'general', vaultPath = DEFAULT_VAULT_PATH) {
  const clean = (content || '').trim();
  if (!clean) throw new Error('Memory content cannot be empty');

  const state = await getVaultState(vaultPath);
  const item = {
    id: crypto.randomUUID(),
    content: clean,
    category,
    createdAt: new Date().toISOString()
  };
  state.memories.unshift(item);
  state.memories = state.memories.slice(0, 100);
  await saveVaultState(state, vaultPath);
  return item;
}

/**
 * Removes a memory item by ID.
 * @param {string} id
 * @param {string} [vaultPath]
 */
export async function deleteMemory(id, vaultPath = DEFAULT_VAULT_PATH) {
  const state = await getVaultState(vaultPath);
  state.memories = state.memories.filter((m) => m.id !== id);
  await saveVaultState(state, vaultPath);
  return state;
}

/**
 * Adds a tactical to-do task.
 * @param {string} title
 * @param {string} [vaultPath]
 */
export async function addTask(title, vaultPath = DEFAULT_VAULT_PATH) {
  const clean = (title || '').trim();
  if (!clean) throw new Error('Task title cannot be empty');

  const state = await getVaultState(vaultPath);
  const task = {
    id: crypto.randomUUID(),
    title: clean,
    completed: false,
    createdAt: new Date().toISOString()
  };
  state.tasks.unshift(task);
  await saveVaultState(state, vaultPath);
  return task;
}

/**
 * Toggles completion state of a task by ID.
 * @param {string} id
 * @param {string} [vaultPath]
 */
export async function toggleTask(id, vaultPath = DEFAULT_VAULT_PATH) {
  const state = await getVaultState(vaultPath);
  const target = state.tasks.find((t) => t.id === id);
  if (target) {
    target.completed = !target.completed;
    await saveVaultState(state, vaultPath);
  }
  return state;
}

/**
 * Deletes a task by ID.
 * @param {string} id
 * @param {string} [vaultPath]
 */
export async function deleteTask(id, vaultPath = DEFAULT_VAULT_PATH) {
  const state = await getVaultState(vaultPath);
  state.tasks = state.tasks.filter((t) => t.id !== id);
  await saveVaultState(state, vaultPath);
  return state;
}

/**
 * Detects if a user message contains an explicit command to remember a fact or add a to-do task.
 * @param {string} userMessage
 * @returns {{action: 'none' | 'add_memory' | 'add_task', payload: string}}
 */
export function detectVaultCommand(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { action: 'none', payload: '' };
  }
  const text = userMessage.trim();

  // Check for "remember ..." / "記住..."
  const memMatch = text.match(
    /^(?:JARVIS|賈維斯)?[，,\s]*(?:請)?(?:幫我)?(?:記住|記下|記錄下來|remember\s+that\s+|remember\s+|note\s+that\s+)[：:\s]*(.+)$/i
  );
  if (memMatch && memMatch[1].trim().length > 1) {
    return { action: 'add_memory', payload: memMatch[1].trim() };
  }

  // Check for "add todo/task ..." / "新增待辦..."
  const taskMatch = text.match(
    /^(?:JARVIS|賈維斯)?[，,\s]*(?:請)?(?:幫我)?(?:新增待辦事項|新增待辦|加入待辦|待辦事項|add\s+todo|add\s+task|new\s+task)[：:\s]*(.+)$/i
  );
  if (taskMatch && taskMatch[1].trim().length > 1) {
    return { action: 'add_task', payload: taskMatch[1].trim() };
  }

  return { action: 'none', payload: '' };
}

/**
 * Formats stored memories and pending tasks for injection into the JARVIS system prompt.
 * @param {{memories: Array<object>, tasks: Array<object>}} state
 * @returns {string}
 */
export function formatVaultContextForPrompt(state) {
  const lines = [];
  if (Array.isArray(state.memories) && state.memories.length > 0) {
    lines.push('[STARK LONG-TERM MEMORY VAULT — FACTS ABOUT THE USER]:');
    state.memories.slice(0, 15).forEach((m, idx) => {
      lines.push(`- Memory #${idx + 1}: ${m.content}`);
    });
  }

  const pendingTasks = (state.tasks || []).filter((t) => !t.completed);
  if (pendingTasks.length > 0) {
    lines.push('[ACTIVE TACTICAL TO-DO LIST FOR THE USER]:');
    pendingTasks.slice(0, 15).forEach((t, idx) => {
      lines.push(`- Task #${idx + 1}: [PENDING] ${t.title}`);
    });
  }

  return lines.join('\n');
}
