import json
import urllib.error
from unittest.mock import patch, MagicMock

import pytest

from router import detect_target_agent


@patch("router.urllib.request.urlopen")
def test_detect_target_agent_tripo(mock_urlopen):
    # Mocking successful API response for Tripo
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "choices": [{"message": {"content": "Tripo"}}]
    }).encode("utf-8")
    # Set context manager behavior
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = detect_target_agent("I need a flight to Paris")
    assert result == "Tripo"


@patch("router.urllib.request.urlopen")
def test_detect_target_agent_taxy(mock_urlopen):
    # Mocking successful API response for Taxy
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "choices": [{"message": {"content": "Taxy"}}]
    }).encode("utf-8")
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = detect_target_agent("How do I declare my income?")
    assert result == "Taxy"


@patch("router.urllib.request.urlopen")
def test_detect_target_agent_grogro(mock_urlopen):
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "choices": [{"message": {"content": "Grogro"}}]
    }).encode("utf-8")
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = detect_target_agent("Buy some milk and bread")
    assert result == "Grogro"


@patch("router.urllib.request.urlopen")
def test_detect_target_agent_general(mock_urlopen):
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "choices": [{"message": {"content": "General"}}]
    }).encode("utf-8")
    mock_urlopen.return_value.__enter__.return_value = mock_response

    result = detect_target_agent("Hello how are you?")
    assert result == "General"


def test_detect_target_agent_empty_message():
    # Empty message should immediately return General without API call
    result = detect_target_agent("")
    assert result == "General"


@patch("router.urllib.request.urlopen")
def test_detect_target_agent_api_error(mock_urlopen):
    # Mocking an API error (e.g. timeout or unauthorized)
    mock_urlopen.side_effect = urllib.error.URLError("Network unreachable")

    # Should fallback to deterministic keyword routing
    result = detect_target_agent("I need a flight to Paris")
    assert result == "Tripo"


@patch("router.urllib.request.urlopen")
def test_detect_target_agent_malformed_response(mock_urlopen):
    # Mocking unexpected JSON format
    mock_response = MagicMock()
    mock_response.read.return_value = json.dumps({
        "something_else": "weird"
    }).encode("utf-8")
    mock_urlopen.return_value.__enter__.return_value = mock_response

    # Should fallback to General
    result = detect_target_agent("I need a flight to Paris")
    assert result == "General"
