# PocketPresence — design spec

**Date:** 2026-09-11
**Status:** drafted from a fully-worked-through discussion (every decision
below — generic engine, webhook-over-ADB, Tailscale, cross-platform caveats
— was reached through iteration, not assumed). Proceeding to the
implementation plan; flag anything here that doesn't match your intent.

## Problem

Discord Rich Presence ("Playing X") can only be *set* via a local IPC
connection to a Discord **desktop** client (Windows/Mac/Linux) — this is
Discord's own platform architecture (confirmed: every Rich Presence SDK,
including Discord's own `discord-rpc` and modern forks like
`@xhayper/discord-rpc`, targets desktop platforms only). Games that natively
support this (Roblox, most PC titles) do so because the *game developer*
built Discord's SDK directly into their own client, which runs on the same
machine as Discord desktop. Mobile-only games with no native integration —
Call of Duty: Mobile is the motivating example — have no such path, and no
third party can add native support without patching the game itself (which
would violate the publisher's ToS and isn't something this project will do).

**What's actually achievable:** a bridge that runs on a PC with Discord
desktop open, exposing a way to be told "the game just started / just
stopped," which it translates into setting/clearing a Rich Presence
activity via Discord's official local RPC connection. The phone triggers
that bridge automatically, so from the player's and their friends'
perspective the result looks the same as native support, even though the
mechanism is different.

## Requirements (confirmed through discussion)

1. **Generic engine, not CODM-specific code.** Game name, Discord
   Application ID, and icon asset key are all configuration, not hardcoded
   values — anyone can point this at their own Discord Application for any
   game. CODM is the primary worked example throughout docs, since that's
   the motivating use case, but nothing in the code assumes it.
2. **Plain cloneable GitHub repo**, not an npm-published package (confirmed
   decision — lower maintenance surface, no registry to manage).
3. **Interactive setup wizard** (`node bin/setup.js`) — no manual `.env`
   editing. Walks through: game name, Discord Application ID, icon key,
   auto-generated shared secret, live Discord-connection test during setup
   (immediate pass/fail, not discovered later), OS auto-start service
   installation, and prints the exact phone-automation config (URLs, token)
   with real values already filled in.
4. **Must work from anywhere, including cellular data with WiFi off** — this
   ruled out one candidate mechanism (see below) and is now a hard
   constraint on the chosen design, not a nice-to-have.
5. **Cross-platform auto-start**: macOS (LaunchAgent), Windows (Scheduled
   Task), Linux (systemd user unit). macOS path is implemented against a
   configuration already built and verified end-to-end on a real machine
   during this project's exploration phase. Windows/Linux are implemented
   against each platform's standard, documented mechanism, but **not
   personally verified on real Windows/Linux hardware** — this is stated
   plainly in the README and code comments so it's an known, visible gap
   rather than a silent assumption, and gets fixed from real user reports
   rather than guesswork.

## Detection mechanism — the decision that took the most iteration

Two mechanisms were evaluated for "how does the bridge learn the game
opened/closed":

