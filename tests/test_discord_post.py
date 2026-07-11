import urllib.request
import json
import os

token = os.getenv('DISCORD_TOKEN', 'YOUR_DISCORD_TOKEN')
channel_id = '1525451187959365706'
url = f'https://discord.com/api/v10/channels/{channel_id}/messages'

headers = {
    'Authorization': f'Bot {token}',
    'Content-Type': 'application/json',
    'User-Agent': 'DiscordBot (https://github.com/discord/discord-api-docs, 1.0)'
}

data = json.dumps({
    'content': '🚀 **Bonjour Discord !**\n\nJe suis le nouvel **Orchestrateur Intelligent**.\nMon cerveau est relié à OpenRouter (Gemma 27B) et mon système de détection des sous-agents (Tripo ✈️, Taxy 🧾, Grogro 🛒) est en ligne et 100% opérationnel !'
}).encode('utf-8')

req = urllib.request.Request(url, data=data, headers=headers, method='POST')

try:
    with urllib.request.urlopen(req) as response:
        print('Status:', response.getcode())
        print('Response:', response.read().decode('utf-8'))
except urllib.error.URLError as e:
    if hasattr(e, 'read'):
        print('Error:', e.read().decode('utf-8'))
    else:
        print('Error:', e)
