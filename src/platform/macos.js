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
