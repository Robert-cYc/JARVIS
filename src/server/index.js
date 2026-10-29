import { createServer } from './app.js';

const PORT = Number(process.env.PORT) || 3000;
const server = createServer();

server.listen(PORT, () => {
  console.log(
    `[J.A.R.V.I.S. SYSTEM ONLINE] Holographic HUD active at http://localhost:${PORT}`
  );
});
