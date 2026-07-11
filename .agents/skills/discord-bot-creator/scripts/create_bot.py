import sys
import time
from playwright.sync_api import sync_playwright

def create_bot(app_name: str):
    with sync_playwright() as p:
        print("Connecting to Chrome on port 9222...")
        try:
            browser = p.chromium.connect_over_cdp("http://localhost:9222")
        except Exception as e:
            print("ERROR: Could not connect to Chrome on port 9222.")
            print("Please make sure you launched Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222")
            print(f"Details: {e}")
            sys.exit(1)

        # Get the first context
        context = browser.contexts[0]
        page = context.new_page()

        print("Navigating to Discord Developer Portal...")
        page.goto("https://discord.com/developers/applications")
        
        try:
            # Wait a bit for it to load
            page.wait_for_selector('text="New Application"', timeout=10000)
            print("Clicking 'New Application'...")
            page.locator('text="New Application"').first.click()

            print(f"Entering application name: {app_name}")
            # Discord's modal has an input field. We can target the first text input in the modal.
            page.locator('input[type="text"]').first.fill(app_name)
            
            # Check the "I agree" checkbox if present
            checkbox = page.locator('input[type="checkbox"]')
            if checkbox.count() > 0:
                checkbox.first.check()

            print("Clicking 'Create'...")
            # Click the submit button inside the modal
            # Often it's a primary button. 
            page.get_by_role("button", name="Create").first.click()

            # Wait for navigation to the new application's page
            page.wait_for_url(r"**/applications/**", timeout=10000)
            
            print("Navigating to Bot tab...")
            # Click the 'Bot' tab in the left sidebar
            page.get_by_text("Bot", exact=True).first.click()
            
            print("Resetting Token...")
            reset_btn = page.get_by_role("button", name="Reset Token")
            reset_btn.wait_for(state="visible", timeout=10000)
            reset_btn.click()
            
            print("Confirming token reset...")
            yes_btn = page.get_by_role("button", name="Yes, do it!")
            if yes_btn.count() > 0:
                yes_btn.first.click()
            
            print("Waiting for token to be generated...")
            # After reset, a "Copy" button appears next to the token, or the token is visible in a code block.
            # We can find the text "Copy" and assume the token is in the DOM.
            copy_btn = page.get_by_role("button", name="Copy")
            copy_btn.wait_for(state="visible", timeout=10000)
            
            # Since the token itself might be obscured or in a readonly input, we can just click "Copy" 
            # and read it from the clipboard, OR we can extract it if it's visible. 
            # Actually, Discord Developer Portal injects the token text into the DOM.
            # We can use javascript to read clipboard if context allows, or just scrape the token element.
            # Wait for a bit for the token to render.
            time.sleep(2)
            
            # Discord puts the token in a <code> block or a text field. 
            # Let's find the container next to the copy button.
            # A fallback is just to extract all code blocks and find the longest one, which is usually the token.
            code_blocks = page.locator("code").all_inner_texts()
            token = ""
            for text in code_blocks:
                if len(text) > 50 and "." in text:  # Discord tokens are long and contain dots
                    token = text
                    break
            
            if not token:
                print("Could not scrape the token directly from the page. Clicking Copy button to copy it to your clipboard.")
                copy_btn.first.click()
                print("Token is in your clipboard!")
            else:
                print("\n=== SUCCESS ===")
                print(f"BOT_TOKEN={token}")
                print("===============\n")
                
        except Exception as e:
            print(f"Automation failed: {e}")
            page.screenshot(path="error_screenshot.png")
            print("Saved error screenshot to error_screenshot.png")
            sys.exit(1)
        finally:
            page.close()
            # DON'T close the browser, as it's the user's active Chrome!
            # browser.close() will kill their Chrome session if CDP owns it, though connect_over_cdp usually just disconnects.
            browser.disconnect()

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python create_bot.py <BotName>")
        sys.exit(1)
    
    app_name = sys.argv[1]
    create_bot(app_name)
