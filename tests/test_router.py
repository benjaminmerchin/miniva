"""Tests for the M1 routing logic — no Discord connection required."""
from router import route, parse_delegate, parse_mentions


def test_self_mentioned_returns_self():
    # Message @mentions THIS bot (id 111) and a human (999). Should answer.
    out = route("<@111> hello there", mentioned_bot_ids=["111"], self_bot_id="111")
    assert out == "self"


def test_other_bot_mentioned_returns_other_bot():
    # Message @mentions a DIFFERENT bot (id 222) but not us (id 111). Stay silent.
    out = route("<@222> do the thing", mentioned_bot_ids=["222"], self_bot_id="111")
    assert out == "other_bot"


def test_no_bot_mentioned_returns_general():
    # No bot mentioned -> fall through to general handler.
    out = route("anyone know the drum config?", mentioned_bot_ids=[], self_bot_id="111")
    assert out == "general"


def test_multi_bot_one_channel():
    # Two bots (111, 222) share a channel. A message to 222 must not trigger 111.
    msg = "<@222> configure the skill agent"
    out_111 = route(msg, mentioned_bot_ids=["222"], self_bot_id="111")
    out_222 = route(msg, mentioned_bot_ids=["222"], self_bot_id="222")
    assert out_111 == "other_bot"   # bot 111 stays silent
    assert out_222 == "self"        # bot 222 answers


def test_nickname_mention_form():
    # <@!id> is the nickname mention form; parse_mentions must still catch it.
    ids = parse_mentions("hey <@!111> and <@222>")
    assert ids == {"111", "222"}


def test_delegate_parsing():
    assert parse_delegate("/delegate C: run GD configurator") == (
        "C",
        "run GD configurator",
    )


def test_delegate_parsing_requires_colon():
    assert parse_delegate("/delegate C run GD") is None


def test_delegate_case_insensitive():
    assert parse_delegate("/DELEGATE a: task") == ("a", "task")
