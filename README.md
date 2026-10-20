# Speedy

A private, ad-free speed test you install on your iPhone or Mac home screen. It's free to run: there's no server, no account and no subscription.

## What it does

| Tab | What you get |
|---|---|
| **Speed** | Download, upload, ping and jitter, plus a lag-when-busy grade (bufferbloat), a check against your plan, and what the connection handles (4K, video calls, gaming). |
| **Video** | Plays simulated video at 360p, 480p, 720p, 1080p, 1440p and 4K and shows which qualities stream without buffering. |
| **Status** | Checks whether services (Netflix, PSN, Xfinity and more) are reachable from your network, plus the official status page for services that publish one. Links to Downdetector's free web reports. |
| **Map** | Upload a floor plan, drop a pin for each room and test from each one. Pins turn red at dead spots. |
| **History** | Charts, typical speeds, % of tests that hit your plan, cost per Mbps, slowest time of day, Wi-Fi vs cellular, CSV export and the outage log. |

## Free replacements for paid or app-only features

- **Test servers:** Cloudflare's free public speed-test endpoints (`speed.cloudflare.com`).
- **Downdetector:** direct reachability checks from your own network, public Statuspage APIs, and links to Downdetector's website.
- **Widgets:** the last download speed shows as a badge on the app icon.
- **Wi-Fi vs cellular detection:** guessed from your provider's name, with a manual switch.
- **Outage log:** logs drops while Speedy is open. Leave it open on a Mac or a spare phone to log around the clock.

## Put it online (free, about 5 minutes)

1. On github.com, create a new **public** repository named `speedy`.
2. Click **uploading an existing file** and drag in everything from this folder, including the `js` and `icons` folders. Then click **Commit changes**.
3. Go to **Settings → Pages**. Under "Branch," choose `main` and `/ (root)`, then click **Save**.
4. After a minute or two, Speedy is live at `https://<your-username>.github.io/speedy/`.

## Install it

- **iPhone:** open the link in Safari, tap **Share → Add to Home Screen**.
- **Mac:** open the link in Safari, choose **File → Add to Dock**.

## Privacy

Results, rooms, floor plans and outage logs are stored only on your device (IndexedDB). Cloudflare sees each speed test, as any speed test site would. Your provider name comes from Cloudflare, with ipinfo.io as a backup.

## Later: native app

Making a native iPhone/Mac app would add real home-screen and menu-bar widgets, automatic Wi-Fi vs cellular detection, and around-the-clock background outage logging. That requires the $99/year Apple Developer Program.
