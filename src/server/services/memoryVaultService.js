import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_VAULT_PATH = path.resolve(__dirname, '../../../data/jarvis_vault.json');

const DEFAULT_STATE = {
  memories: [],
  tasks: [],
  watchlist: []
};

/**
 * Normalizes a stock/ETF/crypto ticker symbol (auto-appends .TW for 4-6 digit Taiwan stock codes).
 * @param {string} rawSymbol
 * @returns {string}
 */
export function normalizeWatchlistSymbol(rawSymbol) {
  const clean = (rawSymbol || '').trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) return '';
  if (/^\d{4,6}[A-Z]?$/.test(clean)) {
    return `${clean}.TW`;
  }
  return clean;
}

/**
 * Ensures the vault JSON file exists and returns its parsed state.
 * @param {string} [vaultPath]
 * @returns {Promise<{memories: Array<object>, tasks: Array<object>, watchlist: Array<string>}>}
 */
export async function getVaultState(vaultPath = DEFAULT_VAULT_PATH) {
  try {
    const raw = await fs.readFile(vaultPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return {
      memories: Array.isArray(parsed.memories) ? parsed.memories : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      watchlist: Array.isArray(parsed.watchlist) ? parsed.watchlist : []
    };
  } catch {
    return {
      memories: [...DEFAULT_STATE.memories],
      tasks: [...DEFAULT_STATE.tasks],
      watchlist: [...DEFAULT_STATE.watchlist]
    };
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
 * Adds one or more stock/ETF/crypto symbols to the custom portfolio watchlist.
 * @param {string} rawInput
 * @param {string} [vaultPath]
 * @returns {Promise<{added: string[], watchlist: string[]}>}
 */
export async function addWatchlistSymbol(rawInput, vaultPath = DEFAULT_VAULT_PATH) {
  const tokens = String(rawInput || '')
    .split(/[,，、\s]+/)
    .map((t) => normalizeWatchlistSymbol(t))
    .filter((t) => /^[A-Z0-9.^=-]{1,14}$/.test(t));

  if (tokens.length === 0) {
    throw new Error('Valid ticker symbol is required');
  }

  const state = await getVaultState(vaultPath);
  const added = [];
  for (const sym of tokens) {
    if (!state.watchlist.includes(sym)) {
      state.watchlist.push(sym);
      added.push(sym);
    }
  }
  state.watchlist = state.watchlist.slice(0, 20);
  await saveVaultState(state, vaultPath);
  return { symbol: tokens[0], added, watchlist: state.watchlist };
}

/**
 * Removes a ticker symbol from the custom portfolio watchlist.
 * @param {string} symbol
 * @param {string} [vaultPath]
 */
export async function removeWatchlistSymbol(symbol, vaultPath = DEFAULT_VAULT_PATH) {
  const norm = normalizeWatchlistSymbol(symbol);
  const state = await getVaultState(vaultPath);
  state.watchlist = state.watchlist.filter((s) => s !== norm && s !== symbol);
  await saveVaultState(state, vaultPath);
  return state;
}

/**
 * Detects if a user message contains an explicit command to remember a fact, add a to-do task, or add a watchlist ticker.
 * @param {string} userMessage
 * @returns {{action: 'none' | 'add_memory' | 'add_task' | 'add_watchlist', payload: string}}
 */
export function detectVaultCommand(userMessage) {
  if (!userMessage || typeof userMessage !== 'string') {
    return { action: 'none', payload: '' };
  }
  const text = userMessage.trim();

  // Check for "把 0050.TW 加入自選股" / "新增自選股 2454" / "add TSLA to watchlist"
  const watchMatch1 = text.match(
    /(?:把|將)\s*([A-Za-z0-9.,，、\s^-]+?)\s*(?:加入|加到|放入)(?:我的)?(?:自選股|投資組合|觀察清單|watchlist)/i
  );
  if (watchMatch1 && watchMatch1[1].trim()) {
    return { action: 'add_watchlist', payload: normalizeWatchlistSymbol(watchMatch1[1].trim()) };
  }

  const watchMatch2 = text.match(
    /(?:新增自選股|加入自選股|add\s+to\s+watchlist|watchlist\s+add)[：:\s]+([A-Za-z0-9.,，、\s^-]+)$/i
  );
  if (watchMatch2 && watchMatch2[1].trim()) {
    return { action: 'add_watchlist', payload: normalizeWatchlistSymbol(watchMatch2[1].trim()) };
  }

  const watchMatch3 = text.match(
    /add\s+([A-Za-z0-9.,\s^-]+?)\s+to\s+(?:my\s+)?watchlist/i
  );
  if (watchMatch3 && watchMatch3[1].trim()) {
    return { action: 'add_watchlist', payload: normalizeWatchlistSymbol(watchMatch3[1].trim()) };
  }

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
 * Formats stored memories, pending tasks, and custom watchlist for injection into the JARVIS system prompt.
 * @param {{memories: Array<object>, tasks: Array<object>, watchlist?: Array<string>}} state
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

  if (Array.isArray(state.watchlist) && state.watchlist.length > 0) {
    lines.push(`[USER CUSTOM PORTFOLIO WATCHLIST]: ${state.watchlist.join(', ')}`);
  }

  return lines.join('\n');
}
