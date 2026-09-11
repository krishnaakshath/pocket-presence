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
