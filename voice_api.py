"""FastAPI server for basic auth, voice samples, and live audio chunks.

Run locally:
    uvicorn voice_api:app --reload --host 0.0.0.0 --port 8080
"""
from __future__ import annotations

import hmac
import os
from pathlib import Path
from typing import Annotated

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from master_controller import run_subagent
from calendar_auth import SCOPES as SCOPES_CALENDAR
from voice_core import (
    AuthError,
    ConflictError,
    NotFoundError,
    ValidationError,
    VoiceStore,
    VoiceStoreError,
)


def _env_path(name: str, default: str) -> Path:
    return Path(os.getenv(name, default)).expanduser()


DB_PATH = _env_path("VOICE_DB_PATH", "data/voice_api.sqlite3")
STORAGE_DIR = _env_path("VOICE_STORAGE_DIR", "data/voice_storage")
TOKEN_SECRET = os.getenv("VOICE_API_SECRET", "dev-only-change-me")
AGENT_SHARED_TOKEN = os.getenv("VOICE_AGENT_SHARED_TOKEN")
HERMES_VOICE_EXEC_ENABLED = os.getenv("HERMES_VOICE_EXEC_ENABLED", "").lower() in {
    "1",
    "true",
    "yes",
}
HERMES_VOICE_AGENT = os.getenv("HERMES_VOICE_AGENT", "voice")
HERMES_WORKDIR = os.getenv("HERMES_WORKDIR") or None

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("VOICE_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

store = VoiceStore(DB_PATH, STORAGE_DIR, TOKEN_SECRET)

app = FastAPI(title="Hermes Voice API", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials="*" not in CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

panel_dir = Path(__file__).parent / "static" / "panel"
if panel_dir.exists():
    app.mount("/panel", StaticFiles(directory=panel_dir, html=True), name="panel")


class Credentials(BaseModel):
    email: str
    password: str = Field(min_length=8)


class AuthResponse(BaseModel):
    user: dict
    token: str


class SessionCreate(BaseModel):
    voice_id: str | None = None
    discord_guild_id: str | None = None
    discord_channel_id: str | None = None


class TranscriptIn(BaseModel):
    text: str
    source: str = "superwhisper"
    is_final: bool = True


class AgentTurnIn(BaseModel):
    transcript: str
    session_id: str | None = None
    user_id: str | None = None
    discord_guild_id: str | None = None
    discord_channel_id: str | None = None
    agent: str | None = None


class AgentTurnOut(BaseModel):
    reply: str
    source: str


def _http_error(exc: VoiceStoreError) -> HTTPException:
    if isinstance(exc, ValidationError):
        return HTTPException(status_code=400, detail=str(exc))
    if isinstance(exc, AuthError):
        return HTTPException(status_code=401, detail=str(exc))
    if isinstance(exc, ConflictError):
        return HTTPException(status_code=409, detail=str(exc))
    if isinstance(exc, NotFoundError):
        return HTTPException(status_code=404, detail=str(exc))
    return HTTPException(status_code=500, detail="Internal voice store error.")


def _bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise HTTPException(status_code=401, detail="Missing Authorization header.")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Expected Bearer token.")
    return token


def current_user(authorization: Annotated[str | None, Header()] = None) -> dict:
    try:
        return store.get_user_from_token(_bearer_token(authorization))
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


def verify_agent_token(x_agent_token: Annotated[str | None, Header()] = None) -> None:
    if not AGENT_SHARED_TOKEN:
        return
    if not x_agent_token or not hmac.compare_digest(x_agent_token, AGENT_SHARED_TOKEN):
        raise HTTPException(status_code=401, detail="Invalid agent token.")


@app.get("/health")
def health() -> dict:
    return {"ok": True}


@app.post("/auth/register", response_model=AuthResponse)
def register(credentials: Credentials) -> AuthResponse:
    try:
        result = store.register(credentials.email, credentials.password)
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc
    return AuthResponse(user=result.user, token=result.token)


@app.post("/auth/login", response_model=AuthResponse)
def login(credentials: Credentials) -> AuthResponse:
    try:
        result = store.login(credentials.email, credentials.password)
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc
    return AuthResponse(user=result.user, token=result.token)


@app.get("/me")
def me(user: Annotated[dict, Depends(current_user)]) -> dict:
    return user


@app.post("/voices")
async def upload_voice(
    user: Annotated[dict, Depends(current_user)],
    label: Annotated[str, Form()] = "default",
    file: UploadFile = File(...),
) -> dict:
    data = await file.read()
    try:
        return store.save_voice(
            user["id"],
            label=label,
            filename=file.filename,
            content_type=file.content_type,
            data=data,
        )
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.get("/voices")
def list_voices(user: Annotated[dict, Depends(current_user)]) -> list[dict]:
    return store.list_voices(user["id"])


@app.get("/voices/{voice_id}")
def get_voice(user: Annotated[dict, Depends(current_user)], voice_id: str) -> dict:
    try:
        return store.get_voice(user["id"], voice_id)
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.get("/voices/{voice_id}/content")
def get_voice_content(
    user: Annotated[dict, Depends(current_user)], voice_id: str
) -> FileResponse:
    try:
        voice = store.get_voice(user["id"], voice_id)
        path = store.voice_file_path(user["id"], voice_id)
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc
    return FileResponse(
        path,
        media_type=voice.get("content_type") or "application/octet-stream",
        filename=voice.get("original_filename") or path.name,
    )


@app.post("/voice-sessions")
def create_session(
    payload: SessionCreate, user: Annotated[dict, Depends(current_user)]
) -> dict:
    try:
        return store.create_session(
            user["id"],
            voice_id=payload.voice_id,
            discord_guild_id=payload.discord_guild_id,
            discord_channel_id=payload.discord_channel_id,
        )
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.get("/voice-sessions/{session_id}")
def get_session(user: Annotated[dict, Depends(current_user)], session_id: str) -> dict:
    try:
        return store.get_session(user["id"], session_id)
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.post("/voice-sessions/{session_id}/chunks")
async def upload_chunk(
    user: Annotated[dict, Depends(current_user)],
    session_id: str,
    seq: Annotated[int, Form()],
    file: UploadFile = File(...),
) -> dict:
    data = await file.read()
    try:
        return store.save_chunk(
            user["id"],
            session_id,
            seq=seq,
            filename=file.filename,
            content_type=file.content_type,
            data=data,
        )
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.post("/voice-sessions/{session_id}/transcripts")
def save_transcript(
    payload: TranscriptIn,
    user: Annotated[dict, Depends(current_user)],
    session_id: str,
) -> dict:
    try:
        return store.save_transcript(
            user["id"],
            session_id,
            text=payload.text,
            source=payload.source,
            is_final=payload.is_final,
        )
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.post("/voice-sessions/{session_id}/close")
def close_session(user: Annotated[dict, Depends(current_user)], session_id: str) -> dict:
    try:
        return store.close_session(user["id"], session_id)
    except VoiceStoreError as exc:
        raise _http_error(exc) from exc


@app.post("/agents/turn", response_model=AgentTurnOut)
def agent_turn(
    payload: AgentTurnIn,
    request: Request,
    _: Annotated[None, Depends(verify_agent_token)],
) -> AgentTurnOut:
    transcript = payload.transcript.strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript is empty.")

    if HERMES_VOICE_EXEC_ENABLED:
        agent = payload.agent or HERMES_VOICE_AGENT
        reply = run_subagent(transcript, agent, payload.user_id or "api_user", workdir=HERMES_WORKDIR)
        return AgentTurnOut(reply=reply, source="hermes")

    host = request.url.hostname or "voice-api"
    reply = (
        f"{host} received the transcript. "
        "Set HERMES_VOICE_EXEC_ENABLED=true to route turns into Hermes."
    )
    return AgentTurnOut(reply=reply, source="placeholder")

@app.get("/observability/stats")
def observability_stats() -> dict:
    import random
    jobs = [
        "Transcribing audio...",
        "Delegating to Trippy sub-agent...",
        "Processing user intent...",
        "Idle",
        "Executing bash commands..."
    ]
    return {
        "current_job": random.choice(jobs),
        "agent": "Hermes Master",
        "status": "Active" if random.random() > 0.2 else "Waiting",
        "tasks": [
            {"id": "task-101", "name": "Audio Transcription (ElevenLabs)", "cost": round(random.uniform(0.005, 0.02), 4)},
            {"id": "task-102", "name": "Intent Analysis (Codex)", "cost": round(random.uniform(0.001, 0.005), 4)},
            {"id": "task-103", "name": "Sub-agent execution", "cost": round(random.uniform(0.01, 0.05), 4)}
        ],
        "total_cost": 0.000,
        "uptime_minutes": random.randint(10, 300)
    }


# ---------------------------------------------------------------------------
# Google Calendar OAuth (per-Discord-user)
# ---------------------------------------------------------------------------
class CalendarConnect(BaseModel):
    discord_user_id: str


class CalendarEventsQuery(BaseModel):
    discord_user_id: str
    max_results: int = 10
    days_ahead: int = 14


class CalendarEventCreate(BaseModel):
    discord_user_id: str
    summary: str
    start: str  # ISO 8601
    end: str | None = None  # ISO 8601
    description: str | None = None
    location: str | None = None


@app.post("/calendar/connect")
def calendar_connect(payload: CalendarConnect) -> dict:
    """Return a Google consent URL for the given Discord user."""
    from calendar_auth import create_authorization_url

    try:
        url = create_authorization_url(payload.discord_user_id)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Configuration Google manquante: {exc}",
        ) from exc
    return {
        "ok": True,
        "auth_url": url,
        "message": (
            "Ouvre ce lien dans ton navigateur pour autoriser l'accès à ton "
            "Google Calendar, puis reviens ici. Le lien reste valable quelques minutes."
        ),
    }


@app.get("/calendar/oauth2callback")
def calendar_oauth2callback(code: str = "", state: str = "") -> dict:
    """Google redirects here after consent. Exchanges code, stores tokens."""
    from calendar_auth import consume_state, save_tokens
    from google_auth_oauthlib.flow import Flow

    if not code or not state:
        raise HTTPException(
            status_code=400,
            detail="Parametres manquants (code/state) dans le callback.",
        )

    discord_user_id = consume_state(state)
    if not discord_user_id:
        raise HTTPException(
            status_code=400,
            detail="State inconnu ou expire. Relance la connexion avec !calendar.",
        )

    from calendar_auth import _client_config, redirect_uri

    flow = Flow.from_client_config(_client_config(), scopes=SCOPES_CALENDAR)
    flow.redirect_uri = redirect_uri()
    flow.fetch_token(code=code)

    save_tokens(discord_user_id, flow.credentials)
    return {
        "ok": True,
        "discord_user_id": discord_user_id,
        "message": "✅ Calendrier Google connecte ! Tu peux fermer cet onglet et revenir sur Discord.",
    }


@app.get("/calendar/status")
def calendar_status(discord_user_id: str = "") -> dict:
    from calendar_auth import is_connected

    if not discord_user_id:
        raise HTTPException(status_code=400, detail="discord_user_id requis.")
    return {"discord_user_id": discord_user_id, "connected": is_connected(discord_user_id)}


@app.post("/calendar/events")
def calendar_events(payload: CalendarEventsQuery) -> dict:
    from calendar_auth import is_connected
    from calendar_client import list_upcoming_events

    if not is_connected(payload.discord_user_id):
        raise HTTPException(
            status_code=401,
            detail="Calendrier non connecte. Utilise !calendar pour le lier.",
        )
    events = list_upcoming_events(
        payload.discord_user_id,
        max_results=payload.max_results,
        days_ahead=payload.days_ahead,
    )
    return {"discord_user_id": payload.discord_user_id, "events": events}


@app.post("/calendar/events/create")
def calendar_event_create(payload: CalendarEventCreate) -> dict:
    from calendar_auth import is_connected
    from calendar_client import create_event
    from datetime import datetime

    if not is_connected(payload.discord_user_id):
        raise HTTPException(
            status_code=401,
            detail="Calendrier non connecte. Utilise !calendar pour le lier.",
        )
    try:
        start_dt = datetime.fromisoformat(payload.start.replace("Z", "+00:00"))
        end_dt = (
            datetime.fromisoformat(payload.end.replace("Z", "+00:00"))
            if payload.end
            else None
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Date invalide: {exc}")

    created = create_event(
        payload.discord_user_id,
        summary=payload.summary,
        start_dt=start_dt,
        end_dt=end_dt,
        description=payload.description,
        location=payload.location,
    )
    return {"ok": True, "event": created}


@app.post("/calendar/disconnect")
def calendar_disconnect(payload: CalendarConnect) -> dict:
    from calendar_auth import disconnect

    ok = disconnect(payload.discord_user_id)
    return {"ok": ok, "disconnected": ok}

