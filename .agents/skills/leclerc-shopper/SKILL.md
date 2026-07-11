---
name: leclerc-shopper
description: >
  Automatise les courses sur le site e.leclerc en utilisant Playwright et une session Chrome active.
  Trigger this skill when the user asks to "faire les courses", "acheter sur leclerc", "ajouter au panier leclerc".
---

# Leclerc Shopper Skill

This skill automates adding items to a user's cart on https://www.e.leclerc/ by hijacking an already-connected Chrome session via Chrome DevTools Protocol (CDP).

## Prerequisites

For this skill to work, the user **MUST** launch their Chrome/Brave browser with the remote debugging flag enabled and **MUST** already be logged in to their e.leclerc account with a selected store/drive.
If they haven't done this, the script will fail.

**Mac Chrome Launch Command:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

## How to use

1. Ask the user for the list of items they want to buy.
2. Ensure the user has launched Chrome with the `--remote-debugging-port=9222` flag.
3. Execute the `shopper.py` script located in the `scripts/` folder of this skill, passing the items as a comma-separated string:
   ```bash
   python /Users/mac/Work/hermes_hackaton_discord/.agents/skills/leclerc-shopper/scripts/shopper.py "lait, oeufs, pain de mie, beurre"
   ```
4. The script will output the result of the cart additions.

## Error Handling
- If the script fails to connect to port 9222, instruct the user to close all Chrome windows completely and relaunch via terminal with the provided debug flag.
- e.leclerc is heavily protected against bots. Using an already logged-in session via CDP usually bypasses basic protections, but if it fails, instruct the user to solve any captcha manually in the open browser.
