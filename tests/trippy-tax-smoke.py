import sys
import os

# Add parent directory to path so we can import master_controller
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from master_controller import handle_master_message

def test_trippy_smoke():
    print("Running Trippy Smoke Test...")
    author_id = "test-user-1"
    # The master controller requires a matched controller_id
    controller_id = "test-user-1"
    
    messages = [
        "J’ai ouvert un compte N26 avec un IBAN DE. Nous vivons en concubinage et le compte est uniquement à mon nom.",
        "Mon compte N26 a un IBAN FR.",
        "J’ai ouvert N26."
    ]
    
    for i, msg in enumerate(messages):
        print(f"\n--- Test Case {i+1} ---")
        print(f"Input: {msg}")
        
        reply = handle_master_message(
            text=msg,
            author_id=author_id,
            controller_id=controller_id
        )
        print(f"Output: {reply}")

if __name__ == '__main__':
    test_trippy_smoke()
