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
  assert.deepEqual(calls, [
    ['--user', 'daemon-reload'],
    ['--user', 'enable', 'pocket-presence-call-of-duty-mobile.service'],
    ['--user', 'restart', 'pocket-presence-call-of-duty-mobile.service'],
  ]);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
