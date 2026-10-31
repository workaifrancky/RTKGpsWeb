// ============================================================
// qrcode.js — Générateur de QR code autonome (sans CDN)
// RTK Mower
// ============================================================
// Encodeur QR Code modèle 2 : mode octet uniquement, niveau de
// correction d'erreur M, versions 1 à 10 (très large pour une adresse
// du type `http://192.168.1.42:8080/`).
//
// Aucune dépendance externe : le « mode serveur local » du hub de
// transfert doit fonctionner sans Internet, contrairement aux CDN
// Leaflet / JSZip. Algorithme conforme à ISO/IEC 18004.
//
// Points d'entrée publics :
//   buildQrCodeMatrix(texte) → { version, mask, size, modules }
//   renderQrCodeSvg(texte)   → chaîne SVG (classes .qr-code-svg /
//                              .qr-code-modules, couleurs par tokens CSS)
// Les couleurs ne sont jamais codées ici : elles viennent de
// `--color-qr-surface` / `--color-qr-module` (css/design-tokens.css).

const QR_MAX_VERSION = 10;
// Niveau M (≈15 % de tolérance) : index = version du QR code.
const QR_ECC_CODEWORDS_PER_BLOCK = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const QR_ECC_BLOCKS = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];

function qrGetBit(value, index) {
  return ((value >>> index) & 1) !== 0;
}

function qrGetVersionSize(version) {
  return version * 4 + 17;
}

// Nombre de modules de données (hors motifs de fonction), en bits.
function qrGetRawDataModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function qrGetDataCodewordCount(version) {
  const rawCodewords = Math.floor(qrGetRawDataModules(version) / 8);
  return rawCodewords - QR_ECC_CODEWORDS_PER_BLOCK[version] * QR_ECC_BLOCKS[version];
}

function qrGetAlignmentPositions(version) {
  if (version === 1) return [];
  const numAlign = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (numAlign * 2 - 2)) * 2;
  const result = [6];
  for (let pos = version * 4 + 10; result.length < numAlign; pos -= step) {
    result.splice(1, 0, pos);
  }
  return result;
}

// Encodage UTF-8 minimal (les URLs sont en ASCII, mais on reste correct).
function qrEncodeUtf8(text) {
  const bytes = [];
  for (const char of String(text)) {
    const code = char.codePointAt(0);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xC0 | (code >> 6), 0x80 | (code & 0x3F));
    } else if (code < 0x10000) {
      bytes.push(0xE0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3F),
        0x80 | (code & 0x3F));
    } else {
      bytes.push(0xF0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3F),
        0x80 | ((code >> 6) & 0x3F),
        0x80 | (code & 0x3F));
    }
  }
  return bytes;
}

function qrPushBits(target, value, count) {
  for (let i = count - 1; i >= 0; i--) target.push((value >>> i) & 1);
}

// La charge utile tient-elle dans la version demandée ?
function qrFits(byteLength, version) {
  const countBits = version <= 9 ? 8 : 16;
  return 4 + countBits + byteLength * 8 <= qrGetDataCodewordCount(version) * 8;
}

// Codewords de données : mode octet, terminateur, bourrage 0xEC / 0x11.
function qrBuildDataCodewords(bytes, version) {
  const capacityBytes = qrGetDataCodewordCount(version);
  const capacityBits = capacityBytes * 8;
  const countBits = version <= 9 ? 8 : 16;
  const bits = [];

  qrPushBits(bits, 0b0100, 4);              // indicateur de mode « octet »
  qrPushBits(bits, bytes.length, countBits);
  bytes.forEach(byte => qrPushBits(bits, byte, 8));

  qrPushBits(bits, 0, Math.min(4, capacityBits - bits.length));
  qrPushBits(bits, 0, (8 - (bits.length % 8)) % 8);

  const codewords = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bits[i + j];
    codewords.push(byte);
  }
  for (let pad = 0xEC; codewords.length < capacityBytes; pad ^= 0xEC ^ 0x11) {
    codewords.push(pad);
  }
  return codewords;
}

// ─── CORRECTION D'ERREUR (Reed-Solomon, corps de Galois GF(256)) ───
function qrMultiply(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11D);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xFF;
}

function qrBuildDivisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = qrMultiply(result[j], root);
      if (j + 1 < result.length) result[j] ^= result[j + 1];
    }
    root = qrMultiply(root, 0x02);
  }
  return result;
}

function qrBuildRemainder(data, divisor) {
  const result = divisor.map(() => 0);
  data.forEach(byte => {
    const factor = byte ^ result.shift();
    result.push(0);
    divisor.forEach((coef, index) => {
      result[index] ^= qrMultiply(coef, factor);
    });
  });
  return result;
}