| Mechanism | Platforms | Extra app on phone? | Works on cellular data (WiFi off)? |
|---|---|---|---|
| **Webhook**: phone automation app (Tasker/MacroDroid on Android, Shortcuts on iOS — built into iOS) sends an HTTP POST to the bridge on open/close | Android + iOS | Yes (Android only — iOS's is built-in) | **Yes** — verified as a normal app/network capability with no WiFi-only constraint |
| **ADB polling**: bridge polls the phone directly via `adb shell dumpsys activity activities` (a real, official, non-jailbreak Android capability — verified) | Android only | No | **Unverified, likely unreliable** — Android's Wireless Debugging feature is documented and designed around same-WiFi-network use; whether it stays active/reachable with WiFi off and only cellular data active could not be confirmed, and a feature that silently stops working the moment you leave home WiFi is worse than one that's always been clear about needing one extra app |

**Decision: webhook only.** ADB polling was genuinely attractive (no extra
app needed on Android) but was dropped once "must work from anywhere,
including cellular data" became a hard requirement — it's the one mechanism
that couldn't be verified to meet that bar, and shipping an unreliable
"simpler" path would be worse than the slightly-more-setup reliable one.

**Reachability across networks:** both the phone and the PC need to reach
each other regardless of mechanism. [Tailscale](https://tailscale.com)
(free for personal use, a proper VPN mesh network, works over any internet
connection including cellular) is the recommended solution, documented as
part of the core setup flow — not an optional afterthought — since "works
from anywhere" is a hard requirement now, not a nice-to-have.

## Architecture

```
pocket-presence/
├── README.md                    — product-quality: what it is, quickstart, screenshots/GIF later
├── LICENSE                       — MIT
├── package.json
├── bin/
│   └── setup.js                  — interactive wizard (see flow below)
├── src/
│   ├── server.js                 — HTTP bridge + Discord RPC connection; fully config-driven
│   ├── config.js                 — loads/validates .env
│   └── platform/
│       ├── macos.js              — generates + loads a LaunchAgent plist
│       ├── windows.js            — generates + registers a Scheduled Task
│       └── linux.js              — generates + enables a systemd --user unit
├── config.example.env
├── .gitignore                     — node_modules/, .env, *.log
└── docs/
    ├── android-tasker.md
    ├── ios-shortcuts.md
    └── tailscale.md
```

`src/server.js` is a generalized version of the already-built and verified
CODM bridge: same `/start` and `/stop` HTTP endpoints, same shared-secret
timing-safe check, same Discord RPC connect/reconnect handling — the only
change is that game name, Application ID, and icon key come from config
instead of being fixed values.

## Setup wizard flow (`node bin/setup.js`)

1. Prompt: game name (example default shown: "Call of Duty: Mobile"),
   Discord Application ID, optional icon asset key.
2. Auto-generate the shared secret (`crypto.randomBytes`).
3. **Live-test the Discord connection immediately** — attempts to connect
   right there in the wizard, so a bad Application ID or Discord-desktop-not-
   running is caught during setup, not discovered later.
4. Detect the OS (`process.platform`) → offer to install the auto-start
   service automatically (writes and registers the LaunchAgent/Scheduled
   Task/systemd unit as appropriate).
5. Print the exact Tasker/Shortcuts configuration needed — real IP (or
   prompts to set up Tailscale first and use that IP instead), real port,
   real generated token — ready to paste into the automation app, no manual
   substitution required.

## Explicit non-goals (YAGNI)

- No multi-game-at-once configuration in a single running instance — want
  to track two games? Run two instances on two ports. Adding this later is
  easy if actually needed; building it now with only one real use case is
  premature.
- No cloud/always-on virtual desktop option for running Discord headless —
  disproportionate cost and complexity relative to what it buys over "a PC
  you already have, on, with Discord open."
- No ADB-based detection (see decision above) — dropped for reliability
  reasons, not implementation difficulty.
- No attempt to patch or reverse-engineer any game client to add native
  Discord SDK calls — this is a bridge tool, not a game modification tool,
  and doing the latter would raise real ToS and anti-cheat-detection
  concerns this project isn't taking on.

## Testing / verification plan

- `server.js`, shared-secret check, Discord RPC connect/reconnect: already
  proven end-to-end on real hardware (this is a generalization of code
  that's currently running and verified working).
- macOS platform installer: already proven end-to-end (LaunchAgent
  currently loaded and running on real hardware as part of this project's
  exploration).
- Windows/Linux platform installers: implemented against each platform's
  official, documented service-registration mechanism; **explicitly flagged
  as unverified on real hardware** in both code comments and the README,
  with a clear ask for real-user bug reports to close the gap.
- Setup wizard: fully testable in any environment (prompts, config writing,
  live Discord-connection test) except the OS-service-installation step,
  for the same "needs real target hardware" reason as above.

## Related, separate effort

A written technical proposal for native Discord Rich Presence support in
Call of Duty: Mobile, aimed at Activision/Garena/Tencent and Discord's own
developer-relations channel, is being produced as a parallel but separate
deliverable — not part of this repo's code, since it's a document, not
software. Expectations are set plainly there: this is a long-shot outreach
effort with real but low odds of being acted on, valuable regardless as a
piece of technical writing, and using this project's own bridge as
supporting proof-of-concept evidence.
