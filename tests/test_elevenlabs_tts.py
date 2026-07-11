import os
import sys

# Add backend to path so we can import elevenlabs_service
sys.path.append(os.path.join(os.path.dirname(os.path.dirname(__file__)), "backend"))
from elevenlabs_service import generate_speech

def main():
    text = "Ceci est un test de génération vocale pour le bot Hermes. Je peux maintenant parler dans le chat vocal."
    voice_id = "CwhRBWXzGAHq8TQ4Fs17" # HermesMaster voice ID
    
    print(f"Generating TTS for voice_id {voice_id}...")
    audio_bytes = generate_speech(text, voice_id)
    
    if not audio_bytes:
        print("Failed to generate speech.")
        sys.exit(1)
        
    output_path = os.path.expanduser("~/Desktop/test_tts_response.mp3")
    with open(output_path, "wb") as f:
        f.write(audio_bytes)
        
    print(f"TTS successfully generated and saved to: {output_path}")

if __name__ == "__main__":
    main()