// Découpage en blocs, calcul du code correcteur et entrelacement.
function qrAddErrorCorrection(data, version) {
  const numBlocks = QR_ECC_BLOCKS[version];
  const blockEccLen = QR_ECC_CODEWORDS_PER_BLOCK[version];
  const rawCodewords = Math.floor(qrGetRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks);
  const shortBlockLen = Math.floor(rawCodewords / numBlocks);
  const divisor = qrBuildDivisor(blockEccLen);

  const blocks = [];
  for (let i = 0, offset = 0; i < numBlocks; i++) {
    const isShort = i < numShortBlocks;
    const dataLength = shortBlockLen - blockEccLen + (isShort ? 0 : 1);
    const dataPart = data.slice(offset, offset + dataLength);
    offset += dataLength;
    const ecc = qrBuildRemainder(dataPart, divisor);
    if (isShort) dataPart.push(0); // place réservée : blocs de longueur égale
    blocks.push(dataPart.concat(ecc));
  }

  const result = [];
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, index) => {
      if (i !== shortBlockLen - blockEccLen || index >= numShortBlocks) {
        result.push(block[i]);
      }
    });
  }
  return result;
}

// ─── CONSTRUCTION DE LA MATRICE ─────────────────────────────
// Masque i (ISO/IEC 18004, table 10) : vrai = module inversé.
function qrMaskPattern(mask, x, y) {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
  }
}

function qrBuildMatrix(version, codewords, mask) {
  const size = qrGetVersionSize(version);
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  const setFunction = (x, y, dark) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    modules[y][x] = dark;
    isFunction[y][x] = true;
  };

  // Motif de repérage (7x7) entouré d'un séparateur clair.
  const setFinder = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const distance = Math.max(Math.abs(dx), Math.abs(dy));
        setFunction(cx + dx, cy + dy, distance !== 2 && distance !== 4);
      }
    }
  };
  setFinder(3, 3);
  setFinder(size - 4, 3);
  setFinder(3, size - 4);

  // Motifs de synchronisation (ligne et colonne 6).
  for (let i = 0; i < size; i += 1) {
    if (!isFunction[6][i]) setFunction(i, 6, i % 2 === 0);
    if (!isFunction[i][6]) setFunction(6, i, i % 2 === 0);
  }

  // Motifs d'alignement (5x5), sauf ceux qui recouvrent un repère.
  const alignPositions = qrGetAlignmentPositions(version);
  const lastAlign = alignPositions.length - 1;
  alignPositions.forEach((cx, i) => {
    alignPositions.forEach((cy, j) => {
      const onFinder = (i === 0 && j === 0)
        || (i === 0 && j === lastAlign)
        || (i === lastAlign && j === 0);
      if (onFinder) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          setFunction(cx + dx, cy + dy,
            Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    });
  });

  // Informations de format (niveau M = 0b00) pour le masque courant.
  let rem = mask;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const formatBits = ((mask << 10) | rem) ^ 0x5412;
  for (let i = 0; i <= 5; i += 1) setFunction(8, i, qrGetBit(formatBits, i));
  setFunction(8, 7, qrGetBit(formatBits, 6));
  setFunction(8, 8, qrGetBit(formatBits, 7));
  setFunction(7, 8, qrGetBit(formatBits, 8));
  for (let i = 9; i < 15; i += 1) setFunction(14 - i, 8, qrGetBit(formatBits, i));
  for (let i = 0; i < 8; i += 1) setFunction(size - 1 - i, 8, qrGetBit(formatBits, i));
  for (let i = 8; i < 15; i += 1) setFunction(8, size - 15 + i, qrGetBit(formatBits, i));
  setFunction(8, size - 8, true);     // module toujours sombre

  // Informations de version (à partir de la version 7).
  if (version >= 7) {
    let versionRem = version;
    for (let i = 0; i < 12; i += 1) {
      versionRem = (versionRem << 1) ^ ((versionRem >>> 11) * 0x1F25);
    }
    const versionBits = (version << 12) | versionRem;
    for (let i = 0; i < 18; i += 1) {
      const dark = qrGetBit(versionBits, i);
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunction(a, b, dark);
      setFunction(b, a, dark);
    }
  }

  // Données : parcours en zigzag depuis la droite, deux colonnes à la fois.
  let bitIndex = 0;
  const totalBits = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;       // on saute la colonne de synchronisation
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x] && bitIndex < totalBits) {
          modules[y][x] = qrGetBit(codewords[bitIndex >>> 3], 7 - (bitIndex & 7));
          bitIndex += 1;
        }
      }
    }
  }

  // Application du masque aux seuls modules de données.
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isFunction[y][x] && qrMaskPattern(mask, x, y)) modules[y][x] = !modules[y][x];
    }
  }
  return modules;
}

