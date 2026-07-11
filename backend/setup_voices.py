import os
import json
import requests
from elevenlabs_service import clone_voice, client

CONFIG_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "config", "voices.json")
VOICES_DIR = os.path.join(os.path.dirname(__file__), "kyutai_voices")

KYUTAI_VOICES_URLS = [
    "https://huggingface.co/kyutai/tts-voices/resolve/main/cml-tts/fr/10087_11650_000028-0002_enhanced.wav",
    "https://huggingface.co/kyutai/tts-voices/resolve/main/cml-tts/fr/10177_10625_000134-0003_enhanced.wav",
    "https://huggingface.co/kyutai/tts-voices/resolve/main/cml-tts/fr/10179_11051_000005-0001_enhanced.wav",
    "https://huggingface.co/kyutai/tts-voices/resolve/main/cml-tts/fr/12080_11650_000047-0001_enhanced.wav"
]

AGENT_MAPPING = ["HermesMaster", "Tripo", "Taxy", "Grogro"]

def download_file(url, dest):
    print(f"Downloading {url} to {dest}...")
    response = requests.get(url)
    response.raise_for_status()
    with open(dest, "wb") as f:
        f.write(response.content)

def setup_voices():
    os.makedirs(VOICES_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(CONFIG_PATH), exist_ok=True)
    
    voices_config = {}
    
    # Try to load existing
    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, "r") as f:
            voices_config = json.load(f)
            
    for agent_name, url in zip(AGENT_MAPPING, KYUTAI_VOICES_URLS):
        if agent_name in voices_config:
            print(f"Voice for {agent_name} already exists: {voices_config[agent_name]}")
            continue
            
        filename = url.split("/")[-1]
        local_path = os.path.join(VOICES_DIR, filename)
        
        if not os.path.exists(local_path):
            download_file(url, local_path)
            
        print(f"Cloning voice for {agent_name} from {local_path}...")
        voice_id = clone_voice(f"Kyutai_{agent_name}", [local_path])
        
        if voice_id:
            voices_config[agent_name] = voice_id
            print(f"Successfully cloned {agent_name} -> {voice_id}")
        else:
            print(f"Failed to clone voice for {agent_name}")
            
    with open(CONFIG_PATH, "w") as f:
        json.dump(voices_config, f, indent=4)
    print("Voice setup complete. Config saved to:", CONFIG_PATH)

if __name__ == "__main__":
    setup_voices()
