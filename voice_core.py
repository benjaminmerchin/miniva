"""Core auth, token, and voice storage primitives for the VPS API.

This module intentionally avoids web-framework dependencies so the storage and
authentication behavior can be tested without running the HTTP server.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import re
import secrets
import sqlite3
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import Any

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
PASSWORD_MIN_LENGTH = 8
PBKDF2_ITERATIONS = 240_000
TOKEN_VERSION = "v1"
DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7

AUDIO_EXTENSIONS = {
    ".aac",
    ".flac",
    ".m4a",
    ".mp3",
    ".ogg",
    ".opus",
    ".wav",
    ".webm",
}

CONTENT_TYPE_EXTENSIONS = {
    "audio/aac": ".aac",
    "audio/flac": ".flac",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/opus": ".opus",
    "audio/wav": ".wav",
    "audio/wave": ".wav",
    "audio/webm": ".webm",
}


class VoiceStoreError(Exception):
    """Base error for expected service-level failures."""


class ValidationError(VoiceStoreError):
    """Invalid user input."""


class AuthError(VoiceStoreError):
    """Invalid credentials or token."""


class ConflictError(VoiceStoreError):
    """A unique resource already exists."""


class NotFoundError(VoiceStoreError):
    """A requested resource does not exist or is not owned by the user."""


@dataclass(frozen=True)
class AuthResult:
    user: dict[str, Any]
    token: str


def utc_timestamp() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(value + padding)


def normalize_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not EMAIL_RE.match(normalized):
        raise ValidationError("Invalid email address.")
    return normalized


def validate_password(password: str) -> None:
    if not password or len(password) < PASSWORD_MIN_LENGTH:
        raise ValidationError(
            f"Password must contain at least {PASSWORD_MIN_LENGTH} characters."
        )


def hash_password(password: str) -> str:
    validate_password(password)
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return "$".join(
        [
            "pbkdf2_sha256",
            str(PBKDF2_ITERATIONS),
            _b64url_encode(salt),
            _b64url_encode(digest),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    try:
        algorithm, iterations_raw, salt_raw, digest_raw = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        iterations = int(iterations_raw)
        salt = _b64url_decode(salt_raw)
        expected = _b64url_decode(digest_raw)
    except (ValueError, TypeError):
        return False
    actual = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, iterations
    )
    return hmac.compare_digest(actual, expected)


class TokenManager:
    def __init__(self, secret: str, ttl_seconds: int = DEFAULT_TOKEN_TTL_SECONDS):
        if not secret:
            raise ValueError("A non-empty token secret is required.")
        self.secret = secret.encode("utf-8")
        self.ttl_seconds = ttl_seconds

    def issue(self, user: dict[str, Any]) -> str:
        now = int(time.time())
        payload = {
            "sub": user["id"],
            "email": user["email"],
            "iat": now,
            "exp": now + self.ttl_seconds,
        }
        body = _b64url_encode(
            json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
        )
        signature = _b64url_encode(self._sign(body))
        return f"{TOKEN_VERSION}.{body}.{signature}"

    def verify(self, token: str) -> dict[str, Any]:
        try:
            version, body, signature = token.split(".", 2)
        except ValueError as exc:
            raise AuthError("Invalid token.") from exc
        if version != TOKEN_VERSION:
            raise AuthError("Unsupported token version.")
        expected = _b64url_encode(self._sign(body))
        if not hmac.compare_digest(signature, expected):
            raise AuthError("Invalid token signature.")
        try:
            payload = json.loads(_b64url_decode(body))
        except (json.JSONDecodeError, ValueError) as exc:
            raise AuthError("Invalid token payload.") from exc
        if int(payload.get("exp", 0)) < int(time.time()):
            raise AuthError("Token has expired.")
        return payload

    def _sign(self, body: str) -> bytes:
        return hmac.new(self.secret, body.encode("ascii"), hashlib.sha256).digest()


class VoiceStore:
    def __init__(
        self,
        db_path: str | Path,
        storage_dir: str | Path,
        token_secret: str,
        token_ttl_seconds: int = DEFAULT_TOKEN_TTL_SECONDS,
    ):
        self.db_path = Path(db_path)
        self.storage_dir = Path(storage_dir)
        self.token_manager = TokenManager(token_secret, token_ttl_seconds)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.init_db()

    def init_db(self) -> None:
        with self._connect() as db:
            db.executescript(
                """
                PRAGMA foreign_keys = ON;

                CREATE TABLE IF NOT EXISTS users (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                    password_hash TEXT NOT NULL,
                    created_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS voices (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    label TEXT NOT NULL,
                    file_path TEXT NOT NULL,
                    original_filename TEXT,
                    content_type TEXT,
                    size_bytes INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS voice_sessions (
                    id TEXT PRIMARY KEY,
                    user_id TEXT NOT NULL,
                    voice_id TEXT,
                    discord_guild_id TEXT,
                    discord_channel_id TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY(voice_id) REFERENCES voices(id) ON DELETE SET NULL
                );

                CREATE TABLE IF NOT EXISTS session_chunks (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    seq INTEGER NOT NULL,
                    file_path TEXT NOT NULL,
                    content_type TEXT,
                    size_bytes INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES voice_sessions(id)
                        ON DELETE CASCADE,
                    UNIQUE(session_id, seq)
                );

                CREATE TABLE IF NOT EXISTS session_transcripts (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    source TEXT NOT NULL,
                    text TEXT NOT NULL,
                    is_final INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY(session_id) REFERENCES voice_sessions(id)
                        ON DELETE CASCADE
                );
                """
            )

    def register(self, email: str, password: str) -> AuthResult:
        normalized_email = normalize_email(email)
        password_hash = hash_password(password)
        user_id = uuid.uuid4().hex
        now = utc_timestamp()
        try:
            with self._connect() as db:
                db.execute(
                    """
                    INSERT INTO users (id, email, password_hash, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (user_id, normalized_email, password_hash, now),
                )
        except sqlite3.IntegrityError as exc:
            raise ConflictError("An account already exists for this email.") from exc
        user = {"id": user_id, "email": normalized_email, "created_at": now}
        return AuthResult(user=user, token=self.token_manager.issue(user))

    def login(self, email: str, password: str) -> AuthResult:
        normalized_email = normalize_email(email)
        with self._connect() as db:
            row = db.execute(
                """
                SELECT id, email, password_hash, created_at
                FROM users
                WHERE email = ?
                """,
                (normalized_email,),
            ).fetchone()
        if row is None or not verify_password(password, row["password_hash"]):
            raise AuthError("Invalid email or password.")
        user = self._public_user(dict(row))
        return AuthResult(user=user, token=self.token_manager.issue(user))

    def get_user_from_token(self, token: str) -> dict[str, Any]:
        payload = self.token_manager.verify(token)
        with self._connect() as db:
            row = db.execute(
                """
                SELECT id, email, created_at
                FROM users
                WHERE id = ?
                """,
                (payload["sub"],),
            ).fetchone()
        if row is None:
            raise AuthError("Token user does not exist.")
        return dict(row)

    def save_voice(
        self,
        user_id: str,
        *,
        label: str,
        filename: str | None,
        content_type: str | None,
        data: bytes,
    ) -> dict[str, Any]:
        label = (label or "").strip() or "default"
        if not data:
            raise ValidationError("Audio file is empty.")
        extension = self._audio_extension(filename, content_type)
        voice_id = uuid.uuid4().hex
        relative_path = Path("voices") / user_id / f"{voice_id}{extension}"
        absolute_path = self.storage_dir / relative_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(data)
        now = utc_timestamp()
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO voices (
                    id, user_id, label, file_path, original_filename,
                    content_type, size_bytes, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    voice_id,
                    user_id,
                    label,
                    relative_path.as_posix(),
                    filename,
                    content_type,
                    len(data),
                    now,
                ),
            )
        return self.get_voice(user_id, voice_id)

    def list_voices(self, user_id: str) -> list[dict[str, Any]]:
        with self._connect() as db:
            rows = db.execute(
                """
                SELECT id, label, original_filename, content_type, size_bytes,
                       created_at
                FROM voices
                WHERE user_id = ?
                ORDER BY created_at DESC
                """,
                (user_id,),
            ).fetchall()
        return [dict(row) for row in rows]

    def get_voice(self, user_id: str, voice_id: str) -> dict[str, Any]:
        with self._connect() as db:
            row = db.execute(
                """
                SELECT id, label, original_filename, content_type, size_bytes,
                       file_path, created_at
                FROM voices
                WHERE id = ? AND user_id = ?
                """,
                (voice_id, user_id),
            ).fetchone()
        if row is None:
            raise NotFoundError("Voice sample not found.")
        return dict(row)

    def voice_file_path(self, user_id: str, voice_id: str) -> Path:
        voice = self.get_voice(user_id, voice_id)
        path = self.storage_dir / voice["file_path"]
        if not path.exists():
            raise NotFoundError("Voice sample file not found.")
        return path

    def create_session(
        self,
        user_id: str,
        *,
        voice_id: str | None = None,
        discord_guild_id: str | None = None,
        discord_channel_id: str | None = None,
    ) -> dict[str, Any]:
        if voice_id:
            self.get_voice(user_id, voice_id)
        session_id = uuid.uuid4().hex
        now = utc_timestamp()
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO voice_sessions (
                    id, user_id, voice_id, discord_guild_id, discord_channel_id,
                    status, created_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    session_id,
                    user_id,
                    voice_id,
                    discord_guild_id,
                    discord_channel_id,
                    "open",
                    now,
                    now,
                ),
            )
        return self.get_session(user_id, session_id)

    def save_chunk(
        self,
        user_id: str,
        session_id: str,
        *,
        seq: int,
        filename: str | None,
        content_type: str | None,
        data: bytes,
    ) -> dict[str, Any]:
        if seq < 0:
            raise ValidationError("Chunk sequence must be zero or greater.")
        session = self._assert_session_owner(user_id, session_id)
        if session["status"] != "open":
            raise ValidationError("Voice session is closed.")
        if not data:
            raise ValidationError("Audio chunk is empty.")
        extension = self._audio_extension(filename, content_type)
        chunk_id = uuid.uuid4().hex
        relative_path = Path("sessions") / session_id / f"{seq:08d}-{chunk_id}{extension}"
        absolute_path = self.storage_dir / relative_path
        absolute_path.parent.mkdir(parents=True, exist_ok=True)
        absolute_path.write_bytes(data)
        now = utc_timestamp()
        try:
            with self._connect() as db:
                db.execute(
                    """
                    INSERT INTO session_chunks (
                        id, session_id, seq, file_path, content_type,
                        size_bytes, created_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        chunk_id,
                        session_id,
                        seq,
                        relative_path.as_posix(),
                        content_type,
                        len(data),
                        now,
                    ),
                )
                db.execute(
                    """
                    UPDATE voice_sessions
                    SET updated_at = ?
                    WHERE id = ?
                    """,
                    (now, session_id),
                )
        except sqlite3.IntegrityError as exc:
            absolute_path.unlink(missing_ok=True)
            raise ConflictError("A chunk with this sequence already exists.") from exc
        return {
            "id": chunk_id,
            "session_id": session_id,
            "seq": seq,
            "content_type": content_type,
            "size_bytes": len(data),
            "created_at": now,
        }

    def save_transcript(
        self,
        user_id: str,
        session_id: str,
        *,
        text: str,
        source: str = "superwhisper",
        is_final: bool = True,
    ) -> dict[str, Any]:
        self._assert_session_owner(user_id, session_id)
        normalized_text = (text or "").strip()
        if not normalized_text:
            raise ValidationError("Transcript text is empty.")
        transcript_id = uuid.uuid4().hex
        now = utc_timestamp()
        with self._connect() as db:
            db.execute(
                """
                INSERT INTO session_transcripts (
                    id, session_id, source, text, is_final, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    transcript_id,
                    session_id,
                    source or "unknown",
                    normalized_text,
                    1 if is_final else 0,
                    now,
                ),
            )
            db.execute(
                """
                UPDATE voice_sessions
                SET updated_at = ?
                WHERE id = ?
                """,
                (now, session_id),
            )
        return {
            "id": transcript_id,
            "session_id": session_id,
            "source": source or "unknown",
            "text": normalized_text,
            "is_final": is_final,
            "created_at": now,
        }

    def close_session(self, user_id: str, session_id: str) -> dict[str, Any]:
        self._assert_session_owner(user_id, session_id)
        now = utc_timestamp()
        with self._connect() as db:
            db.execute(
                """
                UPDATE voice_sessions
                SET status = ?, updated_at = ?
                WHERE id = ?
                """,
                ("closed", now, session_id),
            )
        return self.get_session(user_id, session_id)

    def get_session(self, user_id: str, session_id: str) -> dict[str, Any]:
        session = self._assert_session_owner(user_id, session_id)
        with self._connect() as db:
            chunks = db.execute(
                """
                SELECT id, seq, content_type, size_bytes, created_at
                FROM session_chunks
                WHERE session_id = ?
                ORDER BY seq ASC
                """,
                (session_id,),
            ).fetchall()
            transcripts = db.execute(
                """
                SELECT id, source, text, is_final, created_at
                FROM session_transcripts
                WHERE session_id = ?
                ORDER BY created_at ASC
                """,
                (session_id,),
            ).fetchall()
        out = dict(session)
        out["chunks"] = [dict(row) for row in chunks]
        out["transcripts"] = [
            {**dict(row), "is_final": bool(row["is_final"])} for row in transcripts
        ]
        return out

    def _assert_session_owner(self, user_id: str, session_id: str) -> sqlite3.Row:
        with self._connect() as db:
            row = db.execute(
                """
                SELECT id, user_id, voice_id, discord_guild_id, discord_channel_id,
                       status, created_at, updated_at
                FROM voice_sessions
                WHERE id = ? AND user_id = ?
                """,
                (session_id, user_id),
            ).fetchone()
        if row is None:
            raise NotFoundError("Voice session not found.")
        return row

    def _audio_extension(
        self, filename: str | None, content_type: str | None
    ) -> str:
        if filename:
            suffix = Path(filename).suffix.lower()
            if suffix in AUDIO_EXTENSIONS:
                return suffix
        if content_type:
            normalized = content_type.split(";", 1)[0].strip().lower()
            if normalized in CONTENT_TYPE_EXTENSIONS:
                return CONTENT_TYPE_EXTENSIONS[normalized]
        raise ValidationError("Unsupported audio type.")

    def _connect(self) -> sqlite3.Connection:
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA foreign_keys = ON")
        return db

    def _public_user(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": row["id"],
            "email": row["email"],
            "created_at": row["created_at"],
        }
