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
// on real Linux hardware — if `systemctl --user` fails on your distro
// (e.g. lingering not enabled), please open an issue with the error.
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
  // daemon-reload picks up unit file changes, enable is idempotent and keeps
  // it starting on future logins, and restart unconditionally bounces an
  // already-running unit so it re-reads the freshly written .env.
  runSystemctl(['--user', 'daemon-reload']);
  runSystemctl(['--user', 'enable', `${name}.service`]);
  runSystemctl(['--user', 'restart', `${name}.service`]);

  return { name, unitPath };
}

module.exports = { serviceName, generateUnit, install };
