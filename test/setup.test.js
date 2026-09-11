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

test('buildPhoneAutomationInstructions uses a real local IP when one is provided', () => {
  const text = buildPhoneAutomationInstructions({
    gameName: 'Call of Duty: Mobile',
    sharedSecret: 'abc123',
    port: 39393,
    localIp: '192.168.1.42',
  });
  assert.match(text, /http:\/\/192\.168\.1\.42:39393\/start\?token=abc123/);
  assert.match(text, /http:\/\/192\.168\.1\.42:39393\/stop\?token=abc123/);
  assert.doesNotMatch(text, /<this-machine-IP>/);
});
