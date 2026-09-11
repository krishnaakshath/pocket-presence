# PocketPresence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build PocketPresence — a generic, config-driven local bridge that sets/clears Discord Rich Presence via a webhook from a phone automation app, plus an interactive setup wizard and cross-platform auto-start installers, ready to publish as a plain cloneable public GitHub repo.

**Architecture:** A small Node.js HTTP server (`src/server.js`) holds a persistent connection to Discord desktop via `@xhayper/discord-rpc` and exposes `/start`/`/stop` endpoints guarded by a shared-secret token; all game-specific values (name, Discord Application ID, icon key) come from `.env`-loaded config (`src/config.js`), never hardcoded. Three platform modules (`src/platform/{macos,windows,linux}.js`) each generate and register that OS's native auto-start mechanism. `bin/setup.js` is an interactive wizard that collects config, live-tests the Discord connection, writes `.env`, optionally invokes the matching platform installer, and prints ready-to-paste phone-automation instructions.

**Tech Stack:** Node.js (already verified against v24.12.0 on this machine), `@xhayper/discord-rpc`, `dotenv`, Node's built-in `node:test` + `node:assert/strict` test runner (no extra test dependency — keeps the "lower maintenance surface" philosophy from the spec), native `fetch` for HTTP integration tests.

**Spec:** `docs/superpowers/specs/2026-09-11-pocket-presence-design.md`

## Global Constraints

- Generic engine only — game name, Discord Application ID, and icon key are config, never hardcoded; CODM is the worked example in docs only.
- Plain cloneable GitHub repo, not an npm-published package.
- Setup must be wizard-driven (`node bin/setup.js`) — no manual `.env` editing required.
- Must work from anywhere, including cellular data with WiFi off — webhook detection only, no ADB polling (explicitly dropped in the spec).
- Cross-platform auto-start: macOS (LaunchAgent) is implemented and testable end-to-end on this machine; Windows (Scheduled Task) and Linux (systemd --user unit) are implemented against each platform's documented mechanism but are **not verified on real hardware** — state this plainly in the README and in code comments.
- License: MIT.
- Non-goals (do not build): multi-game-per-instance support, a cloud/headless-Discord option, ADB-based detection, or any game-client patching.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `config.example.env`
- Create: `LICENSE`

**Interfaces:**
- Produces: an installable Node project (`npm install` succeeds) and the `.env` shape every later task's config loader reads (`GAME_NAME`, `DISCORD_APP_CLIENT_ID`, `ICON_KEY`, `SHARED_SECRET`, `PORT`).

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "pocket-presence",
  "version": "1.0.0",
  "private": true,
  "description": "Bring Discord Rich Presence to any mobile game that doesn't natively support it (e.g. Call of Duty: Mobile) — your phone triggers a local bridge automatically, no manual toggling.",
  "main": "src/server.js",
  "scripts": {
    "start": "node src/server.js",
    "setup": "node bin/setup.js",
    "test": "node --test"
  },
  "dependencies": {
    "@xhayper/discord-rpc": "^1.3.4",
    "dotenv": "^16.4.5"
  },
  "license": "MIT"
}
```

- [ ] **Step 2: Write `.gitignore`**

```
node_modules/
.env
*.log
```

- [ ] **Step 3: Write `config.example.env`**

```
# Copy this file to .env and fill in real values, or just run: node bin/setup.js
GAME_NAME=Call of Duty: Mobile
DISCORD_APP_CLIENT_ID=
ICON_KEY=
SHARED_SECRET=
PORT=39393
```

- [ ] **Step 4: Write `LICENSE`**

```
MIT License

Copyright (c) 2026 krishnaakshath

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` written, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore config.example.env LICENSE
git commit -m "chore: project scaffold"
```

---

### Task 2: Config loader

**Files:**
- Create: `src/config.js`
- Test: `test/config.test.js`

**Interfaces:**
- Consumes: an env-like object (defaults to `process.env`).
- Produces: `loadConfig(env = process.env) -> { gameName: string, clientId: string, sharedSecret: string, iconKey: string|undefined, port: number }`, throwing `Error` listing every missing required field by name. Consumed by Task 3 (`src/server.js` CLI entrypoint).

- [ ] **Step 1: Write the failing tests**

```js
// test/config.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config');

test('loadConfig returns a full config object when all required fields are set', () => {
  const config = loadConfig({
    GAME_NAME: 'Call of Duty: Mobile',
    DISCORD_APP_CLIENT_ID: '123456789',
    SHARED_SECRET: 'abc123',
    ICON_KEY: 'codm_icon',
    PORT: '4000',
  });
  assert.deepEqual(config, {
    gameName: 'Call of Duty: Mobile',
    clientId: '123456789',
    sharedSecret: 'abc123',
    iconKey: 'codm_icon',
    port: 4000,
  });
});

test('loadConfig defaults PORT to 39393 and leaves iconKey undefined when unset', () => {
  const config = loadConfig({
    GAME_NAME: 'Call of Duty: Mobile',
    DISCORD_APP_CLIENT_ID: '123456789',
    SHARED_SECRET: 'abc123',
  });
  assert.equal(config.port, 39393);
  assert.equal(config.iconKey, undefined);
});

test('loadConfig throws listing every missing required field', () => {
  assert.throws(
    () => loadConfig({}),
    /GAME_NAME, DISCORD_APP_CLIENT_ID, SHARED_SECRET/
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/config.test.js`
Expected: FAIL — `Cannot find module '../src/config'`

