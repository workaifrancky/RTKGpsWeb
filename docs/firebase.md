# Firebase — synchronisation des parcelles (Mower Survey)

## 1. Ce qui est synchronisé

| Donnée | Emplacement | Synchronisée |
|---|---|---|
| Parcelles + points | `users/{uid}/projects/{projectId}` (Firestore) | ✅ |
| Bibliothèque globale d'obstacles (`rtkGlobalObstacles`) | `localStorage` | ❌ (locale) |
| Préférences (thème, NTRIP, format d'export, gants…) | `localStorage` | ❌ (locales) |

Chaque document `projects/{projectId}` contient :

```js
{
  payload: { /* parcelle complète, structure identique au localStorage */ },
  name: 'JARDIN NORD',
  updatedAt: <timestamp serveur>
}
```

## 2. Configuration du client

- `js/firebase-config.js` : `FIREBASE_CONFIG` (valeurs **publiques** générées par
  Firebase Console) et `CLOUD_SYNC_ENABLED`.
- `CLOUD_SYNC_ENABLED = false` → application 100 % locale (aucun appel réseau).
- `js/cloud-sync.js` : authentification, écoute temps réel, envoi groupé,
  migration initiale, interface (panneau Connexion + modale « Compte cloud »).

## 3. Prérequis dans la console Firebase

1. **Authentication → Sign-in method** : « E-mail/Mot de passe » **activé**.
2. **Authentication → Settings → Domaines autorisés** : ajouter chaque domaine
   depuis lequel l'application est ouverte, sinon l'erreur
   `auth/unauthorized-domain` :
   - `localhost` (déjà présent par défaut) ;
   - le domaine **localtunnel** utilisé sur le terrain (`https://xxxx.loca.lt`,
     voir `start-public.ps1`) ;
   - le domaine **GitHub Pages** (`https://<compte>.github.io`).
3. **Firestore Database → Règles** : chaque utilisateur n'accède qu'à son
   sous-arbre. Publier :

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/projects/{projectId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    // Tout le reste est fermé.
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

4. **Restrictions de clé API** (recommandé) — Google Cloud Console →
   *API et services* → *Identifiants* → clé du navigateur :
   - restreindre aux domaines réellement utilisés (localhost, loca.lt,
     GitHub Pages) ;
   - restreindre aux API *Identity Toolkit* et *Cloud Firestore*.

> La configuration Firebase web (dont `apiKey`) est **publique par nature** :
> elle identifie le projet. La confidentialité des données repose sur les règles
> Firestore ci-dessus, jamais sur le secret de cette clé.

## 4. Fonctionnement

1. **Connexion** : panneau Connexion (roue dentée du header) → bloc
   « Synchronisation » → « Se connecter » (ou « Créer un compte », « Mot de
   passe oublié »).
2. **Source locale conservée** : `localStorage` reste la référence de l'appareil
   (terrain sans réseau). Firestore est une **synchronisation**, pas un
   remplacement.
3. **Temps réel** : `onSnapshot` sur la collection ; tout changement distant est
   appliqué localement puis l'interface est rafraîchie (tiroir, historique,
   carte, RELEVÉ).
4. **Envoi** : chaque enregistrement passe par `saveProjects()` →
   `scheduleCloudPush()` → un `batch` Firestore **1,5 s** plus tard (regroupe les
   points d'un même tracé). Les parcelles supprimées localement sont supprimées
   dans le cloud.
5. **Migration initiale** : si le cloud est vide et que l'appareil possède déjà
   des parcelles, elles sont envoyées automatiquement **une fois par compte**
   (clé `rtkCloudMigrated_<uid>`). Toast : « N parcelle(s) envoyée(s) vers le
   cloud ».
6. **Hors-ligne** : cache IndexedDB du SDK (`enablePersistence`) ; les écritures
   sont rejouées à la reconnexion. Sans réseau **et** sans cache, l'application
   fonctionne en local.

## 5. Limites connues

- **Dernier écrivain gagne** : pas de fusion champ par champ. Le cas visé
  (téléphone sur le terrain, tablette à distance) ne provoque pas d'écriture
  simultanée ; deux appareils modifiant la même parcelle au même instant
  garderont la dernière version reçue.
- **1 document par parcelle** : limite Firestore de 1 Mio par document (plusieurs
  milliers de points).
- `rtkGlobalObstacles` n'est pas encore synchronisée.
- Caméra, Bluetooth et Firestore exigent un contexte sécurisé (HTTPS ou
  `localhost`).
