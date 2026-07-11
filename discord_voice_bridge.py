import os
import io
import json
import asyncio
import re
import uuid
import sys
import discord
from discord.ext import commands
from discord.sinks import WaveSink
from dotenv import load_dotenv

sys.path.append(os.path.join(os.path.dirname(__file__), "backend"))
from elevenlabs_service import transcribe_audio, generate_speech

load_dotenv(os.path.expanduser("~/.hermes/.env"))


def clean_discord_token(raw_token):
    token = (raw_token or "").strip().strip("\"'")
    if token.lower().startswith("bot "):
        token = token[4:].strip()
    return token


def looks_like_discord_bot_token(token):
    # Discord bot tokens are long, dot-separated values. This catches common
    # copy/paste mistakes such as application IDs, public keys, and client IDs.
    return len(token) >= 50 and token.count(".") >= 2 and not re.fullmatch(r"[0-9a-fA-F]{64}", token)


MASTER_TOKEN = clean_discord_token(os.getenv("DISCORD_BOT_TOKEN_MASTER"))
GENERIC_TOKEN = clean_discord_token(os.getenv("DISCORD_BOT_TOKEN"))

if MASTER_TOKEN and looks_like_discord_bot_token(MASTER_TOKEN):
    TOKEN = MASTER_TOKEN
elif GENERIC_TOKEN and looks_like_discord_bot_token(GENERIC_TOKEN):
    TOKEN = GENERIC_TOKEN
    if MASTER_TOKEN:
        print(
            "DISCORD_BOT_TOKEN_MASTER is set but does not look like a Discord bot token; "
            "falling back to DISCORD_BOT_TOKEN."
        )
else:
    print(
        "No valid Discord bot token found. Set DISCORD_BOT_TOKEN_MASTER or "
        "DISCORD_BOT_TOKEN to the Bot token from Developer Portal > Bot > Reset Token; "
        "do not use the application ID, public key, or client secret."
    )
    exit(1)
if not os.getenv("ELEVENLABS_API_KEY"):
    print("Warning: ELEVENLABS_API_KEY is not set; voice STT/TTS will not work.")

intents = discord.Intents.default()
intents.message_content = True
intents.voice_states = True

bot = commands.Bot(command_prefix="!", intents=intents)


def load_discord_opus():
    if discord.opus.is_loaded():
        return
    for path in (
        os.getenv("DISCORD_OPUS_LIB"),
        "/opt/homebrew/lib/libopus.dylib",
        "/usr/local/lib/libopus.dylib",
        "libopus.so.0",
        "libopus.so",
    ):
        if not path:
            continue
        try:
            discord.opus.load_opus(path)
            print(f"Loaded Opus library from {path}")
            return
        except Exception:
            continue
    print("Warning: could not load Opus; Discord voice playback may fail.")


load_discord_opus()

# Load voices config
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config", "voices.json")
try:
    with open(CONFIG_PATH, "r") as f:
        VOICES = json.load(f)
except Exception as e:
    print(f"Warning: voices.json not found. {e}")
    VOICES = {}

connections = {}
is_recording = {}
active_sinks = {}
silence_tasks = {}
MIN_AUDIO_BYTES = int(os.getenv("VOICE_MIN_AUDIO_BYTES", "96000"))


def env_flag(name, default=False):
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


DISCORD_ENABLE_VOICE = env_flag("DISCORD_ENABLE_VOICE", default=False)
DISCORD_TEXT_AUTO_REPLY = env_flag("DISCORD_TEXT_AUTO_REPLY", default=True)
DISCORD_TEXT_CHANNEL_ID = (
    os.getenv("DISCORD_TEXT_CHANNEL_ID")
    or os.getenv("DISCORD_CHANNEL_ID")
    or ""
).strip()
DISCORD_CONTROLLER_USER_ID = os.getenv("DISCORD_CONTROLLER_USER_ID", "").strip()


def get_active_sink(guild_id):
    return active_sinks.get(guild_id)


def make_recording_callback(sink, channel, guild_id):
    def after_recording(error):
        async def runner():
            try:
                await finished_callback(sink, channel, error)
            finally:
                if active_sinks.get(guild_id) is sink:
                    active_sinks.pop(guild_id, None)

        try:
            bot.loop.call_soon_threadsafe(lambda: bot.loop.create_task(runner()))
        except RuntimeError as exc:
            print(f"Failed to schedule recording callback: {exc}")

    return after_recording


