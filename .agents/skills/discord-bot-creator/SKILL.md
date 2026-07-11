---
name: discord-bot-creator
description: >
  Creates a Discord bot automatically using Playwright to tap into the user's active Chrome session.
  Trigger when the user asks to "create a new discord bot", "auto-create bot", or "setup a new discord app".
---

# Auto Discord Bot Creator

This skill automates the creation of a Discord Application and Bot by hijacking an already-connected Chrome session via Chrome DevTools Protocol (CDP).

## Prerequisites

For this skill to work, the user **MUST** launch their Chrome/Brave browser with the remote debugging flag enabled.
If they haven't done this, the script will fail to connect.

**Mac Chrome Launch Command:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

## How to use

1. Ask the user for the desired name of the new bot.
2. Ensure the user has launched Chrome with the `--remote-debugging-port=9222` flag and is logged into the Discord Developer Portal in that browser session.
3. Execute the `create_bot.py` script located in the `scripts/` folder of this skill:
   ```bash
   python /Users/mac/Work/hermes_hackaton_discord/.agents/skills/discord-bot-creator/scripts/create_bot.py "My Bot Name"
   ```
4. The script will output the bot token to `stdout` upon success, e.g., `BOT_TOKEN=...`.
5. Capture this token and proceed to use it for the user's workflow (e.g., configuring `.env` or initializing a subagent).

## Error Handling
- If the script fails to connect to port 9222, instruct the user to close all Chrome windows completely and relaunch via terminal with the provided debug flag.
- If the automation fails to click an element, the DOM might have changed. A screenshot will be saved to `error_screenshot.png` for debugging.