- [ ] **Step 3: Write `src/config.js`**

```js
function loadConfig(env = process.env) {
  const gameName = env.GAME_NAME;
  const clientId = env.DISCORD_APP_CLIENT_ID;
  const sharedSecret = env.SHARED_SECRET;
  const iconKey = env.ICON_KEY || undefined;
  const port = Number(env.PORT) || 39393;

  const missing = [];
  if (!gameName) missing.push('GAME_NAME');
  if (!clientId) missing.push('DISCORD_APP_CLIENT_ID');
  if (!sharedSecret) missing.push('SHARED_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(', ')}. Run "node bin/setup.js" or copy config.example.env to .env and fill it in.`
    );
  }

  return { gameName, clientId, sharedSecret, iconKey, port };
}

module.exports = { loadConfig };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/config.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/config.js test/config.test.js
git commit -m "feat: add config loader"
```

---

### Task 3: Bridge server

**Files:**
- Create: `src/server.js`
- Test: `test/server.test.js`

**Interfaces:**
- Consumes: `loadConfig` from Task 2 (used only in the CLI entrypoint block).
- Produces:
  - `timingSafeTokenMatch(supplied: string, secret: string) -> boolean`
  - `buildActivity({ gameName, iconKey }) -> object` (a Discord Rich Presence activity payload)
  - `createBridge({ config, discordClient }) -> { server: http.Server, connect: () => Promise<void>, shutdown: () => Promise<void>, isReady: () => boolean }`
  - These are consumed by no other file in this plan (platform installers only reference `src/server.js`'s file path, not its exports), but are the shape any future integration must match.

- [ ] **Step 1: Write the failing tests**

```js
// test/server.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { timingSafeTokenMatch, buildActivity, createBridge } = require('../src/server');

function createFakeDiscordClient({ shouldFailLogin = false } = {}) {
  const client = new EventEmitter();
  client.user = {
    username: 'tester',
    setActivity: async () => {},
    clearActivity: async () => {},
  };
  client.login = async () => {
    if (shouldFailLogin) throw new Error('mock login failure');
    queueMicrotask(() => client.emit('ready'));
  };
  return client;
}

test('timingSafeTokenMatch matches equal strings and rejects everything else', () => {
  assert.equal(timingSafeTokenMatch('secret', 'secret'), true);
  assert.equal(timingSafeTokenMatch('wrong', 'secret'), false);
  assert.equal(timingSafeTokenMatch(undefined, 'secret'), false);
  assert.equal(timingSafeTokenMatch(null, 'secret'), false);
});

test('buildActivity includes the icon key only when configured', () => {
  const withIcon = buildActivity({ gameName: 'Call of Duty: Mobile', iconKey: 'codm_icon' });
  assert.equal(withIcon.state, 'Call of Duty: Mobile');
  assert.equal(withIcon.largeImageKey, 'codm_icon');

  const withoutIcon = buildActivity({ gameName: 'Call of Duty: Mobile' });
  assert.equal(withoutIcon.largeImageKey, undefined);
});

test('bridge server rejects requests with a wrong or missing token', async (t) => {
  const config = { gameName: 'Test Game', clientId: 'x', sharedSecret: 'right-token', port: 0 };
  const discordClient = createFakeDiscordClient();
  const bridge = createBridge({ config, discordClient });
  await new Promise((resolve) => bridge.server.listen(0, resolve));
  t.after(() => bridge.server.close());

  const { port } = bridge.server.address();
  const wrongToken = await fetch(`http://127.0.0.1:${port}/start?token=wrong-token`, { method: 'POST' });
  assert.equal(wrongToken.status, 403);

  const missingToken = await fetch(`http://127.0.0.1:${port}/start`, { method: 'POST' });
  assert.equal(missingToken.status, 403);
});

test('bridge server returns 503 on /start before Discord is ready', async (t) => {
  const config = { gameName: 'Test Game', clientId: 'x', sharedSecret: 'right-token', port: 0 };
  const discordClient = createFakeDiscordClient();
  const bridge = createBridge({ config, discordClient });
  await new Promise((resolve) => bridge.server.listen(0, resolve));
  t.after(() => bridge.server.close());

  const { port } = bridge.server.address();
  const res = await fetch(`http://127.0.0.1:${port}/start?token=right-token`, { method: 'POST' });
  assert.equal(res.status, 503);
});

