// ============================================================
// firebase-config.js — Configuration Firebase (Mower Survey)
// ============================================================
// Configuration générée par Firebase Console (projet `mower-survey`).
//
// ⚠️ Cette configuration est **publique par nature** : elle identifie le
// projet, elle ne contient aucun secret. La sécurité repose sur :
//   1. les **règles Firestore** (voir docs/firebase.md) : chaque utilisateur
//      n'accède qu'à `users/{uid}/**` ;
//   2. les **domaines autorisés** (Authentication → Paramètres → Domaines
//      autorisés) : sans cela, `auth/unauthorized-domain` ;
//   3. les **restrictions de la clé API** (Google Cloud Console → Identifiants).
// Ne jamais placer ici de clé de compte de service (server-side).
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAP9fBUegNZHTqcgb7fvy98wohXeDgWmPc',
  authDomain: 'mower-survey.firebaseapp.com',
  projectId: 'mower-survey',
  storageBucket: 'mower-survey.firebasestorage.app',
  messagingSenderId: '459053103322',
  appId: '1:459053103322:web:abbe580aa40afdc5244de3',
};

// Interrupteur global : `false` = application 100 % locale (localStorage),
// aucun appel réseau et aucune requête d'authentification. Utile pour tester
// ou dépanner hors Firebase.
const CLOUD_SYNC_ENABLED = true;