// ─── ESTIMATION DU MASQUE (règles de pénalité) ──────────────
function qrGetPenaltyScore(modules) {
  const size = modules.length;
  let score = 0;

  // Règle 1 : séries de 5 modules ou plus de la même couleur.
  const scoreRuns = (line) => {
    let total = 0;
    let run = 1;
    for (let i = 1; i <= line.length; i += 1) {
      if (i < line.length && line[i] === line[i - 1]) {
        run += 1;
        continue;
      }
      if (run >= 5) total += 3 + (run - 5);
      run = 1;
    }
    return total;
  };

  // Règle 3 : motif « 1:1:3:1:1 » précédé ou suivi de 4 modules clairs.
  const finderLike = [true, false, true, true, true, false,
    true, false, false, false, false];
  const scoreFinderLike = (line) => {
    let total = 0;
    for (let i = 0; i + 11 <= line.length; i += 1) {
      let forward = true;
      let backward = true;
      for (let j = 0; j < 11; j += 1) {
        if (line[i + j] !== finderLike[j]) forward = false;
        if (line[i + j] !== finderLike[10 - j]) backward = false;
      }
      if (forward) total += 40;
      if (backward) total += 40;
    }
    return total;
  };

  const columns = [];
  for (let x = 0; x < size; x += 1) {
    const column = new Array(size);
    for (let y = 0; y < size; y += 1) column[y] = modules[y][x];
    columns.push(column);
  }

  modules.forEach(row => {
    score += scoreRuns(row) + scoreFinderLike(row);
  });
  columns.forEach(column => {
    score += scoreRuns(column) + scoreFinderLike(column);
  });

  // Règle 2 : blocs 2x2 de la même couleur.
  for (let y = 0; y + 1 < size; y += 1) {
    for (let x = 0; x + 1 < size; x += 1) {
      const value = modules[y][x];
      if (value === modules[y][x + 1]
          && value === modules[y + 1][x]
          && value === modules[y + 1][x + 1]) {
        score += 3;
      }
    }
  }

  // Règle 4 : proportion de modules sombres (écart à 50 % par pas de 5 %).
  let darkCount = 0;
  modules.forEach(row => {
    row.forEach(value => { if (value) darkCount += 1; });
  });
  const percent = (darkCount * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;
  return score;
}

// ─── API PUBLIQUE ───────────────────────────────────────────
// Retourne { version, mask, size, modules } ou null si le texte dépasse
// la version 10 (impossible pour une adresse réseau).
function buildQrCodeMatrix(text, options = {}) {
  const bytes = qrEncodeUtf8(text == null ? '' : text);

  let version = 0;
  for (let candidate = 1; candidate <= QR_MAX_VERSION; candidate += 1) {
    if (qrFits(bytes.length, candidate)) {
      version = candidate;
      break;
    }
  }
  if (!version) return null;

  const codewords = qrAddErrorCorrection(qrBuildDataCodewords(bytes, version), version);
  const forcedMask = Number.isInteger(options.mask)
    && options.mask >= 0 && options.mask <= 7
    ? options.mask
    : null;

  let bestMask = forcedMask === null ? 0 : forcedMask;
  let bestModules = qrBuildMatrix(version, codewords, bestMask);

  if (forcedMask === null) {
    let bestScore = qrGetPenaltyScore(bestModules);
    for (let mask = 1; mask < 8; mask += 1) {
      const modules = qrBuildMatrix(version, codewords, mask);
      const score = qrGetPenaltyScore(modules);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
        bestModules = modules;
      }
    }
  }

  return { version, mask: bestMask, size: bestModules.length, modules: bestModules };
}

function qrEscapeAttribute(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Rendu SVG : la zone de silence de 4 modules est incluse et les coordonnées
// sont à l'unité (le redimensionnement se fait en CSS). Les couleurs viennent
// des tokens `--color-qr-surface` / `--color-qr-module`.
function renderQrCodeSvg(text, options = {}) {
  const matrix = buildQrCodeMatrix(text, options);
  if (!matrix) return '';

  const quietZone = 4;
  const dimension = matrix.size + quietZone * 2;
  const scale = Number.isFinite(options.scale)
    ? Math.max(1, Math.round(options.scale))
    : 4;

  let path = '';
  for (let y = 0; y < matrix.size; y += 1) {
    for (let x = 0; x < matrix.size; x += 1) {
      if (matrix.modules[y][x]) {
        path += `M${x + quietZone} ${y + quietZone}h1v1h-1z`;
      }
    }
  }

  const label = qrEscapeAttribute(options.label || 'QR code');
  return `<svg class="qr-code-svg" xmlns="http://www.w3.org/2000/svg" `
    + `viewBox="0 0 ${dimension} ${dimension}" width="${dimension * scale}" `
    + `height="${dimension * scale}" role="img" aria-label="${label}" `
    + `shape-rendering="crispEdges" focusable="false">`
    + `<path class="qr-code-modules" d="${path}"/></svg>`;
}

