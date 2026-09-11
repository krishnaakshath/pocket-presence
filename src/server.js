const http = require('http');
const crypto = require('crypto');

function timingSafeTokenMatch(supplied, secret) {
  if (typeof supplied !== 'string' || typeof secret !== 'string') return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function buildActivity({ gameName, iconKey }) {
  const activity = {
    details: 'In a match',
    state: gameName,
    startTimestamp: new Date(),
    instance: false,
  };
  if (iconKey) {
    activity.largeImageKey = iconKey;
    activity.largeImageText = gameName;
  }
  return activity;
}

// Generalized from the CODM-specific bridge that's already running in
// production on real hardware (Portfolio repo's scripts/codm-rpc/server.js)
// — same shared-secret check, same reconnect handling, only the activity
// payload and identifiers are now config-driven instead of hardcoded.
function createBridge({ config, discordClient }) {
  let discordReady = false;
  let reconnectTimer = null;
  let currentlyPlaying = false;

  function scheduleReconnect(delayMs) {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delayMs);
  }

  async function connect() {
    try {
      await discordClient.login();
    } catch (err) {
      discordReady = false;
      console.log(`Discord not reachable yet (is the desktop app open?): ${err.message}. Retrying in 10s...`);
      scheduleReconnect(10_000);
    }
  }

  discordClient.on('ready', () => {
    discordReady = true;
    console.log(`Connected to Discord as ${discordClient.user?.username ?? 'unknown user'}.`);
  });

  // Event name for a dropped connection isn't confirmed for every version
  // of @xhayper/discord-rpc — listening broadly rather than assuming one.
  for (const eventName of ['disconnected', 'close', 'error']) {
    discordClient.on(eventName, (err) => {
      if (discordReady) {
        console.log(`Lost connection to Discord (${eventName}${err ? `: ${err.message ?? err}` : ''}). Reconnecting...`);
      }
      discordReady = false;
      scheduleReconnect(5_000);
    });
  }

  async function setPlaying() {
    const activity = buildActivity(config);
    const setter = discordClient.user?.setActivity?.bind(discordClient.user) ?? discordClient.setActivity?.bind(discordClient);
    if (!setter) throw new Error('No setActivity method found on this discord-rpc client version.');
    await setter(activity);
    currentlyPlaying = true;
  }

  async function clearPlaying() {
    const clearer = discordClient.user?.clearActivity?.bind(discordClient.user) ?? discordClient.clearActivity?.bind(discordClient);
    if (!clearer) throw new Error('No clearActivity method found on this discord-rpc client version.');
    await clearer();
    currentlyPlaying = false;
  }

  const server = http.createServer(async (req, res) => {
    let url;
    try {
      url = new URL(req.url, `http://${req.headers.host}`);
    } catch {
      res.writeHead(400);
      res.end('Bad request');
      return;
    }

    if (!timingSafeTokenMatch(url.searchParams.get('token'), config.sharedSecret)) {
      res.writeHead(403);
      res.end('Forbidden — missing or incorrect token');
      return;
    }

    if (req.method !== 'POST') {
      res.writeHead(405);
      res.end('Method not allowed — use POST');
      return;
    }

    if (!discordReady) {
      res.writeHead(503);
      res.end('Not connected to Discord yet — is the desktop app open?');
      return;
    }

    try {
      if (url.pathname === '/start') {
        await setPlaying();
        console.log(`${config.gameName} started — Discord presence set.`);
        res.writeHead(200);
        res.end('ok');
        return;
      }

      if (url.pathname === '/stop') {
        await clearPlaying();
        console.log(`${config.gameName} stopped — Discord presence cleared.`);
        res.writeHead(200);
        res.end('ok');
        return;
      }

      res.writeHead(404);
      res.end('Not found — use /start or /stop');
    } catch (err) {
      console.error('Failed to update Discord presence:', err);
      res.writeHead(500);
      res.end('Failed to update Discord presence — see server logs');
    }
  });

  async function shutdown() {
    if (currentlyPlaying) {
      try {
        await clearPlaying();
      } catch {
        // best-effort — the process is exiting regardless
      }
    }
  }

  return {
    server,
    connect,
    shutdown,
    isReady: () => discordReady,
  };
}

module.exports = { timingSafeTokenMatch, buildActivity, createBridge };

if (require.main === module) {
  // Resolve .env relative to the project root, not the cwd — Windows'
  // schtasks.exe has no way to set a working directory, so the service
  // otherwise starts in %windir%\system32 and never finds .env.
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
  const { Client } = require('@xhayper/discord-rpc');
  const { loadConfig } = require('./config');

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  const discordClient = new Client({ clientId: config.clientId });
  const bridge = createBridge({ config, discordClient });

  bridge.server.listen(config.port, () => {
    console.log(`${config.gameName} presence bridge listening on http://0.0.0.0:${config.port}`);
    console.log(`Point your phone automation at http://<this-machine's-IP>:${config.port}/start and /stop, with ?token=<SHARED_SECRET>.`);
  });

  bridge.connect();

  // launchctl bootout and systemctl --user stop both send SIGTERM, so the
  // presence-clearing shutdown path has to handle it as well as SIGINT.
  async function handleShutdownSignal() {
    await bridge.shutdown();
    process.exit(0);
  }

  process.on('SIGINT', handleShutdownSignal);
  process.on('SIGTERM', handleShutdownSignal);
}
