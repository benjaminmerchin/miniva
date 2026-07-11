"""Thin wrapper around the Google Calendar API.

All functions take a ``discord_user_id`` and resolve the user's stored
OAuth credentials via :mod:`calendar_auth`. They return plain Python
dicts/lists so the result can be serialised straight to JSON for the API
or pretty-printed into a Discord message.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from googleapiclient.discovery import build

from calendar_auth import load_credentials


def _service(discord_user_id: str):
    creds = load_credentials(discord_user_id)
    if creds is None:
        raise RuntimeError("Calendar not connected. Run !calendar to link Google Calendar.")
    return build("calendar", "v3", credentials=creds)


def list_upcoming_events(
    discord_user_id: str, *, max_results: int = 10, days_ahead: int = 14
) -> list[dict[str, Any]]:
    """Return upcoming events within ``days_ahead`` as simple dicts."""
    service = _service(discord_user_id)
    now = datetime.now(timezone.utc)
    window_end = now + timedelta(days=days_ahead)

    events_result = (
        service.events()
        .list(
            calendarId="primary",
            timeMin=now.isoformat(),
            timeMax=window_end.isoformat(),
            maxResults=max_results,
            singleEvents=True,
            orderBy="startTime",
        )
        .execute()
    )
    items = events_result.get("items", [])
    out = []
    for ev in items:
        start = ev.get("start", {})
        out.append(
            {
                "id": ev.get("id"),
                "summary": ev.get("summary", "(sans titre)"),
                "start": start.get("dateTime") or start.get("date"),
                "end": (ev.get("end", {}).get("dateTime") or ev.get("end", {}).get("date")),
                "html_link": ev.get("htmlLink"),
                "location": ev.get("location"),
            }
        )
    return out


def create_event(
    discord_user_id: str,
    *,
    summary: str,
    start_dt: datetime,
    end_dt: datetime | None = None,
    description: str | None = None,
    location: str | None = None,
) -> dict[str, Any]:
    """Create an event on the user's primary calendar."""
    service = _service(discord_user_id)
    if end_dt is None:
        end_dt = start_dt + timedelta(hours=1)

    body: dict[str, Any] = {
        "summary": summary,
        "start": {"dateTime": start_dt.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end_dt.isoformat(), "timeZone": "UTC"},
    }
    if description:
        body["description"] = description
    if location:
        body["location"] = location

    created = service.events().insert(calendarId="primary", body=body).execute()
    return {
        "id": created.get("id"),
        "summary": created.get("summary"),
        "html_link": created.get("htmlLink"),
        "start": created.get("start", {}).get("dateTime"),
    }


def get_calendars(discord_user_id: str) -> list[dict[str, Any]]:
    """List the user's calendars (primary first)."""
    service = _service(discord_user_id)
    result = service.calendarList().list().execute()
    return [
        {
            "id": c.get("id"),
            "summary": c.get("summary"),
            "primary": c.get("primary", False),
            "access_role": c.get("accessRole"),
        }
        for c in result.get("items", [])
    ]
