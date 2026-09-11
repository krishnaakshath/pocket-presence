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
