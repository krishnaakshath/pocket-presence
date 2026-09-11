# Android setup (Tasker or MacroDroid)

This assumes you've already run `node bin/setup.js` and have your PC's IP
(or Tailscale IP — see `docs/tailscale.md`), port, and shared secret ready
from the wizard's final printout.

1. Install [Tasker](https://play.google.com/store/apps/details?id=net.dinglisch.android.taskerm)
   (paid, one-time) or [MacroDroid](https://play.google.com/store/apps/details?id=com.arlosoft.macrodroid)
   (free) from the Play Store.
2. New Profile → **State → App → Application** → select your game.
3. **Enter task** → Net → HTTP Request:
   - Method: `POST`
   - URL: `http://<PC-IP>:<PORT>/start?token=<SHARED_SECRET>`
4. On the same profile, add an **Exit task** with the same HTTP Request
   action, but `/stop` instead of `/start`.

That's it — opening the game fires `/start`, closing it fires `/stop`, and
your bridge (running on the PC) handles the rest.