def begin_recording(vc, guild, text_channel):
    if vc.is_recording():
        return False

    sink = WaveSink()
    prepare_sink_for_recording(sink, vc)
    active_sinks[guild.id] = sink
    try:
        vc.start_recording(sink, make_recording_callback(sink, text_channel, guild.id))
    except Exception:
        if active_sinks.get(guild.id) is sink:
            active_sinks.pop(guild.id, None)
        raise
    return True


def prepare_sink_for_recording(sink, vc):
    if not hasattr(sink, "__sink_listeners__"):
        sink.__sink_listeners__ = []
    if not hasattr(sink, "walk_children"):
        sink.walk_children = lambda *args, **kwargs: []
    if getattr(sink, "vc", None) is None:
        sink.init(vc)


def ensure_silence_detector(vc, guild, text_channel):
    task = silence_tasks.get(guild.id)
    if task and not task.done():
        return
    silence_tasks[guild.id] = bot.loop.create_task(silence_detector(vc, guild, text_channel))

async def silence_detector(vc, guild, text_channel):
    last_sizes = {}
    silence_ticks = {}
    while is_recording.get(guild.id) and vc.is_connected():
        await asyncio.sleep(0.5)
        sink = get_active_sink(guild.id)
        if not is_recording.get(guild.id) or sink is None or not hasattr(sink, 'audio_data'):
            continue
            
        should_process = False
        for user_id, audio in list(sink.audio_data.items()):
            if user_id == bot.user.id:
                continue
                
            size = audio.file.tell()
            last_size = last_sizes.get(user_id, 0)
            
            if size > last_size:
                last_sizes[user_id] = size
                silence_ticks[user_id] = 0
            elif size > 96000 and size == last_size:
                silence_ticks[user_id] = silence_ticks.get(user_id, 0) + 1
                if silence_ticks[user_id] >= 3: # ~1.5 seconds of silence
                    should_process = True
                    break
                    
        if should_process:
            if vc.is_connected() and vc.is_recording():
                try:
                    vc.stop_recording()
                except Exception as exc:
                    print(f"Failed to stop recording for silence processing: {exc}")
            
            await asyncio.sleep(1.0)
            if is_recording.get(guild.id) and vc.is_connected():
                try:
                    begin_recording(vc, guild, text_channel)
                    last_sizes.clear()
                    silence_ticks.clear()
                except Exception as exc:
                    print(f"Failed to restart recording after silence: {exc}")

async def start_listening_auto(vc, guild):
    if is_recording.get(guild.id):
        return
        
    text_channel = guild.system_channel
    if not text_channel or not text_channel.permissions_for(guild.me).send_messages:
        text_channel = next((c for c in guild.text_channels if c.permissions_for(guild.me).send_messages), None)
        
    if not text_channel:
        print(f"Cannot auto-listen in {guild.name} because no text channel is available.")
        return
        
    try:
        begin_recording(vc, guild, text_channel)
    except Exception as exc:
        print(f"Failed to start voice recording in {guild.name}: {exc}")
        await text_channel.send(f"⚠️ I joined voice but could not start listening: `{exc}`")
        return

    is_recording[guild.id] = True
    print(f"Auto-started listening in {vc.channel.name} of {guild.name}")
    await text_channel.send(f"🎙️ Auto-joined **{vc.channel.name}** and listening... Speak to interact.")
    ensure_silence_detector(vc, guild, text_channel)

@bot.event
async def on_ready():
    print(f"Logged in as {bot.user} (ID: {bot.user.id})")
    if not DISCORD_ENABLE_VOICE:
        print("Voice auto-join disabled (set DISCORD_ENABLE_VOICE=1 to enable).")
        return

    for guild in bot.guilds:
        target_channel = None
        for channel in guild.voice_channels:
            if len([m for m in channel.members if m.id != bot.user.id]) > 0 and channel.permissions_for(guild.me).connect:
                target_channel = channel
                break
                
        if not target_channel:
            for channel in guild.voice_channels:
                if channel.permissions_for(guild.me).connect:
                    target_channel = channel
                    break
                    
        if target_channel:
            try:
                vc = await target_channel.connect()
                connections[guild.id] = vc
                print(f"Auto-joined {target_channel.name} in {guild.name}")
                if len([m for m in target_channel.members if m.id != bot.user.id]) > 0:
                    await start_listening_auto(vc, guild)
            except Exception as e:
                print(f"Failed to auto-join {target_channel.name}: {e}")

