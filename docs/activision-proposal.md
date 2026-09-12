# Proposal: Native Discord Rich Presence Support for Call of Duty: Mobile

**Author:** krishnaakshath
**Date:** 2026-09-12 (updated 2026-09-13 — see the Discord Social SDK 1.10 section below)
**Status:** Draft, ready to submit
**Supporting evidence:** [PocketPresence](https://github.com/krishnaakshath/pocket-presence) — a working, open-source proof-of-concept

---

## The ask, in one sentence

Integrate Discord's **Social SDK** (version 1.10+, generally available since
August 2026) into Call of Duty: Mobile's Android and iOS clients, so
players' "Playing Call of Duty: Mobile" status — including game mode and
party info — appears automatically on Discord, natively from the phone,
with no PC, no phone automation, and no third-party tooling required.

## The problem

Call of Duty: Mobile has no native Discord integration. Players who want
friends to see they're playing currently have no option, even though:

- Discord's Social SDK now has **general-availability mobile support**
  (Android 7.0+, iOS 15.1+, since v1.10 in August 2026) with Rich Presence
  built in — this isn't a request for Discord to build something new, it's
  a request for CODM to adopt something that already ships today.
- CODM has an active, Activision-adopted Discord community
  (`discord.gg/codmobile`) — the exact audience this feature would serve is
  already gathered on the platform it would integrate with.
- Player demand for this specific feature is real and documented (a support
  thread on Discord's own community forums explicitly requests CODM Rich
  Presence support).

## Why this is a stronger ask now: Discord Social SDK 1.10

This proposal was originally written pointing at Discord's Rich Presence
tooling in general terms. Since then, a directly relevant update landed:
**Discord Social SDK version 1.10 reached general availability in August
2026 with full mobile platform support** — this removes the single biggest
objection a studio could raise (that mobile-native Rich Presence "isn't
really possible yet").

What's confirmed, directly from Discord's own developer documentation:

- **Supported today:** Android 7.0+ and iOS 15.1+, with SDK support for
  standalone C++, Unity, and Unreal Engine.
- **On Android, it's radically simple:** a game can publish Rich Presence
  directly from the phone with the Discord app merely installed and signed
  in — **no account-linking step, no PC, no companion app of any kind.**
- **On iOS**, one-time account linking is required, but the whole flow still
  runs entirely on-device — again, no desktop companion.
- **It reports real game state**, not just "app open" — Discord's own
  description explicitly calls out **game mode and party status** as part
  of what gets shown. That's the exact Multiplayer/Ranked/Battle Royale
  distinction PocketPresence structurally cannot provide (see the
  comparison below), because a third-party bridge only ever sees
  "app running," never what's actually happening inside a match.

In short: the technology this proposal asks for isn't hypothetical or
years away — it shipped this year, is documented, and is already built for
the exact engines CODM is likely to be running on.

## Proof it's technically straightforward and worth building

Rather than just ask for this in the abstract, I built a working
demonstration: **[PocketPresence](https://github.com/krishnaakshath/pocket-presence)**,
a small open-source bridge that already delivers the player-facing result —
automatic "Playing Call of Duty: Mobile" Discord status, no manual
toggling — using a phone-automation trigger and Discord's existing local RPC
connection.

<p align="center">
  <img src="images/discord-rich-presence-demo.png" alt="Discord showing 'Playing Call of Duty Mobile — In-Game' with an elapsed timer" width="420">
</p>

This is real, running output — not a mockup. It proves two things:

1. **Players want this and will build for it themselves** when there's no
   official path — that's a signal worth acting on, not ignoring.
2. **The player-facing result is genuinely simple** — a title, an elapsed
   timer, an icon. This isn't a request for something exotic; it's asking
   for the same baseline experience already standard across PC gaming.

## Why a third-party bridge is a poor substitute for native support

PocketPresence works, but every one of its limitations disappears the
moment this is built into the game client instead of bolted on externally:

| Limitation of the third-party bridge | Solved automatically by native SDK integration |
|---|---|
| Requires a separate PC running 24/7 with Discord desktop open | Runs directly from the game client — no separate always-on machine needed |
| Requires manual phone-automation setup (Tasker/MacroDroid/Shortcuts) | Zero player setup — works the moment both apps are installed |
| Can only detect "app open" / "app closed" — no match type, mode, or score | Native integration can expose actual game state: match type (Multiplayer/Ranked/Battle Royale), score, party size, matchmaking status |
| A community workaround, not an official, supported feature | An official, maintained, Activision-branded feature |

## What implementation actually involves

Discord's [Social SDK](https://docs.discord.com/developers/discord-social-sdk/overview)
is free and publicly documented — start here:
[Rich Presence on Mobile](https://docs.discord.com/developers/discord-social-sdk/core-concepts/mobile).
It's designed for exactly this: exposing rich, structured presence data
(game mode, party status — not just "open/closed," unlike a third-party
bridge) directly from the game client on both Android and iOS. Since CODM
already has an Activision-registered Discord presence (the community
server), the account/branding setup that normally takes the most time is
already in place. The remaining work is engine-side integration —
non-trivial, but a known, bounded task against a maintained SDK, not
open-ended R&D.

## Submission

This proposal is submitted through the following channels, in order of
likely reach:

1. **CODM's official Discord community** (`discord.gg/codmobile`) — posted
   for visibility with the community team and other players, since this is
   the audience and channel Activision already actively manages for CODM.
2. **Activision Support feedback form**
   (`support.activision.com/feedback-and-bug-report`, Call of Duty: Mobile)
   — filed as a formal feature request with this document linked.
3. **Discord's own developer/business contact form**
   (`discord.com/developers/contact-us`) — submitted noting that Discord
   itself just shipped mobile Social SDK support (v1.10, August 2026) and
   is presumably looking for exactly this kind of high-profile mobile title
   to showcase it with.

## Expectations, honestly

This is a long-shot outreach effort, not a submission with a guaranteed or
even likely response — the Social SDK's mobile GA makes the *technical*
case much stronger, but it doesn't change the actual bottleneck: there is
no dedicated feature-suggestion channel at Activision or TiMi Studio
(CODM's actual developer), and no known precedent of a fan-built bridge
leading to native adoption in any game. It's worth
doing anyway: the cost is low, the evidence is real and freely reusable by
anyone who wants to make the same case, and if it never gets a reply, the
open-source bridge still solves the problem for anyone willing to set it up
themselves.
