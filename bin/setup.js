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