@bot.event
async def on_voice_state_update(member, before, after):
    if not DISCORD_ENABLE_VOICE:
        return

    # Auto-reconnect if bot is disconnected
    if member.id == bot.user.id and before.channel is not None and after.channel is None:
        print(f"Disconnected from {before.channel.name}. Reconnecting...")
        try:
            vc = await before.channel.connect()
            connections[before.channel.guild.id] = vc
            print(f"Reconnected to {before.channel.name}")
            if len([m for m in before.channel.members if m.id != bot.user.id]) > 0:
                await start_listening_auto(vc, before.channel.guild)
        except Exception as e:
            print(f"Failed to reconnect: {e}")
            
    # Auto join and listen when someone joins
    if member.id != bot.user.id and after.channel is not None:
        guild = after.channel.guild
        vc = connections.get(guild.id)
        
        if not vc or not vc.is_connected():
            try:
                vc = await after.channel.connect()
                connections[guild.id] = vc
                print(f"Auto-joined {after.channel.name} to listen to {member.name}")
            except Exception as e:
                print(f"Failed to join {after.channel.name}: {e}")
        elif vc.channel.id != after.channel.id:
            current_others = [m for m in vc.channel.members if m.id != bot.user.id]
            if len(current_others) == 0:
                try:
                    await vc.move_to(after.channel)
                    print(f"Moved to {after.channel.name} to listen to {member.name}")
                except Exception as e:
                    print(f"Failed to move to {after.channel.name}: {e}")
                    
        if vc and vc.is_connected() and vc.channel.id == after.channel.id:
            await start_listening_auto(vc, guild)
            
    # Stop listening if channel becomes empty
    if member.id != bot.user.id and before.channel is not None and (after.channel is None or after.channel.id != before.channel.id):
        guild = before.channel.guild
        vc = connections.get(guild.id)
        if vc and vc.is_connected() and vc.channel.id == before.channel.id:
            others = [m for m in before.channel.members if m.id != bot.user.id]
            if len(others) == 0 and is_recording.get(guild.id):
                if vc.is_recording():
                    vc.stop_recording()
                is_recording[guild.id] = False
                print(f"Stopped listening in {before.channel.name} because it's empty.")

from master_controller import handle_master_message

def get_agent_mention(guild, agent_name):
    for member in guild.members:
        if member.name.lower() == agent_name.lower():
            return member.mention
    return agent_name


def extract_speech_payload(content, fallback_agent):
    match = re.search(r"\*\*\[(.*?)\]\*\*(.*)", content, re.DOTALL)
    if match:
        return match.group(1).strip(), match.group(2).strip()
    return fallback_agent, content.strip()


def clean_tts_text(text):
    text = re.sub(r'<@!?&?\d+>', '', text)
    text = re.sub(r"\[CASCADE:\s*.*?\]", "", text, flags=re.IGNORECASE | re.DOTALL)
    return text.replace("*", "").strip()


async def speak_in_voice(guild, agent_name, text_to_speak):
    vc = discord.utils.get(bot.voice_clients, guild=guild)
    if not vc or not vc.is_connected():
        return

    clean_text = clean_tts_text(text_to_speak)
    if not clean_text:
        return

    voice_id = VOICES.get(agent_name) or VOICES.get("HermesMaster")
    if not voice_id:
        print(f"No voice configured for {agent_name}; skipping TTS.")
        return

    print(f"Generating TTS for {agent_name}...")
    loop = asyncio.get_running_loop()
    audio_bytes = await loop.run_in_executor(None, generate_speech, clean_text, voice_id)
    if audio_bytes:
        play_audio(vc, audio_bytes)


