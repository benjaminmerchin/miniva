import asyncio
from playwright.async_api import async_playwright
import sys

async def shop(items_str):
    items = [item.strip() for item in items_str.split(',') if item.strip()]
    print(f"🛒 Items to buy: {items}")
    
    async with async_playwright() as p:
        try:
            print("🔗 Connecting to active Chrome session on port 9222...")
            browser = await p.chromium.connect_over_cdp("http://localhost:9222")
            context = browser.contexts[0]
            page = await context.new_page()
            
            for item in items:
                print(f"\n🔍 Searching for: {item}")
                await page.goto("https://www.e.leclerc/")
                
                # Wait for the search input. Leclerc often uses id="recherche" or standard input[type="search"]
                try:
                    search_input = page.locator('input[type="search"]').first
                    await search_input.wait_for(state="visible", timeout=5000)
                    await search_input.fill(item)
                    await search_input.press("Enter")
                except Exception as e:
                    print(f"⚠️ Search bar not found for {item}. Trying alternative selector...")
                    search_input = page.locator('input[name="q"], input[placeholder*="recherch" i]').first
                    await search_input.wait_for(state="visible", timeout=5000)
                    await search_input.fill(item)
                    await search_input.press("Enter")
                
                # Wait for search results to load
                await page.wait_for_timeout(4000)
                
                # Attempt to find the first "Ajouter" button (often used in French e-commerce for add to cart)
                # We try different possible selectors
                add_buttons = page.locator('button:has-text("Ajouter"), button:has-text("AJOUTER")')
                
                if await add_buttons.count() > 0:
                    try:
                        await add_buttons.first.click(timeout=3000)
                        print(f"✅ Added '{item}' to cart!")
                        # Wait a bit for the cart animation or popup
                        await page.wait_for_timeout(2000)
                        
                        # Sometimes a popup appears after adding to cart, try to close it if it exists
                        close_popup = page.locator('button:has-text("Continuer mes achats"), button:has-text("Fermer"), button[aria-label="Fermer"]')
                        if await close_popup.count() > 0:
                            await close_popup.first.click(timeout=2000)
                            
                    except Exception as e:
                        print(f"❌ Failed to click add button for '{item}': {e}")
                else:
                    print(f"❌ Could not find 'Ajouter' button for '{item}'. Item might be out of stock or selector changed.")
                    
            print("\n🎉 Shopping complete! Check your active Chrome tab.")
            await page.close()
            
        except Exception as e:
            print(f"\n🚨 Error during shopping automation: {e}")
            print("Make sure you started Chrome with: --remote-debugging-port=9222")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python shopper.py \"item1, item2, item3\"")
        sys.exit(1)
    
    items = sys.argv[1]
    asyncio.run(shop(items))
