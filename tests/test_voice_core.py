import pytest

from voice_core import AuthError, ConflictError, NotFoundError, VoiceStore


def make_store(tmp_path):
    return VoiceStore(
        db_path=tmp_path / "voice.sqlite3",
        storage_dir=tmp_path / "storage",
        token_secret="test-secret",
        token_ttl_seconds=3600,
    )


def test_register_login_and_token_roundtrip(tmp_path):
    store = make_store(tmp_path)

    registered = store.register("USER@example.com", "password123")
    assert registered.user["email"] == "user@example.com"
    assert registered.token

    user = store.get_user_from_token(registered.token)
    assert user["id"] == registered.user["id"]

    logged_in = store.login("user@example.com", "password123")
    assert logged_in.user == registered.user


def test_duplicate_email_is_rejected(tmp_path):
    store = make_store(tmp_path)

    store.register("user@example.com", "password123")

    with pytest.raises(ConflictError):
        store.register("USER@example.com", "password123")


def test_invalid_login_is_rejected(tmp_path):
    store = make_store(tmp_path)

    store.register("user@example.com", "password123")

    with pytest.raises(AuthError):
        store.login("user@example.com", "wrong-password")


def test_voice_sample_session_chunk_and_transcript_flow(tmp_path):
    store = make_store(tmp_path)
    auth = store.register("user@example.com", "password123")
    user_id = auth.user["id"]

    voice = store.save_voice(
        user_id,
        label="studio",
        filename="sample.wav",
        content_type="audio/wav",
        data=b"RIFFfake-audio",
    )
    assert voice["label"] == "studio"
    assert voice["size_bytes"] == len(b"RIFFfake-audio")
    assert store.voice_file_path(user_id, voice["id"]).exists()
    assert len(store.list_voices(user_id)) == 1

    session = store.create_session(
        user_id,
        voice_id=voice["id"],
        discord_channel_id="1525451187959365706",
    )
    chunk = store.save_chunk(
        user_id,
        session["id"],
        seq=0,
        filename="chunk.webm",
        content_type="audio/webm",
        data=b"chunk",
    )
    transcript = store.save_transcript(
        user_id,
        session["id"],
        text="hello hermes",
        source="superwhisper",
        is_final=True,
    )

    saved = store.get_session(user_id, session["id"])
    assert saved["chunks"][0]["id"] == chunk["id"]
    assert saved["transcripts"][0]["id"] == transcript["id"]
    assert saved["transcripts"][0]["is_final"] is True


def test_session_ownership_is_enforced(tmp_path):
    store = make_store(tmp_path)
    first = store.register("first@example.com", "password123")
    second = store.register("second@example.com", "password123")
    session = store.create_session(first.user["id"])

    with pytest.raises(NotFoundError):
        store.get_session(second.user["id"], session["id"])