test('bridge server sets and clears Discord presence once connected', async (t) => {
  const config = { gameName: 'Test Game', clientId: 'x', sharedSecret: 'right-token', port: 0, iconKey: 'icon' };
  const discordClient = createFakeDiscordClient();
  const bridge = createBridge({ config, discordClient });
  await bridge.connect();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => bridge.server.listen(0, resolve));
  t.after(() => bridge.server.close());

  const { port } = bridge.server.address();

  const startRes = await fetch(`http://127.0.0.1:${port}/start?token=right-token`, { method: 'POST' });
  assert.equal(startRes.status, 200);
  assert.equal(await startRes.text(), 'ok');

  const stopRes = await fetch(`http://127.0.0.1:${port}/stop?token=right-token`, { method: 'POST' });
  assert.equal(stopRes.status, 200);
  assert.equal(await stopRes.text(), 'ok');

  const badPath = await fetch(`http://127.0.0.1:${port}/nope?token=right-token`, { method: 'POST' });
  assert.equal(badPath.status, 404);

  const wrongMethod = await fetch(`http://127.0.0.1:${port}/start?token=right-token`, { method: 'GET' });
  assert.equal(wrongMethod.status, 405);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/server.test.js`
Expected: FAIL — `Cannot find module '../src/server'`

- [ ] **Step 3: Write `src/server.js`**

```js
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
  require('dotenv').config();
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

  process.on('SIGINT', async () => {
    await bridge.shutdown();
    process.exit(0);
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/server.test.js`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/server.js test/server.test.js
git commit -m "feat: add generalized bridge server"
```

---

### Task 4: macOS platform installer

**Files:**
- Create: `src/platform/macos.js`
- Test: `test/platform-macos.test.js`

**Interfaces:**
- Produces:
  - `launchAgentLabel(gameName: string) -> string` (e.g. `"com.pocketpresence.call-of-duty-mobile"`)
  - `generatePlist({ gameName, nodePath, serverPath, workingDirectory, logPath, errorLogPath }) -> string`
  - `install({ gameName, projectRoot, nodePath?, launchAgentsDir?, runLaunchctl? }) -> { label: string, plistPath: string }`
  - Consumed by Task 7's `installers.darwin`.

- [ ] **Step 1: Write the failing tests**

```js
// test/platform-macos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { launchAgentLabel, generatePlist, install } = require('../src/platform/macos');

test('launchAgentLabel slugifies the game name', () => {
  assert.equal(launchAgentLabel('Call of Duty: Mobile'), 'com.pocketpresence.call-of-duty-mobile');
});

test('generatePlist embeds the node path, server path, working directory, and label', () => {
  const plist = generatePlist({
    gameName: 'Call of Duty: Mobile',
    nodePath: '/usr/local/bin/node',
    serverPath: '/opt/pocket-presence/src/server.js',
    workingDirectory: '/opt/pocket-presence',
    logPath: '/opt/pocket-presence/bridge.log',
    errorLogPath: '/opt/pocket-presence/bridge.error.log',
  });
  assert.match(plist, /<string>\/usr\/local\/bin\/node<\/string>/);
  assert.match(plist, /<string>\/opt\/pocket-presence\/src\/server\.js<\/string>/);
  assert.match(plist, /<string>com\.pocketpresence\.call-of-duty-mobile<\/string>/);
  assert.match(plist, /<string>\/opt\/pocket-presence<\/string>/);
});

test('install writes the plist file into the given directory and invokes the launchctl runner', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-presence-test-'));
  const calls = [];
  const result = install({
    gameName: 'Call of Duty: Mobile',
    projectRoot: '/opt/pocket-presence',
    nodePath: '/usr/local/bin/node',
    launchAgentsDir: tmpDir,
    runLaunchctl: (plistPath) => calls.push(plistPath),
  });

  assert.equal(result.label, 'com.pocketpresence.call-of-duty-mobile');
  assert.equal(fs.existsSync(result.plistPath), true);
  assert.deepEqual(calls, [result.plistPath]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/platform-macos.test.js`
Expected: FAIL — `Cannot find module '../src/platform/macos'`

- [ ] **Step 3: Write `src/platform/macos.js`**

```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function launchAgentLabel(gameName) {
  const slug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `com.pocketpresence.${slug}`;
}

function generatePlist({ gameName, nodePath, serverPath, workingDirectory, logPath, errorLogPath }) {
  const label = launchAgentLabel(gameName);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>

    <key>ProgramArguments</key>
    <array>
        <string>${nodePath}</string>
        <string>${serverPath}</string>
    </array>

    <key>WorkingDirectory</key>
    <string>${workingDirectory}</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <dict>
        <key>SuccessfulExit</key>
        <false/>
    </dict>

    <key>StandardOutPath</key>
    <string>${logPath}</string>
    <key>StandardErrorPath</key>
    <string>${errorLogPath}</string>
</dict>
</plist>
`;
}

function defaultRunLaunchctl(plistPath) {
  execFileSync('launchctl', ['bootstrap', `gui/${process.getuid()}`, plistPath]);
}

function install({
  gameName,
  projectRoot,
  nodePath = process.execPath,
  launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents'),
  runLaunchctl = defaultRunLaunchctl,
}) {
  const label = launchAgentLabel(gameName);
  const plistPath = path.join(launchAgentsDir, `${label}.plist`);
  const plistContent = generatePlist({
    gameName,
    nodePath,
    serverPath: path.join(projectRoot, 'src', 'server.js'),
    workingDirectory: projectRoot,
    logPath: path.join(projectRoot, 'bridge.log'),
    errorLogPath: path.join(projectRoot, 'bridge.error.log'),
  });

  fs.mkdirSync(launchAgentsDir, { recursive: true });
  fs.writeFileSync(plistPath, plistContent, 'utf8');
  runLaunchctl(plistPath);

  return { label, plistPath };
}

module.exports = { launchAgentLabel, generatePlist, install };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/platform-macos.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/macos.js test/platform-macos.test.js
git commit -m "feat: add macOS LaunchAgent installer"
```

---

### Task 5: Windows platform installer

**Files:**
- Create: `src/platform/windows.js`
- Test: `test/platform-windows.test.js`

**Interfaces:**
- Produces:
  - `scheduledTaskName(gameName: string) -> string`
  - `buildSchtasksArgs({ gameName, nodePath, serverPath }) -> string[]`
  - `install({ gameName, projectRoot, nodePath?, runSchtasks? }) -> { taskName: string, args: string[] }`
  - Consumed by Task 7's `installers.win32`.
  - **Not verified on real Windows hardware** — implemented against `schtasks.exe`'s documented `/Create` syntax only; flagged in code comments and the README per the spec's stated gap.

- [ ] **Step 1: Write the failing tests**

```js
// test/platform-windows.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { scheduledTaskName, buildSchtasksArgs, install } = require('../src/platform/windows');

test('scheduledTaskName strips non-alphanumeric characters from the game name', () => {
  assert.equal(scheduledTaskName('Call of Duty: Mobile'), 'PocketPresence-CallofDutyMobile');
});

test('buildSchtasksArgs includes the task name, node path, and server path', () => {
  const args = buildSchtasksArgs({
    gameName: 'Call of Duty: Mobile',
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    serverPath: 'C:\\pocket-presence\\src\\server.js',
  });
  assert.deepEqual(args, [
    '/Create',
    '/TN', 'PocketPresence-CallofDutyMobile',
    '/TR', '"C:\\Program Files\\nodejs\\node.exe" "C:\\pocket-presence\\src\\server.js"',
    '/SC', 'ONLOGON',
    '/RL', 'LIMITED',
    '/F',
  ]);
});

test('install builds the args and invokes the schtasks runner', () => {
  const calls = [];
  const result = install({
    gameName: 'Call of Duty: Mobile',
    projectRoot: 'C:\\pocket-presence',
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    runSchtasks: (args) => calls.push(args),
  });

  assert.equal(result.taskName, 'PocketPresence-CallofDutyMobile');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], result.args);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/platform-windows.test.js`
Expected: FAIL — `Cannot find module '../src/platform/windows'`

- [ ] **Step 3: Write `src/platform/windows.js`**

```js
const path = require('path');
const { execFileSync } = require('child_process');

function scheduledTaskName(gameName) {
  const slug = gameName.replace(/[^a-zA-Z0-9]+/g, '');
  return `PocketPresence-${slug}`;
}

function buildSchtasksArgs({ gameName, nodePath, serverPath }) {
  const taskName = scheduledTaskName(gameName);
  return [
    '/Create',
    '/TN', taskName,
    '/TR', `"${nodePath}" "${serverPath}"`,
    '/SC', 'ONLOGON',
    '/RL', 'LIMITED',
    '/F',
  ];
}

function defaultRunSchtasks(args) {
  execFileSync('schtasks', args);
}

// Uses schtasks.exe's documented /Create syntax to run the bridge at logon.
// Implemented against Microsoft's published schtasks reference only — not
// personally verified on real Windows hardware. If this doesn't work on
// your machine, please open an issue with the exact error.
function install({ gameName, projectRoot, nodePath = process.execPath, runSchtasks = defaultRunSchtasks }) {
  const serverPath = path.join(projectRoot, 'src', 'server.js');
  const args = buildSchtasksArgs({ gameName, nodePath, serverPath });
  runSchtasks(args);
  return { taskName: scheduledTaskName(gameName), args };
}

module.exports = { scheduledTaskName, buildSchtasksArgs, install };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/platform-windows.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/windows.js test/platform-windows.test.js
git commit -m "feat: add Windows Scheduled Task installer"
```

---

### Task 6: Linux platform installer

**Files:**
- Create: `src/platform/linux.js`
- Test: `test/platform-linux.test.js`

**Interfaces:**
- Produces:
  - `serviceName(gameName: string) -> string`
  - `generateUnit({ gameName, nodePath, serverPath, workingDirectory }) -> string`
  - `install({ gameName, projectRoot, nodePath?, unitsDir?, runSystemctl? }) -> { name: string, unitPath: string }`
  - Consumed by Task 7's `installers.linux`.
  - **Not verified on real Linux hardware** — implemented against systemd's documented `--user` unit mechanism only, same flagged-gap treatment as Task 5.

- [ ] **Step 1: Write the failing tests**

```js
// test/platform-linux.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { serviceName, generateUnit, install } = require('../src/platform/linux');

test('serviceName slugifies the game name', () => {
  assert.equal(serviceName('Call of Duty: Mobile'), 'pocket-presence-call-of-duty-mobile');
});

test('generateUnit embeds ExecStart and WorkingDirectory', () => {
  const unit = generateUnit({
    gameName: 'Call of Duty: Mobile',
    nodePath: '/usr/bin/node',
    serverPath: '/opt/pocket-presence/src/server.js',
    workingDirectory: '/opt/pocket-presence',
  });
  assert.match(unit, /ExecStart=\/usr\/bin\/node \/opt\/pocket-presence\/src\/server\.js/);
  assert.match(unit, /WorkingDirectory=\/opt\/pocket-presence/);
  assert.match(unit, /WantedBy=default\.target/);
});

test('install writes the unit file and invokes the systemctl runner', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocket-presence-test-'));
  const calls = [];
  const result = install({
    gameName: 'Call of Duty: Mobile',
    projectRoot: '/opt/pocket-presence',
    nodePath: '/usr/bin/node',
    unitsDir: tmpDir,
    runSystemctl: (args) => calls.push(args),
  });

  assert.equal(result.name, 'pocket-presence-call-of-duty-mobile');
  assert.equal(fs.existsSync(result.unitPath), true);
  assert.deepEqual(calls, [['--user', 'enable', '--now', 'pocket-presence-call-of-duty-mobile.service']]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/platform-linux.test.js`
Expected: FAIL — `Cannot find module '../src/platform/linux'`

- [ ] **Step 3: Write `src/platform/linux.js`**

```js
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

function serviceName(gameName) {
  const slug = gameName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `pocket-presence-${slug}`;
}

function generateUnit({ gameName, nodePath, serverPath, workingDirectory }) {
  return `[Unit]
Description=Pocket Presence bridge for ${gameName}
After=network.target

[Service]
ExecStart=${nodePath} ${serverPath}
WorkingDirectory=${workingDirectory}
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
`;
}

function defaultRunSystemctl(args) {
  execFileSync('systemctl', args);
}

// Uses systemd's documented --user unit mechanism. Not personally verified
// on real Linux hardware — if `systemctl --user enable --now` fails on your
// distro (e.g. lingering not enabled), please open an issue with the error.
function install({
  gameName,
  projectRoot,
  nodePath = process.execPath,
  unitsDir = path.join(os.homedir(), '.config', 'systemd', 'user'),
  runSystemctl = defaultRunSystemctl,
}) {
  const name = serviceName(gameName);
  const unitPath = path.join(unitsDir, `${name}.service`);
  const unitContent = generateUnit({
    gameName,
    nodePath,
    serverPath: path.join(projectRoot, 'src', 'server.js'),
    workingDirectory: projectRoot,
  });

  fs.mkdirSync(unitsDir, { recursive: true });
  fs.writeFileSync(unitPath, unitContent, 'utf8');
  runSystemctl(['--user', 'enable', '--now', `${name}.service`]);

  return { name, unitPath };
}

module.exports = { serviceName, generateUnit, install };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/platform-linux.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/platform/linux.js test/platform-linux.test.js
git commit -m "feat: add Linux systemd --user installer"
```

---

### Task 7: Interactive setup wizard

**Files:**
- Create: `bin/setup.js`
- Test: `test/setup.test.js`

**Interfaces:**
- Consumes: `install()` from Tasks 4/5/6 (wired only in the CLI entrypoint block, via dependency injection everywhere else so tests never touch real launchctl/schtasks/systemctl or real Discord).
- Produces:
  - `generateSharedSecret() -> string` (48-char hex)
  - `buildPhoneAutomationInstructions({ gameName, sharedSecret, port }) -> string`
  - `runWizard({ prompt, testDiscordConnection, platform, installers, writeEnvFile, log? }) -> Promise<{ config, installResult, phoneAutomationInstructions }>`, throwing a clear `Error` if no Application ID is given or the live Discord test fails.

- [ ] **Step 1: Write the failing tests**

```js
// test/setup.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { generateSharedSecret, runWizard, buildPhoneAutomationInstructions } = require('../bin/setup');

test('generateSharedSecret returns a 48-character hex string', () => {
  const secret = generateSharedSecret();
  assert.equal(secret.length, 48);
  assert.match(secret, /^[0-9a-f]+$/);
});

test('runWizard collects answers, tests Discord, writes config, and runs the matching installer', async () => {
  const answers = {
    'Game name': 'Call of Duty: Mobile',
    'Discord Application ID': '123456789',
    'Rich Presence icon asset key (optional, press enter to skip)': 'codm_icon',
    'Install auto-start on darwin now? (y/n)': 'y',
  };
  const prompt = async (question) => answers[question] ?? '';
  const testDiscordConnection = async ({ clientId }) => {
    assert.equal(clientId, '123456789');
    return { ok: true, username: 'tester' };
  };
  const writtenConfigs = [];
  const writeEnvFile = async (config) => writtenConfigs.push(config);
  const installCalls = [];
  const installers = {
    darwin: async (config) => {
      installCalls.push(config);
      return { label: 'com.pocketpresence.call-of-duty-mobile' };
    },
  };

  const result = await runWizard({ prompt, testDiscordConnection, platform: 'darwin', installers, writeEnvFile, log: () => {} });

  assert.equal(writtenConfigs.length, 1);
  assert.equal(writtenConfigs[0].gameName, 'Call of Duty: Mobile');
  assert.equal(installCalls.length, 1);
  assert.equal(result.installResult.label, 'com.pocketpresence.call-of-duty-mobile');
});

test('runWizard throws a clear error when no Discord Application ID is given', async () => {
  const prompt = async (question) => (question === 'Discord Application ID' ? '' : 'x');
  await assert.rejects(
    () => runWizard({
      prompt,
      testDiscordConnection: async () => ({ ok: true, username: 'x' }),
      platform: 'darwin',
      installers: {},
      writeEnvFile: async () => {},
    }),
    /Discord Application ID is required/
  );
});

test('runWizard throws a clear error when the Discord connection test fails', async () => {
  const prompt = async (question) => (question === 'Discord Application ID' ? '123' : 'x');
  await assert.rejects(
    () => runWizard({
      prompt,
      testDiscordConnection: async () => ({ ok: false, error: 'ECONNREFUSED' }),
      platform: 'darwin',
      installers: {},
      writeEnvFile: async () => {},
    }),
    /Could not connect to Discord: ECONNREFUSED/
  );
});

test('runWizard skips auto-start cleanly when no installer exists for the platform', async () => {
  const prompt = async (question) => (question === 'Discord Application ID' ? '123' : 'x');
  const result = await runWizard({
    prompt,
    testDiscordConnection: async () => ({ ok: true, username: 'tester' }),
    platform: 'freebsd',
    installers: {},
    writeEnvFile: async () => {},
    log: () => {},
  });
  assert.equal(result.installResult, null);
});

test('buildPhoneAutomationInstructions fills in real values for start and stop URLs', () => {
  const text = buildPhoneAutomationInstructions({ gameName: 'Call of Duty: Mobile', sharedSecret: 'abc123', port: 39393 });
  assert.match(text, /\/start\?token=abc123/);
  assert.match(text, /\/stop\?token=abc123/);
  assert.match(text, /:39393/);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/setup.test.js`
Expected: FAIL — `Cannot find module '../bin/setup'`

- [ ] **Step 3: Write `bin/setup.js`**

```js
const path = require('path');
const crypto = require('crypto');

function generateSharedSecret() {
  return crypto.randomBytes(24).toString('hex');
}

function buildPhoneAutomationInstructions({ gameName, sharedSecret, port }) {
  return [
    `Point your phone automation (Tasker/MacroDroid on Android, Shortcuts on iOS) at this machine's IP.`,
    `On ${gameName} opened: POST http://<this-machine-IP>:${port}/start?token=${sharedSecret}`,
    `On ${gameName} closed:  POST http://<this-machine-IP>:${port}/stop?token=${sharedSecret}`,
    `If your phone isn't on the same network, set up Tailscale first — see docs/tailscale.md — and use the Tailscale IP instead.`,
  ].join('\n');
}

async function runWizard({ prompt, testDiscordConnection, platform, installers, writeEnvFile, log = console.log }) {
  const gameName = (await prompt('Game name', 'Call of Duty: Mobile')).trim() || 'Call of Duty: Mobile';
  const clientId = (await prompt('Discord Application ID', '')).trim();
  if (!clientId) {
    throw new Error('A Discord Application ID is required — create one at https://discord.com/developers/applications');
  }
  const iconKey = (await prompt('Rich Presence icon asset key (optional, press enter to skip)', '')).trim() || undefined;
  const sharedSecret = generateSharedSecret();
  const port = 39393;

  log('Testing the Discord connection...');
  const testResult = await testDiscordConnection({ clientId });
  if (!testResult.ok) {
    throw new Error(`Could not connect to Discord: ${testResult.error}. Make sure Discord desktop is open and the Application ID is correct, then run setup again.`);
  }
  log(`Connected to Discord as ${testResult.username}.`);

  const config = { gameName, clientId, iconKey, sharedSecret, port };
  await writeEnvFile(config);

  const installer = installers[platform];
  let installResult = null;
  if (installer) {
    const wantsAutoStart = (await prompt(`Install auto-start on ${platform} now? (y/n)`, 'y')).trim().toLowerCase();
    if (wantsAutoStart === 'y' || wantsAutoStart === 'yes') {
      installResult = await installer(config);
      log(`Auto-start installed: ${JSON.stringify(installResult)}`);
    } else {
      log('Skipped auto-start install — run "npm start" manually whenever you want the bridge running.');
    }
  } else {
    log(`No auto-start installer available for platform "${platform}" yet — run "npm start" manually.`);
  }

  return {
    config,
    installResult,
    phoneAutomationInstructions: buildPhoneAutomationInstructions(config),
  };
}

module.exports = { generateSharedSecret, runWizard, buildPhoneAutomationInstructions };

if (require.main === module) {
  const readline = require('readline/promises');
  const fs = require('fs');
  const { Client } = require('@xhayper/discord-rpc');
  const macos = require('../src/platform/macos');
  const windows = require('../src/platform/windows');
  const linux = require('../src/platform/linux');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const projectRoot = path.join(__dirname, '..');

  const prompt = async (question, defaultValue) => {
    const suffix = defaultValue ? ` (${defaultValue})` : '';
    const answer = await rl.question(`${question}${suffix}: `);
    return answer || defaultValue || '';
  };

  const testDiscordConnection = async ({ clientId }) => {
    const client = new Client({ clientId });
    try {
      await client.login();
      const username = client.user?.username ?? 'unknown user';
      client.destroy?.();
      return { ok: true, username };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  };

  const writeEnvFile = async (config) => {
    const lines = [
      `GAME_NAME=${config.gameName}`,
      `DISCORD_APP_CLIENT_ID=${config.clientId}`,
      `ICON_KEY=${config.iconKey ?? ''}`,
      `SHARED_SECRET=${config.sharedSecret}`,
      `PORT=${config.port}`,
      '',
    ];
    fs.writeFileSync(path.join(projectRoot, '.env'), lines.join('\n'), 'utf8');
  };

  const installers = {
    darwin: (config) => macos.install({ gameName: config.gameName, projectRoot }),
    win32: (config) => windows.install({ gameName: config.gameName, projectRoot }),
    linux: (config) => linux.install({ gameName: config.gameName, projectRoot }),
  };

  runWizard({ prompt, testDiscordConnection, platform: process.platform, installers, writeEnvFile })
    .then((result) => {
      console.log('\nSetup complete!\n');
      console.log(result.phoneAutomationInstructions);
      rl.close();
    })
    .catch((err) => {
      console.error(`\nSetup failed: ${err.message}`);
      rl.close();
      process.exit(1);
    });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/setup.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests across every file (config, server, macos, windows, linux, setup).

- [ ] **Step 6: Commit**

```bash
git add bin/setup.js test/setup.test.js
git commit -m "feat: add interactive setup wizard"
```

---

### Task 8: Documentation

**Files:**
- Create: `README.md`
- Create: `docs/android-tasker.md`
- Create: `docs/ios-shortcuts.md`
- Create: `docs/tailscale.md`

**Interfaces:**
- Consumes: nothing programmatically — pure documentation, generalizing the already-verified instructions from the Portfolio repo's `scripts/codm-rpc/README.md` (CODM stays the worked example per the spec's Requirement 1, but every command uses `<Game Name>`/`<PC-IP>`/`<SHARED_SECRET>` placeholders instead of hardcoded CODM values).
- Produces: the public-facing product documentation — no other task depends on this one.

- [ ] **Step 1: Write `README.md`**

```markdown
# PocketPresence

Discord Rich Presence ("Playing X") for any mobile game that doesn't natively
support it — Call of Duty: Mobile is the motivating example throughout this
README, but nothing in the code is CODM-specific. Point PocketPresence at any
Discord Application and any game name, and it works the same way.

## Why this exists

Discord Rich Presence can only be *set* through a local connection to the
Discord **desktop** app — that's a platform limitation, not a bug. Games that
show up on Discord natively (Roblox, most PC titles) do so because the game's
own developer built Discord's SDK into their client, which runs alongside
Discord desktop on the same machine. Mobile-only games with no such
integration have no equivalent path — and no third party can add one without
patching the game client itself, which this project will never do.

**What PocketPresence actually does:** runs a small bridge on a PC that has
Discord desktop open. Your phone's own automation app (Tasker/MacroDroid on
Android, Shortcuts on iOS — no separate app needed there) tells the bridge
"the game just opened" or "just closed," and the bridge sets or clears your
Discord status accordingly. To everyone else on Discord, it looks the same as
native support.

## Requirements

- A computer that can stay on with **Discord desktop running** — it doesn't
  need to be actively in use, just on.
- [Node.js](https://nodejs.org) 18 or newer on that computer.
- A phone automation app: [Tasker](https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm)
  or [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)
  on Android, or the built-in **Shortcuts** app on iOS.
- Optional but recommended: [Tailscale](https://tailscale.com) if you want
  this to work from anywhere, not just your home WiFi (see
  `docs/tailscale.md`).

## Quickstart

```bash
git clone https://github.com/krishnaakshath/pocket-presence.git
cd pocket-presence
npm install
node bin/setup.js
```

The wizard will:

1. Ask for your game's name and your [Discord Application ID](https://discord.com/developers/applications)
   (create a free Discord Application, name it exactly what you want to show
   up in your status).
2. Generate a random shared secret so only your own phone can trigger it.
3. Live-test the Discord connection right there — you'll know immediately if
   something's wrong, instead of finding out later.
4. Offer to install auto-start for your OS (macOS LaunchAgent, Windows
   Scheduled Task, or Linux systemd `--user` unit) so the bridge comes back
   up automatically after a reboot.
5. Print the exact URLs and token to paste into your phone automation app.

Then configure your phone:
- Android: `docs/android-tasker.md`
- iOS: `docs/ios-shortcuts.md`
- Reaching the bridge when you're not on the same WiFi (e.g. on cellular
  data): `docs/tailscale.md`

## Platform support

| OS | Auto-start mechanism | Status |
|---|---|---|
| macOS | LaunchAgent | Verified end-to-end on real hardware |
| Windows | Scheduled Task (`schtasks.exe`) | Implemented against Microsoft's documented syntax; **not yet verified on real Windows hardware** |
| Linux | systemd `--user` unit | Implemented against systemd's documented mechanism; **not yet verified on real Linux hardware** |

If the Windows or Linux installer doesn't work on your machine, please open
an issue with the exact error — that's the fastest way to close the gap.

## Manual run (without auto-start)

```bash
cp config.example.env .env   # then fill in the values, or just use the wizard
npm start
```

## What this project deliberately doesn't do

- No tracking multiple games from one running instance — run a second copy
  on a second port if you need that.
- No cloud/headless-Discord hosting option — this is meant to run on a PC
  you already have, on, with Discord open.
- No ADB-based "just works, no extra app" Android detection — it was
  seriously considered, but couldn't be verified to keep working once you
  leave your home WiFi and switch to cellular data, which was a hard
  requirement. Webhook-based detection was chosen instead because it's
  verified to work regardless of network.
- No patching or reverse-engineering of any game client to add native
  Discord SDK support — that's a different (and much harder, ToS-risky)
  problem than this project takes on.

## License

MIT — see `LICENSE`.
```

- [ ] **Step 2: Write `docs/android-tasker.md`**

```markdown
# Android setup (Tasker or MacroDroid)

This assumes you've already run `node bin/setup.js` and have your PC's IP
(or Tailscale IP — see `docs/tailscale.md`), port, and shared secret ready
from the wizard's final printout.

1. Install [Tasker](https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm)
   (paid, one-time) or [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)
   (free) from the Play Store.
2. New Profile → **State → App → Application** → select your game.
3. **Enter task** → Net → HTTP Request:
   - Method: `POST`
   - URL: `http://<PC-IP>:<PORT>/start?token=<SHARED_SECRET>`
4. On the same profile, add an **Exit task** with the same HTTP Request
   action, but `/stop` instead of `/start`.

That's it — opening the game fires `/start`, closing it fires `/stop`, and
your bridge (running on the PC) handles the rest.
```

- [ ] **Step 3: Write `docs/ios-shortcuts.md`**

```markdown
# iOS setup (Shortcuts)

This assumes you've already run `node bin/setup.js` and have your PC's IP
(or Tailscale IP — see `docs/tailscale.md`), port, and shared secret ready
from the wizard's final printout.

iOS's app-open/close automation is real and built in, but Apple's own
community has noted it's occasionally slower or less reliable than
Android's — expect it to work, just not always instantly.

1. Open **Shortcuts** → **Automation** tab → **+** → **Create Personal
   Automation**.
2. Choose **App** → select your game → **Is Opened**.
3. Add action **Get Contents of URL**:
   - URL: `http://<PC-IP>:<PORT>/start?token=<SHARED_SECRET>`
   - Method: `POST`
4. Turn off **Ask Before Running** so it fires silently.
5. Repeat with a second automation using **Is Closed** → same URL with
   `/stop` instead of `/start`.
```

- [ ] **Step 4: Write `docs/tailscale.md`**

```markdown
# Reaching the bridge from anywhere (Tailscale)

By default, your phone can only reach the PC running PocketPresence if
they're on the same WiFi network — that breaks the moment you're playing on
cellular data with WiFi off.

[Tailscale](https://tailscale.com) fixes this: it's a free-for-personal-use
VPN mesh network that lets your devices reach each other over *any* internet
connection, including cellular, without exposing anything to the public
internet or needing router port-forwarding.

1. Install Tailscale on both your phone and the PC running the bridge.
2. Sign into the same Tailscale account on both.
3. Find the PC's Tailscale IP (a `100.x.x.x` address, shown in the Tailscale
   app) instead of its regular local network IP.
4. Use that IP in your Tasker/MacroDroid/Shortcuts URLs (`docs/android-tasker.md`,
   `docs/ios-shortcuts.md`) — everything else stays the same.

This is the setup that makes PocketPresence work "from anywhere," matching
the requirement that started this whole design: it shouldn't matter whether
you're on your home WiFi or out on mobile data.
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/android-tasker.md docs/ios-shortcuts.md docs/tailscale.md
git commit -m "docs: add README and phone setup guides"
```

---

## Final verification

- [ ] Run `npm test` from the project root — expect all tests across Tasks 2–7 to pass.
- [ ] Run `npm start` with a real `.env` (created via `node bin/setup.js` against your own Discord Application) and confirm the console logs `Connected to Discord as <your username>.` — this is the one thing that needs a real Discord desktop client running to observe directly.
- [ ] `git log --oneline` should show one commit per task, in order.
- [ ] Push to `origin main` on `https://github.com/krishnaakshath/pocket-presence`.
