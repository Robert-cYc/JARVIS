/**
 * Stark Industries Core Telemetry — Precision Timestamped Logger Utility
 * Injects ISO/Local datetime stamps into J.A.R.V.I.S. console and system telemetry logs.
 */

let isInterceptorInstalled = false;
let originalConsoleMethods = null;

/**
 * Formats a given Date into local "YYYY-MM-DD HH:mm:ss" string.
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getLogTimestamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * Checks whether a log message should be timestamped.
 * Applies to messages tagged with [J.A.R.V.I.S., [STARK, or system brackets.
 * Avoids double-timestamping or timestamping banner dividers.
 * @param {string} text
 * @returns {boolean}
 */
export function shouldTimestampMessage(text) {
  if (typeof text !== 'string') return false;
  const clean = text.trim();
  if (!clean) return false;

  // Do not timestamp banner dividers or plain indentation
  if (/^(=+|-+|\*+|#+)$/.test(clean)) return false;

  // Do not double-timestamp
  if (/^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]/.test(clean)) return false;

  // Timestamp J.A.R.V.I.S. and STARK tags
  if (/^\[(?:J\.A\.R\.V\.I\.S\.|STARK|[A-Z0-9_\-.]+(?:\s+[A-Z0-9_\-.]+)*)\]/i.test(clean)) {
    return true;
  }

  return false;
}

/**
 * Formats arguments by prefixing the timestamp to tagged log messages.
 * @param {Array<any>} args
 * @param {Date} [date=new Date()]
 * @returns {Array<any>}
 */
export function formatConsoleArgs(args, date = new Date()) {
  if (!args || args.length === 0) return args;

  const first = args[0];
  if (typeof first === 'string') {
    const hasLeadingNewline = first.startsWith('\n');
    const cleanFirst = hasLeadingNewline ? first.slice(1) : first;

    if (shouldTimestampMessage(cleanFirst)) {
      const stamp = `[${getLogTimestamp(date)}] `;
      const newFirst = hasLeadingNewline ? `\n${stamp}${cleanFirst}` : `${stamp}${cleanFirst}`;
      return [newFirst, ...args.slice(1)];
    }
  }

  return args;
}

/**
 * Installs console interceptor across log, warn, error, and info to add datetime to logs.
 */
export function installConsoleTimestampInterceptor() {
  if (isInterceptorInstalled) return;

  originalConsoleMethods = {
    log: console.log,
    warn: console.warn,
    error: console.error,
    info: console.info
  };

  console.log = (...args) => originalConsoleMethods.log(...formatConsoleArgs(args));
  console.warn = (...args) => originalConsoleMethods.warn(...formatConsoleArgs(args));
  console.error = (...args) => originalConsoleMethods.error(...formatConsoleArgs(args));
  console.info = (...args) => originalConsoleMethods.info(...formatConsoleArgs(args));

  isInterceptorInstalled = true;
}

/**
 * Restores original console methods (useful for test isolation).
 */
export function uninstallConsoleTimestampInterceptor() {
  if (!isInterceptorInstalled || !originalConsoleMethods) return;

  console.log = originalConsoleMethods.log;
  console.warn = originalConsoleMethods.warn;
  console.error = originalConsoleMethods.error;
  console.info = originalConsoleMethods.info;

  originalConsoleMethods = null;
  isInterceptorInstalled = false;
}

/**
 * Explicit logging helper for formatted system output.
 */
export const logger = {
  getTimestamp: getLogTimestamp,
  log: (tag, ...args) => console.log(`[${tag}]`, ...args),
  warn: (tag, ...args) => console.warn(`[${tag}]`, ...args),
  error: (tag, ...args) => console.error(`[${tag}]`, ...args),
  info: (tag, ...args) => console.info(`[${tag}]`, ...args)
};
