// Services the Status tab can check. `host` is pinged directly from your
// network; `statuspage` (when the company publishes a public Atlassian
// Statuspage) adds their official status. `dd` is the Downdetector slug
// for a "see reports" link (free to view in the browser).
export const SERVICES = [
  { id: 'netflix', name: 'Netflix', host: 'www.netflix.com', dd: 'netflix' },
  { id: 'youtube', name: 'YouTube', host: 'www.youtube.com', dd: 'youtube' },
  { id: 'psn', name: 'PlayStation Network', host: 'www.playstation.com', dd: 'playstation-network' },
  { id: 'xbox', name: 'Xbox Live', host: 'www.xbox.com', dd: 'xbox-live' },
  { id: 'xfinity', name: 'Xfinity', host: 'www.xfinity.com', dd: 'comcast-xfinity' },
  { id: 'google', name: 'Google', host: 'www.google.com', dd: 'google' },
  { id: 'apple', name: 'Apple / iCloud', host: 'www.apple.com', dd: 'icloud' },
  { id: 'spotify', name: 'Spotify', host: 'open.spotify.com', dd: 'spotify' },
  { id: 'instagram', name: 'Instagram', host: 'www.instagram.com', dd: 'instagram' },
  { id: 'tiktok', name: 'TikTok', host: 'www.tiktok.com', dd: 'tiktok' },
  { id: 'amazon', name: 'Amazon', host: 'www.amazon.com', dd: 'amazon' },
  { id: 'hulu', name: 'Hulu', host: 'www.hulu.com', dd: 'hulu' },
  { id: 'disney', name: 'Disney+', host: 'www.disneyplus.com', dd: 'disney-plus' },
  { id: 'discord', name: 'Discord', host: 'discord.com', statuspage: 'discordstatus.com', dd: 'discord' },
  { id: 'reddit', name: 'Reddit', host: 'www.reddit.com', statuspage: 'www.redditstatus.com', dd: 'reddit' },
  { id: 'twitch', name: 'Twitch', host: 'www.twitch.tv', statuspage: 'status.twitch.com', dd: 'twitch' },
  { id: 'epic', name: 'Epic Games / Fortnite', host: 'www.epicgames.com', statuspage: 'status.epicgames.com', dd: 'fortnite' },
  { id: 'zoom', name: 'Zoom', host: 'zoom.us', statuspage: 'status.zoom.us', dd: 'zoom' },
  { id: 'github', name: 'GitHub', host: 'github.com', statuspage: 'www.githubstatus.com', dd: 'github' },
  { id: 'dropbox', name: 'Dropbox', host: 'www.dropbox.com', statuspage: 'status.dropbox.com', dd: 'dropbox' },
  { id: 'claude', name: 'Claude', host: 'claude.ai', statuspage: 'status.claude.com' },
  { id: 'cloudflare', name: 'Cloudflare', host: 'www.cloudflare.com', statuspage: 'www.cloudflarestatus.com', dd: 'cloudflare' },
];
