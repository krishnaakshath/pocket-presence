# Reaching the bridge from anywhere (Tailscale)

By default, your phone can only reach the PC running PocketPresence if
they're on the same WiFi network — that breaks the moment you're playing on
cellular data with WiFi off.

[Tailscale](https://tailscale.com) fixes this: it's a free-for-personal-use
VPN mesh network that lets your devices reach each other over *any* internet
connection, including cellular, without exposing anything to the public
internet or needing router port-forwarding.

1. Install Tailscale on both your phone and the PC running the bridge.
2. Sign into the same Tailscale account on both.
3. Find the PC's Tailscale IP (a `100.x.x.x` address, shown in the Tailscale
   app) instead of its regular local network IP.
4. Use that IP in your Tasker/MacroDroid/Shortcuts URLs (`docs/android-tasker.md`,
   `docs/ios-shortcuts.md`) — everything else stays the same.

This is the setup that makes PocketPresence work "from anywhere," matching
the requirement that started this whole design: it shouldn't matter whether
you're on your home WiFi or out on mobile data.
