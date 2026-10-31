# animated-data-qr-js (vendorisé)

Bibliothèque tierce copiée localement pour que le hub de transfert puisse l'utiliser
**sans CDN** (le mode « serveur local » doit fonctionner sans Internet).

- **Projet** : <https://github.com/ymuichiro/animated_data_qr_js>
- **Version** : `v0.1.0` (tag Git `610d276c4f6c1187e02ddab584c3bc103fd54347`)
- **Licence** : MIT (voir `LICENSE`)
- **Usage** : transfert de données navigateur → navigateur via une **séquence de QR codes
  animés** (découpage, compression, animation, reconstruction côté récepteur).

## Pourquoi vendorisé et pas en CDN

La balise CDN documentée par le projet amont —

```html
<script src="https://cdn.jsdelivr.net/npm/animated-data-qr-js@0.1.0/dist/animated-data-qr.umd.min.js"></script>
```

— **renvoie 404** : le paquet npm `animated-data-qr-js` n'est pas publié.

Vérifications effectuées le 2026-10-31 :

| Source | Résultat |
|---|---|
| `registry.npmjs.org/animated-data-qr-js` | 404 (paquet non publié) |
| `data.jsdelivr.com/v1/packages/npm/animated-data-qr-js` | 404 |
| `api.github.com/repos/ymuichiro/animated_data_qr_js/releases` | `[]` (aucune release) |
| `api.github.com/repos/ymuichiro/animated_data_qr_js/contents/dist?ref=v0.1.0` | 404 (`dist/` non committé) |
| `ymuichiro.github.io/animated_data_qr_js/dist/*` | **200** (artefact CI du tag v0.1.0) |

Les fichiers ci-dessous proviennent donc du **GitHub Pages** du projet amont, construits
depuis le tag `v0.1.0`.

## Fichiers

| Fichier | Taille | SHA-256 |
|---|---|---|
| `animated-data-qr.umd.min.js` | 134 999 o | `36821FE02403FC2A81C9CC6D4CABBECF58DF3057635C9DB40FCD954D271769E0` |
| `animated-data-qr.decoder.worker.js` | 74 375 o | `CAEBA871557296B5FAB008880BDA798E31B5C336B0FD8B0626806565CDC6A607` |
| `zxing_reader.wasm` | 988 964 o | `8F2A99B0C9FDF8123D0152BA4761FC7DBF58C7DE7E4937D1E134AAE17E2AD795` |
| `LICENSE` | 1 056 o | `1126322E2CC8D165ADC4C792EEB195717DE2BCC7B39BE1CE77959D78E87EF685` |

Les trois fichiers `js`/`wasm` **doivent rester dans le même dossier** : le bundle résout
l'URL du worker et du wasm relativement à son propre `src` (`document.currentScript.src`).
`locateFile()` est surchargé vers le wasm local — aucun téléchargement CDN au runtime.

**Seule modification locale** : la ligne finale `//# sourceMappingURL=…` a été retirée du
bundle (la source map n'est pas publiée en amont : elle renvoyait un 404 dans les DevTools).

## API exposée

Le bundle UMD déclare le global **`AnimatedDataQR`** (`window.AnimatedDataQR`) :

```js
const { createQrSender, createQrReceiver, resolveTransferPreset } = window.AnimatedDataQR;
```

> ⚠ Le README amont écrit `window.AnimatedDataQr` : c'est une coquille. Le global réel est
> `AnimatedDataQR` (majuscules).

Le **récepteur** utilise la caméra et exige le worker + le wasm ci-dessus ; le **sender**
affiche la séquence de QR dans un conteneur DOM (`createQrSender(container)`).

## Mise à jour

1. Vérifier qu'une version est publiée sur npm (`registry.npmjs.org/animated-data-qr-js`) ;
   si oui, préférer jsDelivr et supprimer ce dossier.
2. Sinon, récupérer les trois fichiers depuis le GitHub Pages du tag visé :
   `https://ymuichiro.github.io/animated_data_qr_js/dist/…`
3. Remplacer les fichiers, retirer la ligne `//# sourceMappingURL=…`, recalculer les
   SHA-256 ci-dessus (`Get-FileHash -Algorithm SHA256`), mettre à jour la version et le tag.
4. Vérifier dans `index.html` que le `<script>` pointe toujours sur ce dossier.
