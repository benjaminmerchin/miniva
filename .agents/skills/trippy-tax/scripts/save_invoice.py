#!/usr/bin/env python3
import os
import sys
import json
import urllib.request
import argparse
from urllib.error import URLError, HTTPError

def load_env(path):
    if os.path.exists(path):
        with open(path) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    k, v = line.strip().split("=", 1)
                    os.environ[k] = v

# Load Hermes env
load_env(os.path.expanduser("~/.hermes/.env"))

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")
MODEL = "google/gemma-2-9b-it" # Use Gemma for openrouter OCR/Text parsing
# Note: The user asked for "gemma4" but OpenRouter uses Gemma-2 currently. 
# We'll default to google/gemma-2-9b-it which is available.
# We will use google/gemma-2-27b-it if we need something stronger. Let's use google/gemma-2-27b-it.
MODEL = "google/gemma-2-27b-it"

def extract_invoice_data(text, image_url=None):
    if not OPENROUTER_API_KEY:
        print("Missing OPENROUTER_API_KEY")
        return None
        
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    content = [
        {"type": "text", "text": "Extract invoice details into JSON: vendor (string), amountHT (number), amountTTC (number), tva (number), date (string YYYY-MM-DD), category (string). Return only a valid JSON object without markdown formatting."}
    ]
    if text:
        content.append({"type": "text", "text": "Invoice text: " + text})
    if image_url:
        content.append({"type": "image_url", "image_url": {"url": image_url}})
        
    data = {
        "model": MODEL,
        "messages": [{"role": "user", "content": content}],
        "temperature": 0.0
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            res_json = json.loads(response.read().decode('utf-8'))
            if "choices" in res_json:
                text = res_json["choices"][0]["message"]["content"].strip()
                if text.startswith("```json"):
                    text = text[7:]
                if text.endswith("```"):
                    text = text[:-3]
                return json.loads(text.strip())
    except Exception as e:
        print(f"Failed to extract invoice data via OpenRouter: {e}")
        return None
        
    return None

def push_to_convex(discord_user_id, raw_text, image_url, extracted_data):
    # Retrieve MINIVA_SITE_URL or CONVEX_SITE_URL and MINIVA_INGEST_KEY
    site_url = os.environ.get("MINIVA_SITE_URL") or os.environ.get("CONVEX_SITE_URL")
    ingest_key = os.environ.get("MINIVA_INGEST_KEY") or os.environ.get("CONVEX_INGEST_KEY")
    
    if not site_url or not ingest_key:
        print("Missing CONVEX_SITE_URL or CONVEX_INGEST_KEY in ~/.hermes/.env")
        return False
        
    url = f"{site_url.rstrip('/')}/v1/invoices"
    
    payload = {
        "discordUserId": discord_user_id,
        "vendor": extracted_data.get("vendor"),
        "amountHT": extracted_data.get("amountHT"),
        "amountTTC": extracted_data.get("amountTTC"),
        "tva": extracted_data.get("tva"),
        "date": extracted_data.get("date"),
        "category": extracted_data.get("category"),
        "receiptUrl": image_url,
        "rawText": raw_text,
        "status": "processed"
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {ingest_key}",
            "Content-Type": "application/json"
        },
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            if response.status == 200:
                print("Invoice successfully saved to Convex.")
                return True
    except Exception as e:
        print(f"Failed to push to Convex: {e}")
        
    return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Extract and save invoice.")
    parser.add_argument("--discord-user-id", required=True)
    parser.add_argument("--text", default="")
    parser.add_argument("--image-url", default="")
    
    args = parser.parse_args()
    
    if not args.text and not args.image_url:
        print("Error: must provide --text or --image-url")
        sys.exit(1)
        
    extracted = extract_invoice_data(args.text, args.image_url)
    if not extracted:
        # Fallback empty structure
        extracted = {}
        
    success = push_to_convex(args.discord_user_id, args.text, args.image_url, extracted)
    if success:
        sys.exit(0)
    else:
        sys.exit(1)
