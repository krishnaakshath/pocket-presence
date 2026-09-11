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
