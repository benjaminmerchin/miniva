"""Master controller for the M2 Orchestrator fleet.

The Orchestrator listens for messages, detects the intent via the router,
and delegates the task to the appropriate internal persona using Hermes.
"""
from __future__ import annotations

import os
import subprocess
from typing import Callable

from router import detect_target_agent, normalize_agent_name, parse_delegate


def is_authorized_controller(author_id: str, controller_id: str | None) -> bool:
    """Only the configured controller user ID may interact with the bot."""
    if not controller_id:
        return False
    return author_id == controller_id


def run_subagent(
    task: str,
    agent: str,
    author_id: str = "unknown",
    workdir: str | None = None,
) -> str:
    """Run a task as a Hermes subagent via the CLI. Returns the subagent summary.

    NOTE: this is a subprocess wrapper. Hermes's delegate_task is richer
    (background, isolated terminal) but invoking it requires the in-process
    agent context. For the Discord master bot we shell out to `hermes`.
    """
    cascade_instruction = (
        "\n(SYSTEM: You can interact with other agents by appending [CASCADE: AgentName] to your response. "
        "Available agents: Tripo, Taxy, Grogro, General. Example: [CASCADE: Tripo] Plan a trip.) "
        f"\n(CONTEXT: The user speaking to you has discord_user_id: {author_id})"
    )
    cmd = ["hermes"]
    if agent.lower() in {"taxy", "trippy"}:
        cmd += ["-s", "trippy-tax"]
    elif agent.lower() in {"domo", "domotique"}:
        cmd += ["-s", "domotique-home"]
    cmd += ["-z", f"[{agent}] {task} {cascade_instruction}"]
    effective_workdir = workdir or os.getenv("HERMES_WORKDIR") or None
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=600, cwd=effective_workdir
        )
        if result.returncode != 0:
            return f"⚠️ subagent error (rc={result.returncode}): {result.stderr[:500]}"
        return (result.stdout or result.stderr).strip() or "(no output)"
    except FileNotFoundError:
        return "⚠️ `hermes` CLI not found in PATH."
    except subprocess.TimeoutExpired:
        return "⚠️ subagent timed out after 600s."


def handle_master_message(
    text: str,
    author_id: str,
    controller_id: str | None,
    workdir: str | None = None,
    sender: Callable[[str], None] | None = None,
) -> str | None:
    """High-level entry: detect intent, delegate, and return a reply.

    Returns the reply string.
    If `sender` is provided, the result is delivered through it instead.
    """
    if not text.strip():
        return None

    if not is_authorized_controller(author_id, controller_id):
        reply = "⛔ Unauthorized: I only listen to my master controller."
        if sender:
            sender(reply)
        return reply

    # 1. Explicit delegation wins; otherwise use automatic intent detection.
    delegated = parse_delegate(text)
    if delegated:
        requested_agent, task = delegated
        agent = normalize_agent_name(requested_agent)
    else:
        task = text
        agent = detect_target_agent(text)

    # 2. Inform the user we are routing
    if sender:
        sender(f"*(Orchestrator)* I am routing your request to **{agent}**...")

    # 3. Delegate to the target sub-bot persona
    if agent == "DEBUG":
        from router import ask_llm_direct
        result = ask_llm_direct(task)
    else:
        result = run_subagent(task, agent, author_id, workdir=workdir)

    # 4. Format the reply with the persona's name as prefix
    reply = f"**[{agent}]** {result}"
    
    if sender:
        sender(reply)
        
    return reply
