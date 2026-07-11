import os
import sys

# Add backend to path so we can import elevenlabs_service
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend"))
from elevenlabs_service import transcribe_audio

def main():
    # Use the test audio file copied from the desktop
    file_path = os.path.join(os.path.dirname(__file__), "data", "te2.m4a")
    print(f"Reading file: {file_path}")
    
    if not os.path.exists(file_path):
        print("Error: Test audio file not found. Please provide 'tests/data/te2.m4a'")
        sys.exit(1)
        
    with open(file_path, "rb") as f:
        audio_bytes = f.read()
    
    print("Transcribing with ElevenLabs Scribe v2...")
    text = transcribe_audio(audio_bytes)
    
    print("-" * 40)
    print("Transcription Result:")
    print(text)
    print("-" * 40)

if __name__ == "__main__":
    main()
