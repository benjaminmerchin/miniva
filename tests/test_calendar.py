"""Tests for the Google Calendar integration (calendar_auth + API routes).

These tests use monkeypatched filesystem paths and env vars so they never
touch a real Google endpoint or the network.
"""
import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import calendar_auth


@pytest.fixture(autouse=True)
def isolated_paths(tmp_path, monkeypatch):
    """Point calendar_auth at temp files so we never touch real data."""
    tokens = tmp_path / "tokens.json"
    pending = tmp_path / "pending.json"
    monkeypatch.setenv("CALENDAR_TOKEN_PATH", str(tokens))
    monkeypatch.setenv("CALENDAR_PENDING_PATH", str(pending))
    # Avoid requiring real Google creds; we patch create flow separately.
    yield
    for f in (tokens, pending):
        if f.exists():
            f.unlink()


def test_create_authorization_url_mints_state(monkeypatch):
    # Avoid network/real config by stubbing the flow.
    from google_auth_oauthlib.flow import Flow

    captured = {}

    def fake_auth_url(self, **kwargs):
        captured["state"] = kwargs.get("state")
        return "https://accounts.google.com/fake?state=" + str(kwargs.get("state")), None

    monkeypatch.setattr(Flow, "authorization_url", fake_auth_url)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "dummy_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "dummy_secret")
    monkeypatch.setenv("CALENDAR_PUBLIC_BASE_URL", "https://bot.example.com")

    url = calendar_auth.create_authorization_url("123456")

    # A pending entry should be stored keyed by the state.
    pending = json.loads(Path(os.getenv("CALENDAR_PENDING_PATH")).read_text())
    assert len(pending) == 1
    state = next(iter(pending))
    assert pending[state]["discord_user_id"] == "123456"


def test_consume_state_roundtrip(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "dummy_id")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "dummy_secret")
    monkeypatch.setenv("CALENDAR_PUBLIC_BASE_URL", "https://bot.example.com")

    from google_auth_oauthlib.flow import Flow

    monkeypatch.setattr(Flow, "authorization_url", lambda self, **k: ("u", None))

    url = calendar_auth.create_authorization_url("999")
    pending = json.loads(Path(os.getenv("CALENDAR_PENDING_PATH")).read_text())
    state = next(iter(pending))
    assert calendar_auth.consume_state(state) == "999"
    # State must be consumed (one-time use).
    assert calendar_auth.consume_state(state) is None


def test_save_and_load_credentials(monkeypatch):
    class FakeCreds:
        token = "access"
        refresh_token = "refresh"
        token_uri = "https://oauth2.googleapis.com/token"
        client_id = "cid"
        client_secret = "csec"
        scopes = ["https://www.googleapis.com/auth/calendar"]
        expiry = None

    calendar_auth.save_tokens("u1", FakeCreds())
    creds = calendar_auth.load_credentials("u1")
    assert creds is not None
    assert creds.token == "access"
    assert creds.refresh_token == "refresh"

    assert calendar_auth.is_connected("u1") is True
    assert calendar_auth.is_connected("unknown") is False

    assert calendar_auth.disconnect("u1") is True
    assert calendar_auth.is_connected("u1") is False


def test_api_connect_requires_google_env(monkeypatch):
    # Ensure Google env not set so the endpoint reports a clear error.
    monkeypatch.delenv("GOOGLE_CLIENT_ID", raising=False)
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("CALENDAR_PUBLIC_BASE_URL", raising=False)

    import voice_api

    client = TestClient(voice_api.app)
    resp = client.post("/calendar/connect", json={"discord_user_id": "42"})
    # It should fail because the OAuth client config is missing.
    assert resp.status_code in (400, 500, 503)


def test_api_status_unconnected(monkeypatch, isolated_paths):
    import voice_api

    client = TestClient(voice_api.app)
    resp = client.get("/calendar/status", params={"discord_user_id": "nope"})
    assert resp.status_code == 200
    assert resp.json()["connected"] is False
