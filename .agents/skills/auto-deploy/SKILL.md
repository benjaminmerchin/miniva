---
name: auto-deploy
description: >
  Automate git commit, push, and simple free deployment steps. Trigger when the user asks to "push", "deploy", "sauvegarde", or "mets en ligne".
---

# Auto Deploy & Push Skill

Ce skill est conçu pour sauvegarder le code et le déployer de manière simple, gratuite et fiable.
Il n'utilise pas d'outils complexes, mais s'appuie sur les standards de l'industrie (Git) qui peuvent déclencher des déploiements gratuits (GitHub Actions, Vercel, Render, ou scripts locaux).

## Étapes de déploiement

1. **Vérification du statut (Git Status)**
   - Utilise toujours `git status` pour vérifier ce qui a été modifié avant de faire quoi que ce soit.

2. **Commit des changements (Git Commit)**
   - Utilise `git add .` pour ajouter tous les fichiers modifiés (ou cible spécifiquement si l'utilisateur le demande).
   - Utilise `git commit -m "auto: [résumé des modifications]"` en créant un message clair de ce qui vient d'être fait.

3. **Push des changements (Git Push)**
   - Utilise `git push` (ou `git push origin main` si nécessaire) pour envoyer le code.
   - *Note :* Sur des plateformes gratuites (Vercel, Render, Railway, GitHub Pages), le simple fait de faire un `git push` déclenche automatiquement le déploiement. C'est la méthode "zéro configuration".

4. **Déploiement spécifique (si applicable)**
   - Si le projet tourne localement ou sur un VPS via PM2, exécute `pm2 restart all` (ou le nom spécifique du processus).
   - Si un webhook de déploiement est configuré, déclenche-le avec un simple `curl`.

## Règles d'or
- **Fiabilité avant tout :** Pas de configuration d'usine à gaz. Le push Git est la source de vérité.
- Ne tente pas d'installer des outils de CI/CD complexes comme Jenkins.
- Garde l'utilisateur informé des étapes en cours.
