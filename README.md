# Personal Dashboard

A set of small, self-contained HTML apps that share a top bar.

## Deploy your own copy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FRowanThistlebrooke%2FYTdashh1)

One click → Vercel signs you in, copies the repo to your GitHub, and deploys it. ~30 seconds to a live URL.

## How to use

Open any `.html` file directly in your browser — no build step, no install.

| File | What it is |
|---|---|
| [index.html](index.html) | Goals tracker (Day Ring, Goal Ticker, To Do list) — the home page |
| [health.html](health.html) | Supplement / daily stack tracker |
| [po-water.html](po-water.html) | Water intake tracker |
| [finance.html](finance.html) | Finances |
| [gym.html](gym.html) | Progressive overload gym tracker |
| [topbar.js](topbar.js) | Shared top bar — auto-injected into pages that `<script src="topbar.js">` |

Each app stores its own state in browser `localStorage`. No accounts, no server.

## Connecting Garmin (steps)

`gym.html` shows a "Pas (Garmin)" card, fed by [api/garmin-data.py](api/garmin-data.py). Garmin has no public consumer OAuth (unlike WHOOP), so this uses the unofficial `garminconnect` client against a token you generate once, locally — your Garmin password is never sent anywhere but Garmin itself, and never touches Vercel or this repo.

One-time setup:

1. In `garmin_mcp-main/garmin_mcp-main`, install the project (`pip install -e .` or `uv sync`) and run `garmin-mcp-auth`. It asks for your Garmin email/password (and an MFA code if you have 2FA), then saves OAuth tokens to `~/.garminconnect` (`%USERPROFILE%\.garminconnect` on Windows). These tokens are what's reused going forward — your password isn't stored anywhere after this step.
2. Zip that token directory and base64-encode it. PowerShell:
   ```powershell
   Compress-Archive -Path "$env:USERPROFILE\.garminconnect\*" -DestinationPath "$env:TEMP\garmin_tokens.zip" -Force
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("$env:TEMP\garmin_tokens.zip")) | Set-Content "$env:TEMP\garmin_tokens_b64.txt" -NoNewline
   ```
3. In the Vercel project settings, add an environment variable `GARMIN_TOKENS_B64` with the contents of `garmin_tokens_b64.txt`, then redeploy.
4. The steps card on `gym.html` starts working automatically — no code change needed.

Tokens last about 6 months (Garmin's own limit); when the card silently stops updating, redo steps 1-3.

## Building from scratch

[BUILD_DASHBOARD.md](BUILD_DASHBOARD.md) is the prompt I gave Claude to generate `index.html` — paste it into Claude if you want to rebuild that page yourself.
