# Le parcours mentor — 3 minutes

Le mentor arrive, ouvre `miniva.co` sur **son** appareil. Ne prends pas son clavier.

## 0. Avant qu'il arrive (2 min)

- [ ] `miniva.co` s'ouvre sur ton téléphone, en 4G, déconnecté du wifi de la salle.
- [ ] Le compte démo marche : bouton **« Open the demo account »** sur `/login`.
- [ ] Tu sais dire, en une phrase, ce qui est **réel** et ce qui est **seedé**. (C'est écrit dans le README. Le dire toi-même avant qu'il le demande est ce qui te sauve.)

## 1. Ce que le produit fait (30 s)

> « Un serveur Discord a une équipe support. Miniva la remplace par des agents : un manager
> lit ce qui arrive, décide ce dont ça a besoin, délègue à un spécialiste, relit sa réponse
> avant qu'elle parte. Et tout ce qu'ils ont fait est tracé. »

Montre `/app` — succès, latence médiane, coût par tâche, score d'eval. Ne commente pas.
Les chiffres parlent.

## 2. Observabilité — le paramètre 7x, 28 points (60 s)

C'est **le** moment. Ouvre le run le plus cher : **`/app/runs/run_docs_4476`**.

Dis exactement ceci :

> « Ce run a coûté 9 fois la baseline. Regarde pourquoi. »

Puis pointe l'arbre : le manager a rejeté le draft **trois fois** avant d'accepter. Chaque
step a son coût, ses tokens, et sa place dans le temps. Ce n'est pas une liste de logs —
c'est un arbre d'appels : qui a appelé qui.

Ensuite, sans qu'il le demande :

- **`/app/alerts`** — « L'alerte cost-spike est partie toute seule. Seuil : 3× la baseline glissante du serveur. »
- **`/app/runs/compare`** — prends deux runs, montre que Miniva **nomme le step exact** où ils ont divergé. « C'est comme ça qu'on explique une régression sans lire deux logs. »
- **`/app/runs`** — filtre par agent, cherche du texte libre. « Recherche sur tous les runs. »

Le rubric demande littéralement : arbre d'appels, coût par step, filtre par agent, diff de
deux runs, alertes. Tout est là. **Ne le laisse pas partir sans avoir vu le diff** — c'est ce
qui sépare le L4 du L5.

## 3. Évals — le paramètre 5x, 20 points (30 s)

**`/app/evals`**.

> « Les runs qui échouent deviennent des cas de test tout seuls. Personne ne pense à les
> ajouter — le système le fait. »

Montre la courbe : le score monte de 2/5 à 5/5 à travers les versions. Montre la section
warn : les échecs de prod capturés, en attente qu'un humain écrive ce qui *aurait dû* se
passer. C'est la boucle fermée que le L5 demande.

## 4. Management UI — testé en live (60 s)

C'est le seul paramètre **testé par un volontaire**, pas par toi. Le mentor peut attraper
quelqu'un d'une autre équipe et lui demander de créer un rôle en moins de 10 minutes, sans
aide, pendant que tu te tais.

**Alors tais-toi.** Ouvre `/app/crew` → **New role** → et laisse-le faire.

Le formulaire est écrit pour ça : « What is its job? », « What is it allowed to do? »,
« Where must it stop? ». Pas de JSON, pas de jargon. Les guardrails sont des sliders.

## 5. Hermes (30 s)

> « Hermes fait tourner la crew. Miniva écrit la config, Hermes la lit sur `/v1/config` et
> construit ses agents avec. Puis il nous renvoie sa trace pendant qu'il travaille. »

Si on te demande une preuve : `node scripts/hermes-smoke.mjs` tourne contre la prod en 3
secondes et affiche l'URL du run créé. Le contrat est dans `CONTRACT.md`.

---

## Les phrases à ne PAS dire

- ❌ « Ça marche sur ma machine » → la track exige un produit 100% live.
- ❌ Laisser croire que les 7 runs seedés sont du vrai travail d'agent. **Dis-le avant qu'on te le demande.** Le rulebook est explicite : un flag honnête survit presque toujours au contrôle ; un flag caché est une disqualification automatique.
- ❌ « On n'a pas eu le temps » → dis plutôt ce que tu **as** fait, et ce que tu ferais ensuite.

## Ce qui te reste à gagner, par ordre

1. **Hermes qui poste de vrais runs** — 80 pts. Rien d'autre n'approche.
2. **Wispr Flow** — +25, un screenshot de tes stats.
3. **Dodo en mode live** — +25, si ton compte est vérifié.