async def process_text_and_cascade(channel, transcript):
    print(f"Routing transcript: {transcript}")
    
    # We use a dummy controller_id so it passes authorization
    dummy_author_id = "voice_bridge"
    
    # Run the master controller logic in a thread because it runs synchronous subprocess
    loop = asyncio.get_event_loop()
    
    # Custom sender to post to discord
    def discord_sender(reply_text):
        asyncio.run_coroutine_threadsafe(channel.send(reply_text), loop)
        
    reply = await loop.run_in_executor(
        None, 
        lambda: handle_master_message(transcript, dummy_author_id, dummy_author_id, sender=discord_sender)
    )

    if reply:
        agent_name, text_to_speak = extract_speech_payload(reply, "HermesMaster")
        await speak_in_voice(channel.guild, agent_name, text_to_speak)
    
    if reply and "[CASCADE:" in reply:
        # e.g., [CASCADE: Taxy] Tell a joke
        match = re.search(r"\[CASCADE:\s*(.*?)\](.*)", reply, re.IGNORECASE | re.DOTALL)
        if match:
            next_agent = match.group(1).strip()
            cascade_prompt = match.group(2).strip()
            # Post the trigger
            await channel.send(f"@HermesMaster [VOICE-CASCADE to {next_agent}] {cascade_prompt}")
            # Recursively process the cascade
            await process_text_and_cascade(channel, f"For {next_agent}: {cascade_prompt}")


def strip_own_mention(content):
    if not bot.user:
        return content.strip()
    return re.sub(rf"<@!?{bot.user.id}>", "", content).strip()


def allowed_text_channel(message):
    if not DISCORD_TEXT_CHANNEL_ID or message.guild is None:
        return True
    return str(message.channel.id) == DISCORD_TEXT_CHANNEL_ID


def should_handle_text_message(message):
    content = (message.content or "").strip()
    if not content:
        return False
    # Allow the calendar command even though it starts with "!"
    if content.lower().startswith("!calendar"):
        return True
    if content.startswith("!"):
        return False
    if not allowed_text_channel(message):
        return False
    if message.guild is None:
        return True
    if bot.user and bot.user in message.mentions:
        return True
    if content.lower().startswith("/delegate "):
        return True
    return DISCORD_TEXT_AUTO_REPLY


async def process_discord_text_message(message):
    if not should_handle_text_message(message):
        return

    prompt = strip_own_mention(message.content)
    
    if message.attachments:
        attachment_urls = [att.url for att in message.attachments]
        prompt += "\n\nAttachments: " + ", ".join(attachment_urls)

    if not prompt.strip():
        return

    # Calendar natural-language shortcuts: handle locally so the user gets an
    # immediate link / agenda without involving the LLM router.
    lowered = prompt.lower()
    if any(
        kw in lowered
        for kw in (
            "connect to my calendar",
            "connect my calendar",
            "link my calendar",
            "what's on my calendar",
            "what is on my calendar",
            "show my calendar",
            "my agenda",
            "mon calendrier",
            "mon agenda",
        )
    ):
        discord_user_id = str(message.author.id)
        if any(k in lowered for k in ("connect", "link", "lier", "connecte")):
            await _calendar_connect(message.channel, discord_user_id)
        elif any(k in lowered for k in ("what", "show", "agenda", "calendrier")):
            await _calendar_events(message.channel, discord_user_id)
        else:
            await _calendar_status(message.channel, discord_user_id)
        return

    author_id = str(message.author.id)
    controller_id = DISCORD_CONTROLLER_USER_ID or author_id
    loop = asyncio.get_running_loop()

    def discord_sender(reply_text):
        asyncio.run_coroutine_threadsafe(message.channel.send(reply_text), loop)

    async with message.channel.typing():
        await loop.run_in_executor(
            None,
            lambda: handle_master_message(
                prompt,
                author_id,
                controller_id,
                sender=discord_sender,
            ),
        )

async def finished_callback(sink, channel, error=None):
    """Callback when recording stops."""
    if error:
        print(f"Recording stopped with error: {error}")

    print("Processing audio...")
    if not getattr(sink, "audio_data", None):
        print("No audio data captured.")
        return

    try:
        if any(not getattr(audio, "finished", False) for audio in sink.audio_data.values()):
            sink.cleanup()
    except Exception as exc:
        print(f"Failed to finalize recorded audio: {exc}")
        return

    for user_id, audio in list(sink.audio_data.items()):
        if user_id == bot.user.id:
            continue
        
        audio.file.seek(0)
        audio_bytes = audio.file.read()
        if len(audio_bytes) < MIN_AUDIO_BYTES:
            print(f"Skipping short audio from {user_id}: {len(audio_bytes)} bytes")
            continue
        
        loop = asyncio.get_running_loop()
        transcript = await loop.run_in_executor(None, transcribe_audio, audio_bytes)
        if transcript and transcript.strip():
            print(f"Transcription for {user_id}: {transcript}")
            await channel.send(f"🎙️ **{user_id}** (Voice): {transcript}")
            await process_text_and_cascade(channel, transcript)

