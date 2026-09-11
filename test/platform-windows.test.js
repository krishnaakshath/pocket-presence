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
