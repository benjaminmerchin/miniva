import subprocess
from unittest.mock import patch, MagicMock

import pytest

from master_controller import (
    is_authorized_controller,
    run_subagent,
    handle_master_message,
)


def test_is_authorized_controller():
    assert is_authorized_controller("123", "123") is True
    assert is_authorized_controller("123", "456") is False
    assert is_authorized_controller("123", None) is False


@patch("master_controller.subprocess.run")
def test_run_subagent_success(mock_run):
    mock_result = MagicMock()
    mock_result.returncode = 0
    mock_result.stdout = "Subagent task completed."
    mock_result.stderr = ""
    mock_run.return_value = mock_result

    output = run_subagent("Book a flight to NY", "Tripo", workdir="/tmp")
    
    assert output == "Subagent task completed."
    mock_run.assert_called_once()
    args = mock_run.call_args[0][0]
    assert args[0] == "hermes"
    assert "-z" in args
    assert "[Tripo] Book a flight to NY" in args[args.index("-z") + 1]
    assert mock_run.call_args.kwargs["cwd"] == "/tmp"


@patch("master_controller.subprocess.run")
def test_run_subagent_failure(mock_run):
    mock_result = MagicMock()
    mock_result.returncode = 1
    mock_result.stderr = "Error missing dependencies"
    mock_run.return_value = mock_result

    output = run_subagent("Book a flight", "Tripo")
    
    assert "subagent error" in output
    assert "Error missing dependencies" in output


@patch("master_controller.subprocess.run")
def test_run_subagent_timeout(mock_run):
    mock_run.side_effect = subprocess.TimeoutExpired(cmd="hermes", timeout=600)

    output = run_subagent("Infinite loop task", "Grogro")
    assert "timed out" in output


@patch("master_controller.detect_target_agent")
@patch("master_controller.run_subagent")
def test_handle_master_message_authorized(mock_run_subagent, mock_detect):
    mock_detect.return_value = "Tripo"
    mock_run_subagent.return_value = "Flight booked successfully."

    sender_mock = MagicMock()
    
    reply = handle_master_message(
        text="Book a flight",
        author_id="user1",
        controller_id="user1",
        sender=sender_mock
    )
    
    assert reply == "**[Tripo]** Flight booked successfully."
    assert sender_mock.call_count == 2
    
    # First call to sender: Routing info
    assert "routing your request to **Tripo**" in sender_mock.call_args_list[0][0][0]
    # Second call: The actual reply
    assert sender_mock.call_args_list[1][0][0] == "**[Tripo]** Flight booked successfully."


def test_handle_master_message_unauthorized():
    sender_mock = MagicMock()
    reply = handle_master_message(
        text="Book a flight",
        author_id="imposter",
        controller_id="admin123",
        sender=sender_mock
    )
    
    assert "Unauthorized" in reply
    sender_mock.assert_called_once_with(reply)


def test_handle_master_message_empty():
    reply = handle_master_message(
        text="   ",
        author_id="user1",
        controller_id="user1"
    )
    assert reply is None
