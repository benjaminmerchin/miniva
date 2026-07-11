import os
import tempfile
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

import pytest

# We set environment variables before importing voice_api to ensure it uses test settings
temp_db = tempfile.NamedTemporaryFile(delete=False)
temp_db.close()
os.environ["VOICE_DB_PATH"] = temp_db.name
os.environ["VOICE_STORAGE_DIR"] = tempfile.mkdtemp()
os.environ["VOICE_AGENT_SHARED_TOKEN"] = "test-agent-token"

from voice_api import app, store

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_auth_register_and_login():
    # Test registration
    resp_reg = client.post("/auth/register", json={
        "email": "test@example.com",
        "password": "supersecretpassword"
    })
    assert resp_reg.status_code == 200
    data_reg = resp_reg.json()
    assert "token" in data_reg
    assert data_reg["user"]["email"] == "test@example.com"
    token = data_reg["token"]

    # Test login
    resp_log = client.post("/auth/login", json={
        "email": "test@example.com",
        "password": "supersecretpassword"
    })
    assert resp_log.status_code == 200
    data_log = resp_log.json()
    assert "token" in data_log

    # Test /me endpoint using token
    resp_me = client.get("/me", headers={"Authorization": f"Bearer {token}"})
    assert resp_me.status_code == 200
    assert resp_me.json()["email"] == "test@example.com"


@patch("voice_api.HERMES_VOICE_EXEC_ENABLED", True)
@patch("voice_api.run_subagent")
def test_agents_turn_with_hermes(mock_run_subagent):
    mock_run_subagent.return_value = "Sure, I can help with that."

    headers = {
        "x-agent-token": "test-agent-token",
        "Content-Type": "application/json"
    }
    payload = {
        "transcript": "hello hermes",
        "agent": "voice_bot"
    }

    response = client.post("/agents/turn", json=payload, headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert data["reply"] == "Sure, I can help with that."
    assert data["source"] == "hermes"
    mock_run_subagent.assert_called_once_with("hello hermes", "voice_bot", "api_user", workdir=None)


@patch("voice_api.HERMES_VOICE_EXEC_ENABLED", False)
def test_agents_turn_without_hermes():
    headers = {
        "x-agent-token": "test-agent-token",
        "Content-Type": "application/json"
    }
    payload = {
        "transcript": "hello hermes",
    }

    response = client.post("/agents/turn", json=payload, headers=headers)
    
    assert response.status_code == 200
    data = response.json()
    assert "received the transcript" in data["reply"]
    assert data["source"] == "placeholder"


def test_agents_turn_unauthorized():
    # Missing x-agent-token
    payload = {"transcript": "hello hermes"}
    response = client.post("/agents/turn", json=payload)
    assert response.status_code == 401

    # Invalid x-agent-token
    headers = {"x-agent-token": "wrong-token"}
    response = client.post("/agents/turn", json=payload, headers=headers)
    assert response.status_code == 401
