"""Google OAuth2 helpers for the Hermes Discord fleet.

We use the "installed app" / out-of-band OAuth2 flow because the user
authorises from inside Discord (a chat client, not a browser we control).
The flow is:

  1. Discord user runs ``!calendar`` (or says "connect to my calendar").
  2. We mint a ``state`` token, store a pending record keyed by it, and
     hand the user a Google consent URL (via DM to keep it private).
  3. The user opens the URL, consents, and Google redirects to
     ``/calendar/oauth2callback`` on our public API.
  4. We exchange the code for tokens, associate them with the
     ``discord_user_id`` carried in the ``state``, and persist them.

Tokens are stored per ``discord_user_id`` as JSON on disk. The file path
is configurable through ``CALENDAR_TOKEN_PATH`` (default
``data/calendar_tokens.json``).
"""
from __future__ import annotations

import json
import os
import secrets
import threading
import time
from pathlib import Path
from typing import Any

from google_auth_oauthlib.flow import Flow

# Scopes requested from Google. Read + write so the bot can both report and
# create events ("add a meeting to my calendar" later on).
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Google rejects localhost / non-https redirects in production unless the
# app is configured for it. We always build the redirect from a public base
# URL supplied via CALENDAR_PUBLIC_BASE_URL.
REDIRECT_PATH = "/calendar/oauth2callback"

_token_lock = threading.Lock()


def _client_config() -> dict:
    """Load the Google OAuth client config from the environment.

    Expected variables (same shape as a credentials JSON ``installed`` key):
        GOOGLE_CLIENT_ID
        GOOGLE_CLIENT_SECRET
    """
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    if not client_id or not client_secret:
        raise RuntimeError(
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set to connect calendars."
        )
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "redirect_uris": [""],  # filled at runtime from the public base URL
        }
    }


def _public_base() -> str:
    base = os.getenv("CALENDAR_PUBLIC_BASE_URL", "").strip().rstrip("/")
    if not base:
        raise RuntimeError(
            "CALENDAR_PUBLIC_BASE_URL must be set (e.g. https://yourhost). "
            "It is used to build the OAuth redirect URI."
        )
    return base


def redirect_uri() -> str:
    return f"{_public_base()}{REDIRECT_PATH}"


def token_path() -> Path:
    return Path(
        os.getenv("CALENDAR_TOKEN_PATH", "data/calendar_tokens.json")
    ).expanduser()


def _load_store() -> dict:
    p = token_path()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def _save_store(store: dict) -> None:
    p = token_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    tmp = p.with_suffix(".tmp")
    tmp.write_text(json.dumps(store, indent=2))
    tmp.replace(p)


# ---------------------------------------------------------------------------
# Pending state (the short-lived mapping state -> discord_user_id)
# ---------------------------------------------------------------------------
_PENDING_FILE = "data/calendar_pending.json"


def _pending_path() -> Path:
    return Path(os.getenv("CALENDAR_PENDING_PATH", _PENDING_FILE)).expanduser()


def _load_pending() -> dict:
    p = _pending_path()
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            return {}
    return {}


def _save_pending(data: dict) -> None:
    p = _pending_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, indent=2))


def create_authorization_url(discord_user_id: str) -> str:
    """Create a consent URL tied to ``discord_user_id`` and remember state."""
    cfg = _client_config()
    flow = Flow.from_client_config(cfg, scopes=SCOPES)
    flow.redirect_uri = redirect_uri()

    state = secrets.token_urlsafe(24)
    auth_url, _ = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        state=state,
    )

    pending = _load_pending()
    pending[state] = {
        "discord_user_id": discord_user_id,
        "created_at": int(time.time()),
    }
    _save_pending(pending)
    return auth_url


def consume_state(state: str) -> str | None:
    """Return the discord_user_id for ``state`` and delete the pending entry."""
    pending = _load_pending()
    entry = pending.pop(state, None)
    if entry is None:
        return None
    _save_pending(pending)
    return entry.get("discord_user_id")


# ---------------------------------------------------------------------------
# Token storage keyed by discord_user_id
# ---------------------------------------------------------------------------
def save_tokens(discord_user_id: str, credentials: Any) -> None:
    """Persist OAuth credentials (google.oauth2.credentials.Credentials)."""
    with _token_lock:
        store = _load_store()
        store[str(discord_user_id)] = {
            "token": credentials.token,
            "refresh_token": credentials.refresh_token,
            "token_uri": credentials.token_uri,
            "client_id": credentials.client_id,
            "client_secret": credentials.client_secret,
            "scopes": credentials.scopes,
            "expiry": credentials.expiry.isoformat() if credentials.expiry else None,
        }
        _save_store(store)


def load_credentials(discord_user_id: str) -> Any | None:
    """Load and refresh credentials for a user, or None if not connected."""
    from google.oauth2.credentials import Credentials

    with _token_lock:
        store = _load_store()
        data = store.get(str(discord_user_id))
        if not data:
            return None

    creds = Credentials(
        token=data.get("token"),
        refresh_token=data.get("refresh_token"),
        token_uri=data.get("token_uri"),
        client_id=data.get("client_id"),
        client_secret=data.get("client_secret"),
        scopes=data.get("scopes"),
    )
    # Refresh if expired.
    if creds.expired and creds.refresh_token:
        from google.auth.transport.requests import Request as GoogleRequest

        creds.refresh(GoogleRequest())
        save_tokens(discord_user_id, creds)
    return creds


def is_connected(discord_user_id: str) -> bool:
    return load_credentials(discord_user_id) is not None


def disconnect(discord_user_id: str) -> bool:
    with _token_lock:
        store = _load_store()
        if str(discord_user_id) in store:
            del store[str(discord_user_id)]
            _save_store(store)
            return True
    return False
