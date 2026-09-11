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
