import { createServer, listenWithPortFallback } from './app.js';
import { startAlertMonitor, stopAlertMonitor, pushAlertEvent } from './services/alertService.js';
import { fetchAlertQuotes } from './services/webSkillsService.js';
import { startAutomationScheduler, stopAutomationScheduler } from './services/automationService.js';

const PREFERRED_PORT = Number(process.env.PORT) || 63219;
const server = createServer();

listenWithPortFallback(server, PREFERRED_PORT, 50)
  .then((boundPort) => {
    console.log(
      `[J.A.R.V.I.S. SYSTEM ONLINE] Holographic HUD active at http://localhost:${boundPort}`
    );

    // Background price alert & seismic monitor
    startAlertMonitor({ fetchQuotes: fetchAlertQuotes, intervalMs: 60000 });
    server.once('close', () => stopAlertMonitor());

    // Background automation & hardware sentinel scheduler
    startAutomationScheduler({
      onEvent: async (evt) => {
        console.log(`[J.A.R.V.I.S. AUTOMATION] Triggered: ${evt.title}`);
        await pushAlertEvent({
          kind: evt.kind,
          title: evt.title,
          message: evt.message,
          speechText: evt.speechText
        });
      },
      intervalMs: 30000
    });
    server.once('close', () => stopAutomationScheduler());
  })
  .catch((err) => {
    console.error('[J.A.R.V.I.S. CRITICAL] Failed to bind to an available port:', err);
    process.exit(1);
  });

process.on('uncaughtException', (err) => {
  if (err && (err.code === 'ERR_HTTP_HEADERS_SENT' || err.code === 'ECONNRESET' || err.code === 'EPIPE')) {
    console.warn(`[J.A.R.V.I.S. NETWORK] Transient connection reset suppressed: ${err.message}`);
    return;
  }
  console.error('[J.A.R.V.I.S. UNCAUGHT EXCEPTION]', err);
});
