import os
import uuid
import typing
from io import BytesIO
from elevenlabs.client import ElevenLabs
from dotenv import load_dotenv

load_dotenv(os.path.expanduser("~/.hermes/.env"))

ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")

client = ElevenLabs(api_key=ELEVENLABS_API_KEY) if ELEVENLABS_API_KEY else None

def _require_client():
    if client is None:
        print("[ElevenLabs Config Error] ELEVENLABS_API_KEY is missing.")
        return None
    return client

def transcribe_audio(audio_bytes: bytes) -> str:
    """
    Transcribes audio using ElevenLabs Scribe v2.
    """
    eleven = _require_client()
    if eleven is None:
        return ""
    try:
        response = eleven.speech_to_text.convert(
            file=audio_bytes,
            model_id="scribe_v2",
            tag_audio_events=False
        )
        return response.text
    except Exception as e:
        print(f"[ElevenLabs STT Error] {e}")
        return ""

def generate_speech(text: str, voice_id: str) -> bytes:
    """
    Generates TTS audio using ElevenLabs.
    """
    eleven = _require_client()
    if eleven is None:
        return b""
    try:
        audio_generator = eleven.text_to_speech.convert(
            text=text,
            voice_id=voice_id,
            model_id="eleven_multilingual_v2"
        )
        audio_bytes = b"".join(audio_generator)
        return audio_bytes
    except Exception as e:
        print(f"[ElevenLabs TTS Error] {e}")
        return b""

def clone_voice(name: str, file_paths: typing.List[str]) -> str:
    """
    Clones a voice using provided audio files and returns the voice_id.
    """
    eleven = _require_client()
    if eleven is None:
        return ""
    try:
        voice = eleven.voices.ivc.create(
            name=name,
            files=[open(p, "rb") for p in file_paths]
        )
        return voice.voice_id
    except Exception as e:
        print(f"[ElevenLabs Voice Clone Error] {e}")
        return ""
