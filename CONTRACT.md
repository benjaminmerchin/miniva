# Miniva ↔ Hermes — contrat d'intégration

Convex est la mémoire partagée. **Miniva écrit la config des agents, Hermes la lit.
Hermes écrit la trace d'exécution, Miniva l'affiche en temps réel.**

Tu n'as besoin que de 4 appels HTTP. Pas de client Convex, pas de SDK — du `fetch` nu.

**Base URL** : `https://<deployment>.convex.site` (l'URL *HTTP Actions*, en `.convex.site`,
pas `.convex.cloud`). Je te la donne dès que le déploiement est fait.

**Auth** : `Authorization: Bearer <ingestKey>`. La clé identifie le serveur Discord —
tu n'as jamais à manipuler d'ID Convex. Je génère une clé par serveur onboardé et je te
l'injecte dans l'instance Hermes au provisioning (variable d'env `MINIVA_INGEST_KEY`).

---

## 1. Au boot : lire la crew

```bash
GET /v1/config
Authorization: Bearer $MINIVA_INGEST_KEY
```

```json
{
  "guildId": "1234567890",
  "plan": "pro",
  "agents": [
    {
      "key": "manager",
      "name": "Ops Manager",
      "role": "manager",
      "job": "Read the incoming message, decide which specialists it needs, delegate, review their output before it ships.",
      "tools": ["discord.reply", "discord.react"],
      "guardrails": {
        "maxCostUsd": 0.5,
        "maxSteps": 25,
        "requiresHumanApproval": false,
        "allowedChannelIds": ["999"],
        "escalateToDiscordUserId": "42"
      },
      "model": "gpt-5.5",
      "version": 3
    }
  ]
}
```

C'est ça que l'utilisateur définit dans le wizard Miniva : `job`, `tools`, `guardrails`.
Tu construis la crew Hermes à partir de ce JSON. **Relis-le quand tu veux** — je bumpe
`version` à chaque édition, donc tu peux poller ou recharger sur signal.

## 2. Une tâche démarre

```bash
POST /v1/runs
{
  "runId": "run_01H...",          # à toi, stable, on est idempotent dessus
  "taskKind": "support_ticket",
  "input": "mon paiement est passé 2x",
  "discordChannelId": "999",
  "discordUserId": "42",
  "agentVersions": [{"key": "manager", "version": 3}]   # optionnel mais précieux
}
```

## 3. Chaque action d'agent → un step

C'est **le** endpoint qui compte. Envoie au fil de l'eau (streaming) ou par batch
(`{"steps": [...]}`). Idempotent sur `stepId` : tu peux retry un flush raté.

```bash
POST /v1/steps
{
  "runId": "run_01H...",
  "stepId": "step_004",
  "parentStepId": "step_001",     # ⚠️ LE champ critique — voir plus bas
  "agentKey": "refunds-specialist",
  "type": "tool_call",            # plan|delegate|llm_call|tool_call|handoff|review|escalate|output
  "name": "linkup.search",
  "input": "refund policy stripe",
  "output": "...",
  "tokensIn": 1200,
  "tokensOut": 340,
  "costUsd": 0.0043,
  "startedAt": 1752240000000,     # epoch ms
  "endedAt": 1752240002100,
  "status": "ok"                  # ou "error" + "error": "message"
}
```

### ⚠️ `parentStepId` — ne le laisse pas tomber

C'est lui qui fait que la trace est un **arbre** (qui a appelé qui) et pas une liste à plat.
Le rubric "Observability" plafonne à L3 (14 pts) sans arbre d'appels, et monte à L4/L5
(21–28 pts) avec. C'est le champ le plus rentable de tout le contrat.

- Step racine (le manager qui prend la tâche) → `parentStepId` absent/null.
- Le manager délègue au spécialiste → le step du spécialiste a le `stepId` du manager en parent.
- Le spécialiste appelle un tool → le step du tool a le `stepId` du spécialiste en parent.

Envoie aussi `costUsd` et les tokens **par step**, pas seulement au total : le L4 exige
« tokens et coût attribués à chaque step ».

## 4. La tâche se termine

```bash
POST /v1/runs/complete
{
  "runId": "run_01H...",
  "status": "succeeded",          # succeeded | failed | escalated
  "outcome": "Refund de 12,40€ émis, ticket #431 fermé, message posté dans #support"
}
```

`outcome` = ce qui a **réellement atterri sur la surface réelle**. C'est la phrase que le
mentor va lire pour juger le paramètre root (20x, 80 pts). Sois concret : ce qui a été écrit,
où, pour qui.

Deux choses se déclenchent automatiquement côté Miniva quand un run finit :
- `failed` ou `escalated` → une **alerte** + le run devient un **cas d'eval** (la boucle fermée
  du rubric "Evaluation" L5 : les échecs de prod alimentent le jeu de tests tout seuls).
- coût > 3× la baseline du serveur → une **alerte cost spike**.

### Voice channel live

Le bridge Discord vocal utilise le même auth serveur (`MINIVA_INGEST_KEY`) et le
même ingest HTTP. Pour chaque prise de parole dans un channel vocal :

1. STT produit une transcription.
2. Le bridge appelle `HERMES_AGENT_URL` avec `source: "discord_voice"`.
3. Pocket TTS génère la voix de réponse.
4. Le bridge rejoue l'audio dans le même channel vocal.
5. Miniva reçoit un run `taskKind: "discord_voice"` avec trois steps imbriqués :
   `speech.transcribe` → `hermes.agent` → `pocket-tts.speak`.

L'URL Hermes reste une seule ligne d'env :

```bash
HERMES_AGENT_URL=hermes-cli://local
# or, once deployed:
# HERMES_AGENT_URL=http://127.0.0.1:8787/api/agent
```

## 5. Provisioning fini

```bash
POST /v1/provisioned
{ "hermesInstanceId": "i-abc123", "hermesUrl": "https://...", "status": "live" }
```

Le serveur passe de `provisioning` à `live` dans l'UI. C'est ce qui débloque l'écran.

---

## Ce dont j'ai besoin de toi, dans l'ordre

1. **Confirme que tu peux envoyer `parentStepId`** depuis l'orchestration Hermes. Si Hermes
   n'expose pas la relation parent/enfant nativement, dis-le-moi *maintenant* — on trouvera
   un contournement, mais c'est 14 points qui se jouent là.
2. **`costUsd` + tokens par step.** Idem, si tu ne les as pas par step, dis-le tout de suite.
3. Une fois que tu provisionnes : lis `MINIVA_INGEST_KEY` depuis l'env de l'instance.

Tant que tu n'es pas prêt, je bosse contre des données seedées au même format — donc au
moment où tu branches, ça s'affiche sans rien changer côté UI.