@bot.command()
async def join(ctx):
    """Joins the voice channel of the user."""
    if not ctx.author.voice:
        return await ctx.send("You are not in a voice channel.")
    
    channel = ctx.author.voice.channel
    if ctx.voice_client is not None:
        return await ctx.voice_client.move_to(channel)
    
    vc = await channel.connect()
    connections[ctx.guild.id] = vc
    await ctx.send(f"Joined {channel.name}. Use `!listen` to start recording and `!stop` to process.")

@bot.command()
async def listen(ctx):
    """Starts recording audio in the voice channel."""
    vc = ctx.voice_client
    if not vc:
        return await ctx.send("I'm not in a voice channel.")

    if is_recording.get(ctx.guild.id) or vc.is_recording():
        return await ctx.send("Already listening.")
    
    try:
        begin_recording(vc, ctx.guild, ctx.channel)
    except Exception as exc:
        return await ctx.send(f"Could not start listening: `{exc}`")

    is_recording[ctx.guild.id] = True
    await ctx.send("Listening... Use `!stop` when you are done speaking.")
    ensure_silence_detector(vc, ctx.guild, ctx.channel)

@bot.command()
async def stop(ctx):
    """Stops recording and transcribes."""
    vc = ctx.voice_client
    if not vc or not is_recording.get(ctx.guild.id):
        return await ctx.send("Not currently listening.")
    
    if vc.is_recording():
        vc.stop_recording()
    is_recording[ctx.guild.id] = False
    await ctx.send("Processing your voice...")


