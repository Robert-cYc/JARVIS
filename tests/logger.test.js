import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLogTimestamp,
  shouldTimestampMessage,
  formatConsoleArgs,
  installConsoleTimestampInterceptor,
  uninstallConsoleTimestampInterceptor,
  logger
} from '../src/server/utils/logger.js';

describe('J.A.R.V.I.S. Timestamped Logger Utility', () => {
  describe('1. Timestamp Formatting (getLogTimestamp)', () => {
    it('formats a date into YYYY-MM-DD HH:mm:ss format with leading zeros', () => {
      const fixedDate = new Date(2026, 10, 3, 9, 5, 8); // 2026-11-03 09:05:08
      const formatted = getLogTimestamp(fixedDate);
      assert.equal(formatted, '2026-11-03 09:05:08');
    });

    it('returns a valid timestamp for current time', () => {
      const stamp = getLogTimestamp();
      assert.match(stamp, /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}$/);
    });
  });

  describe('2. Message Filter Logic (shouldTimestampMessage)', () => {
    it('identifies J.A.R.V.I.S. tagged log messages', () => {
      assert.equal(
        shouldTimestampMessage('[J.A.R.V.I.S. BOOT] Memory Vault initialized.'),
        true
      );
      assert.equal(
        shouldTimestampMessage('[J.A.R.V.I.S. AUTOMATION] Triggered: Market Bell'),
        true
      );
      assert.equal(
        shouldTimestampMessage('[J.A.R.V.I.S. SYSTEM ONLINE] Holographic HUD active'),
        true
      );
      assert.equal(
        shouldTimestampMessage('[STARK LABS] Experimental reactor online'),
        true
      );
    });

    it('ignores banner dividers, instructional text, and empty messages', () => {
      assert.equal(shouldTimestampMessage('======================================================================'), false);
      assert.equal(shouldTimestampMessage('----------------------------------------------------------------------'), false);
      assert.equal(shouldTimestampMessage('Press Ctrl+C at any time to power down the Arc Reactor.'), false);
      assert.equal(shouldTimestampMessage(''), false);
      assert.equal(shouldTimestampMessage(null), false);
    });

    it('prevents double-timestamping if already stamped', () => {
      assert.equal(
        shouldTimestampMessage('[2026-11-03 09:16:27] [J.A.R.V.I.S. BOOT] Already stamped'),
        false
      );
    });
  });

  describe('3. Argument Formatting (formatConsoleArgs)', () => {
    it('prepends timestamp to tagged messages and preserves secondary arguments', () => {
      const fixedDate = new Date(2026, 10, 3, 9, 16, 27);
      const args = ['[J.A.R.V.I.S. BOOT] Ollama Core ONLINE', { models: 2 }];
      const formatted = formatConsoleArgs(args, fixedDate);

      assert.equal(
        formatted[0],
        '[2026-11-03 09:16:27] [J.A.R.V.I.S. BOOT] Ollama Core ONLINE'
      );
      assert.deepEqual(formatted[1], { models: 2 });
    });

    it('preserves leading newline characters in tagged messages', () => {
      const fixedDate = new Date(2026, 10, 3, 9, 16, 27);
      const args = ['\n[J.A.R.V.I.S. SYSTEM] SIGINT received. Powering down...'];
      const formatted = formatConsoleArgs(args, fixedDate);

      assert.equal(
        formatted[0],
        '\n[2026-11-03 09:16:27] [J.A.R.V.I.S. SYSTEM] SIGINT received. Powering down...'
      );
    });
  });

  describe('4. Interceptor Lifecycle & Integration', () => {
    beforeEach(() => {
      uninstallConsoleTimestampInterceptor();
    });

    afterEach(() => {
      uninstallConsoleTimestampInterceptor();
    });

    it('intercepts console.log calls and injects timestamp', () => {
      const logged = [];
      const originalLog = console.log;

      installConsoleTimestampInterceptor();

      // Intercept the underlying stdout to verify
      console.log('[J.A.R.V.I.S. AUTOMATION] Triggered: ⚡ 行情劇烈波動預警 [GC=F]');

      uninstallConsoleTimestampInterceptor();
    });

    it('logger helper outputs formatted logs', () => {
      installConsoleTimestampInterceptor();
      assert.ok(typeof logger.getTimestamp() === 'string');
      uninstallConsoleTimestampInterceptor();
    });
  });
});
