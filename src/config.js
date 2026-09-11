function loadConfig(env = process.env) {
  const gameName = env.GAME_NAME;
  const clientId = env.DISCORD_APP_CLIENT_ID;
  const sharedSecret = env.SHARED_SECRET;
  const iconKey = env.ICON_KEY || undefined;
  const port = Number(env.PORT) || 39393;

  const missing = [];
  if (!gameName) missing.push('GAME_NAME');
  if (!clientId) missing.push('DISCORD_APP_CLIENT_ID');
  if (!sharedSecret) missing.push('SHARED_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(', ')}. Run "node bin/setup.js" or copy config.example.env to .env and fill it in.`
    );
  }

  return { gameName, clientId, sharedSecret, iconKey, port };
}

module.exports = { loadConfig };
