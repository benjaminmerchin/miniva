import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from master_controller import handle_master_message

def mock_sender(message: str):
    print(f"  Channel <- {message}")

# Mock run_subagent so we don't actually call hermes CLI in tests
import master_controller
master_controller.run_subagent = lambda task, agent, workdir=None: f"Mock response from {agent} for task: '{task}'"

print("=== Starting Single Bot Orchestrator Simulation ===\n")

controller_id = "user123"

messages = [
    "I need to plan a trip to Tokyo",
    "How much tax do I owe on my 3000 USD expenses?",
    "I'm hungry, I need to buy some courses",
    "Hello bot, what can you do?"
]

for msg in messages:
    print(f"[User] -> Orchestrator: {msg}")
    handle_master_message(
        text=msg,
        author_id=controller_id,
        controller_id=controller_id,
        sender=mock_sender
    )
    print("")

print("=== Simulation Complete ===")
