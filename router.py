"""Routing helpers for the Hermes Discord orchestrator.

The simple mention/delegate helpers keep the original M1 behavior testable.
The M2 orchestrator uses OpenRouter when configured, with a deterministic
keyword fallback when the API key is absent or the network call fails.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request

OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", "").strip()
MODEL = os.getenv("OPENROUTER_MODEL", "google/gemma-4-26b-a4b-it")

MENTION_RE = re.compile(r"<@!?(\d+)>")
DELEGATE_RE = re.compile(
    r"^/delegate\s+([A-Za-z0-9_-]+)\s*:\s*(.+)$",
    re.IGNORECASE | re.DOTALL,
)
AGENT_ALIASES = {
    "a": "Tripo",
    "tripo": "Tripo",
    "trip": "Tripo",
    "travel": "Tripo",
    "b": "Taxy",
    "taxy": "Taxy",
    "trippy": "Taxy",
    "tax": "Taxy",
    "taxes": "Taxy",
    "c": "Grogro",
    "grogro": "Grogro",
    "grocery": "Grogro",
    "groceries": "Grogro",
    "debug": "DEBUG",
    "general": "General",
}


def parse_mentions(message_text: str) -> set[str]:
    """Return Discord user/bot IDs mentioned in a message."""
    return set(MENTION_RE.findall(message_text or ""))


def route(
    message_text: str,
    mentioned_bot_ids: list[str] | set[str],
    self_bot_id: str,
) -> str:
    """Route a message for the multi-bot Discord topology.

    Returns:
        "self" when this bot is mentioned, "other_bot" when another bot is
        mentioned, and "general" otherwise.
    """
    mentioned = set(mentioned_bot_ids or set()) | parse_mentions(message_text)
    if self_bot_id in mentioned:
        return "self"
    if mentioned:
        return "other_bot"
    return "general"


def parse_delegate(message_text: str) -> tuple[str, str] | None:
    """Parse `/delegate AGENT: task` commands."""
    match = DELEGATE_RE.match((message_text or "").strip())
    if not match:
        return None
    return match.group(1), match.group(2).strip()


def normalize_agent_name(agent_name: str) -> str:
    """Normalize public aliases to internal persona names."""
    return AGENT_ALIASES.get((agent_name or "").strip().lower(), "General")


def _keyword_fallback(message_text: str) -> str:
    text = (message_text or "").lower()
    if "debug" in text:
        return "DEBUG"
    if any(
        word in text
        for word in (
            "trip",
            "travel",
            "flight",
            "hotel",
            "vacation",
            "voyage",
            "billet",
            "sejour",
        )
    ):
        return "Tripo"
    if any(
        word in text
        for word in (
            "tax",
            "taxe",
            "impot",
            "impôts",
            "fisc",
            "vat",
            "tva",
            "deduction",
            "revenus",
        )
    ):
        return "Taxy"
    if any(
        word in text
        for word in (
            "grocery",
            "groceries",
            "food",
            "meal",
            "courses",
            "frigo",
            "supermarche",
            "supermarché",
        )
    ):
        return "Grogro"
    return "General"


def detect_target_agent(message_text: str) -> str:
    """Analyze the message to determine which sub-agent should handle it using an LLM.

    Parameters
    ----------
    message_text : str
        The raw text of the incoming message.

    Returns
    -------
    str
        The name of the target agent (e.g. "Tripo", "Taxy", "Grogro", or "General").
    """
    if not message_text:
        return "General"
    if not OPENROUTER_API_KEY:
        return _keyword_fallback(message_text)

    url = "https://openrouter.ai/api/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    
    system_prompt = (
        "You are an intent router. Analyze the user's message and output EXACTLY ONE WORD from the following list:\n"
        "- Tripo : for messages about trips, travel, flights, hotels, vacation.\n"
        "- Taxy : for messages about taxes, impôts, VAT, deductions, finances.\n"
        "- Grogro : for messages about groceries, food, courses, shopping, meals.\n"
        "- DEBUG : for messages containing 'DEBUG' or asking for debugging.\n"
        "- General : for general chat, greetings, or anything else.\n"
        "Do not output anything else. Only the exact word."
    )

    data = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": message_text}
        ],
        "temperature": 0.0,
        "max_tokens": 10
    }
    
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            response_body = response.read().decode("utf-8")
            response_json = json.loads(response_body)
            
            # Extract the generated text
            if "choices" in response_json and len(response_json["choices"]) > 0:
                content = response_json["choices"][0]["message"]["content"].strip()
                return normalize_agent_name(content)
            
    except Exception as e:
        print(f"LLM Routing Error: {e}")
        return _keyword_fallback(message_text)
        
    return "General"


def ask_llm_direct(message_text: str) -> str:
    if not message_text:
        return ""
    if not OPENROUTER_API_KEY:
        return "OpenRouter is not configured; set OPENROUTER_API_KEY."
    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    data = {
        "model": MODEL,
        "messages": [
            {"role": "user", "content": message_text}
        ],
        "temperature": 0.7,
        "max_tokens": 500
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as response:
            response_json = json.loads(response.read().decode('utf-8'))
            if "choices" in response_json and len(response_json["choices"]) > 0:
                return response_json["choices"][0]["message"]["content"].strip()
    except Exception as e:
        return f"⚠️ LLM Error: {e}"
    return "⚠️ No response from LLM"
