# iOS setup (Shortcuts)

This assumes you've already run `node bin/setup.js` and have your PC's IP
(or Tailscale IP — see `docs/tailscale.md`), port, and shared secret ready
from the wizard's final printout.

iOS's app-open/close automation is real and built in, but Apple's own
community has noted it's occasionally slower or less reliable than
Android's — expect it to work, just not always instantly.

1. Open **Shortcuts** → **Automation** tab → **+** → **Create Personal
   Automation**.
2. Choose **App** → select your game → **Is Opened**.
3. Add action **Get Contents of URL**:
   - URL: `http://<PC-IP>:<PORT>/start?token=<SHARED_SECRET>`
   - Method: `POST`
4. Turn off **Ask Before Running** so it fires silently.
5. Repeat with a second automation using **Is Closed** → same URL with
   `/stop` instead of `/start`.
