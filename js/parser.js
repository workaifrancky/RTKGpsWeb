// ============================================================
// parser.js — Décodage des trames BLE de l'ESP32
// RTKGpsWeb v2 — Nomenclature unifiée
// ============================================================

const FIX_NORMALIZE = {
  'rtk fix':'RTK Fix','rtkfix':'RTK Fix','rtk_fix':'RTK Fix','fix':'RTK Fix','4':'RTK Fix',
  'floatrtk':'Float RTK','float rtk':'Float RTK','float_rtk':'Float RTK','float':'Float RTK','5':'Float RTK',
  'dgps':'DGPS','2':'DGPS',
  'gps':'GPS','1':'GPS',
  'none':'None','invalid':'None','0':'None','':'None',
};

const FIX_META = {
  'RTK Fix':   { score:4, precision:'< 2 cm',  label:'Excellente', cssClass:'fix-rtk',   badgeClass:'badge-rtk',   icon:'✅', dotClass:'rtk'   },
  'Float RTK': { score:3, precision:'< 20 cm', label:'Bonne',      cssClass:'fix-float', badgeClass:'badge-float', icon:'⚠️', dotClass:'float' },
  'DGPS':      { score:2, precision:'< 1 m',   label:'Moyenne',    cssClass:'fix-dgps',  badgeClass:'badge-dgps',  icon:'📡', dotClass:'dgps'  },
  'GPS':       { score:1, precision:'< 5 m',   label:'Faible',     cssClass:'fix-gps',   badgeClass:'badge-gps',   icon:'📡', dotClass:'gps'   },
  'None':      { score:0, precision:'Inconnue',label:'Aucune',     cssClass:'fix-none',  badgeClass:'badge-none',  icon:'🚫', dotClass:'none'  },
};

function normalizeFix(raw) {
  if (!raw) return 'None';
  return FIX_NORMALIZE[raw.toString().trim().toLowerCase()] || 'None';
}

function extractNumber(text, key) {
  const regex = new RegExp(key.replace(':', '\\s*:?') + '\\s*([\\-]?\\d+(?:[.,]\\d+)?)');
  const match = text.match(regex);
  if (!match) return null;
  const val = parseFloat(match[1].replace(',', '.'));
  return isNaN(val) ? null : val;
}

function extractString(text, key) {
  const regex = new RegExp(key.replace(':', '\\s*:?') + '\\s*([^\\r\\n]+)');
  const match = text.match(regex);
  return match ? match[1].trim() : null;
}

function parseGpsFrame(rawText) {
  if (!rawText || rawText.trim().length === 0) return _invalid('Trame vide');
  const text = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  const fix  = normalizeFix(extractString(text, 'Fix:'));
  const meta = FIX_META[fix];
  const lat  = extractNumber(text, 'Lat:');
  const lon  = extractNumber(text, 'Lon:');

  const data = {
    lat, lon,
    alt:        extractNumber(text, 'Alt:'),
    relX:       extractNumber(text, 'Rel_X:'),
    relY:       extractNumber(text, 'Rel_Y:'),
    satellites: extractNumber(text, 'Sat:'),
    hdop:       extractNumber(text, 'HDOP:'),
    speed:      extractNumber(text, 'Speed:'),
    course:     extractNumber(text, 'Cap:'),
    date:       extractString(text, 'Date:'),
    fix, ...meta,
    receivedAt: new Date().toISOString(),
    raw:        rawText,
    parseError: null,
  };

  const v = validateFrame(data);
  data.isValid      = v.isValid;
  data.rejectReason = v.reason;
  return data;
}

function _invalid(reason) {
  return {
    isValid:false, rejectReason:reason,
    fix:'None', ...FIX_META['None'],
    lat:null, lon:null, alt:null,
    satellites:null, hdop:null,
    receivedAt:new Date().toISOString(),
    raw:'', parseError:reason,
  };
}

function validateFrame(d) {
  if (d.lat === null)              return { isValid:false, reason:'Latitude manquante' };
  if (d.lon === null)              return { isValid:false, reason:'Longitude manquante' };
  if (d.lat < -90  || d.lat > 90) return { isValid:false, reason:`Latitude hors limites : ${d.lat}` };
  if (d.lon < -180 || d.lon > 180)return { isValid:false, reason:`Longitude hors limites : ${d.lon}` };
  if (d.score === 0)               return { isValid:false, reason:'Aucun fix GPS' };
  return { isValid:true, reason:null };
}

function getFixMeta(fixType)  { return FIX_META[fixType] || FIX_META['None']; }
function getFixClass(fixType) { return getFixMeta(fixType).cssClass; }
function getFixColor(fixType) {
  const c = { 'RTK Fix':'#16a34a','Float RTK':'#d97706','DGPS':'#2563eb','GPS':'#6b7280','None':'#dc2626' };
  return c[fixType] || '#dc2626';
}

// Score min pour enregistrer (Float RTK ou mieux)
const MIN_RECORD_SCORE = 3;

function isPositionValid(data) {
  return !!(data && data.isValid && data.score >= MIN_RECORD_SCORE);
}

function getRecordBlockReason(data) {
  if (!data)                       return 'Aucune donnée GPS reçue';
  if (!data.isValid)               return data.rejectReason || 'Position invalide';
  if (data.score < MIN_RECORD_SCORE) return `Fix insuffisant : ${data.fix} — Float RTK minimum requis`;
  return null;
}