# ---------------------------------------------------------------------------
# Calendar connection (Google Calendar OAuth, per Discord user)
# ---------------------------------------------------------------------------
async def _calendar_connect(ctx_or_channel, discord_user_id: str, ephemeral: bool = False):
    """Generate a Google consent link for ``discord_user_id`` and deliver it."""
    import urllib.request
    import json as _json

    api_base = os.getenv("CALENDAR_API_BASE", "http://127.0.0.1:8080").rstrip("/")
    url = f"{api_base}/calendar/connect"
    req = urllib.request.Request(
        url,
        data=_json.dumps({"discord_user_id": str(discord_user_id)}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = _json.loads(resp.read().decode())
    except Exception as exc:
        return await ctx_or_channel.send(
            f"⚠️ Impossible de démarrer la connexion calendrier : {exc}"
        )

    if not data.get("ok"):
        return await ctx_or_channel.send("⚠️ Échec de la connexion calendrier.")

    link = data["auth_url"]
    msg = (
        "📅 **Connexion Google Calendar**\n"
        "Clique sur ce lien dans ton navigateur pour autoriser l'accès :\n"
        f"{link}\n\n"
        "Une fois validé, reviens ici — dis-moi « what's on my calendar » "
        "pour tester."
    )
    # Prefer a DM so the consent link stays private.
    try:
        user = ctx_or_channel.author if hasattr(ctx_or_channel, "author") else None
        if user is not None:
            await user.send(msg)
            if not ephemeral:
                await ctx_or_channel.send(
                    "🔒 J'ai envoyé le lien de connexion en MP pour garder ça privé."
                )
            return
    except Exception:
        pass
    await ctx_or_channel.send(msg)


async def _calendar_status(ctx_or_channel, discord_user_id: str):
    import urllib.request
    import json as _json

    api_base = os.getenv("CALENDAR_API_BASE", "http://127.0.0.1:8080").rstrip("/")
    url = f"{api_base}/calendar/status?discord_user_id={discord_user_id}"
    try:
        with urllib.request.urlopen(url, timeout=15) as resp:
            data = _json.loads(resp.read().decode())
    except Exception as exc:
        return await ctx_or_channel.send(f"⚠️ Erreur statut calendrier : {exc}")
    if data.get("connected"):
        return await ctx_or_channel.send("✅ Ton Google Calendar est connecté.")
    return await ctx_or_channel.send(
        "❌ Ton Google Calendar n'est pas connecté. Lance `!calendar` pour le lier."
    )


async def _calendar_events(ctx_or_channel, discord_user_id: str):
    import urllib.request
    import json as _json
    from datetime import datetime

    api_base = os.getenv("CALENDAR_API_BASE", "http://127.0.0.1:8080").rstrip("/")
    url = f"{api_base}/calendar/events"
    req = urllib.request.Request(
        url,
        data=_json.dumps({"discord_user_id": str(discord_user_id)}).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = _json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        if exc.code == 401:
            return await ctx_or_channel.send(
                "❌ Calendrier non connecté. Lance `!calendar` d'abord."
            )
        return await ctx_or_channel.send(f"⚠️ Erreur calendrier : {exc}")
    except Exception as exc:
        return await ctx_or_channel.send(f"⚠️ Erreur calendrier : {exc}")

    events = data.get("events", [])
    if not events:
        return await ctx_or_channel.send("📭 Aucun événement à venir (14 prochains jours).")
    lines = ["📅 **Ton agenda (14 prochains jours)**"]
    for ev in events:
        start = ev.get("start") or ""
        if start:
            try:
                dt = datetime.fromisoformat(start.replace("Z", "+00:00"))
                start = dt.strftime("%a %d/%m %H:%M")
            except Exception:
                pass
        lines.append(f"• **{ev.get('summary', '(sans titre)')}** — {start}")
    await ctx_or_channel.send("\n".join(lines))


@bot.command()
async def calendar(ctx, action: str = "connect"):
    """Google Calendar: !calendar [connect|status|events|disconnect]."""
    discord_user_id = str(ctx.author.id)
    action = (action or "connect").lower()
    if action in ("connect", "link", "auth"):
        await _calendar_connect(ctx, discord_user_id)
    elif action in ("status", "check"):
        await _calendar_status(ctx, discord_user_id)
    elif action in ("events", "agenda", "show"):
        await _calendar_events(ctx, discord_user_id)
    elif action in ("disconnect", "unlink"):
        import urllib.request
        import json as _json
        api_base = os.getenv("CALENDAR_API_BASE", "http://127.0.0.1:8080").rstrip("/")
        url = f"{api_base}/calendar/disconnect"
        req = urllib.request.Request(
            url,
            data=_json.dumps({"discord_user_id": discord_user_id}).encode(),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            urllib.request.urlopen(req, timeout=15).read()
            await ctx.send("🔌 Calendrier déconnecté.")
        except Exception as exc:
            await ctx.send(f"⚠️ Échec déconnexion : {exc}")
    else:
        await ctx.send(
            "Usage : `!calendar [connect|status|events|disconnect]`"
        )

def play_audio(vc, audio_bytes):
    """Plays audio bytes in the voice channel."""
    if not vc or not vc.is_connected():
        return
    
    tmp_path = f"temp_tts_{uuid.uuid4().hex}.mp3"
    with open(tmp_path, "wb") as f:
        f.write(audio_bytes)
        
    def after_playing(err):
        if err:
            print(f"Error playing audio: {err}")
        try:
            os.remove(tmp_path)
        except OSError:
            pass
            
    if vc.is_playing():
        vc.stop()
        
    vc.play(discord.FFmpegPCMAudio(tmp_path), after=after_playing)

@bot.event
async def on_message(message):
    await bot.process_commands(message)

    if message.author == bot.user:
        return

    if not message.author.bot:
        await process_discord_text_message(message)
        return

    if message.guild is None:
        return

    vc = discord.utils.get(bot.voice_clients, guild=message.guild)
    if not vc:
        return
        
    # Check if the message is from Master delegating to an agent
    # Format usually: "**[Tripo]** text"
    agent_name, text_to_speak = extract_speech_payload(message.content, message.author.name)
    
    # Ignore commands
    if text_to_speak.startswith("!"):
        return

    await speak_in_voice(message.guild, agent_name, text_to_speak)

if __name__ == "__main__":
    print("Starting Discord Voice Bridge...")
    bot.run(TOKEN)
