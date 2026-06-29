// ============================================================
// ntrip.js — Sélection de station de référence NTRIP
// ============================================================

const NTRIP_STORAGE_KEY = 'rtkSelectedNtripStation';
const NTRIP_DEFAULT_STATION_ID = 'bod1';

const NTRIP_STATIONS = [
  {
    id: 'near',
    name: 'NEAR',
    lat: null,
    lon: null,
    operational: true,
    specialNote: 'Sélection automatique de la base opérationnelle la plus proche',
  },
  {
    id: 'bod1',
    name: 'BOD1',
    lat: 44.832223988119964,
    lon: -0.7019923801219144,
    operational: true,
  },
  {
    id: 'idre',
    name: 'IDRE',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'luch',
    name: 'LUCH',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'uevb',
    name: 'UEVB',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'pierro',
    name: 'PIERRO',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'bens',
    name: 'BENS',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'beroy',
    name: 'BEROY',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'bay40',
    name: 'BAY40',
    lat: null,
    lon: null,
    operational: true,
  },
  {
    id: 'nas40',
    name: 'NAS40',
    lat: null,
    lon: null,
    operational: true,
  },
];

let selectedNtripStationId = null;

document.addEventListener('DOMContentLoaded', () => {
  selectedNtripStationId = loadSelectedNtripStationId();
});

function loadSelectedNtripStationId() {
  const saved = localStorage.getItem(NTRIP_STORAGE_KEY);
  return NTRIP_STATIONS.some(station => station.id === saved)
    ? saved
    : (NTRIP_STATIONS.some(station => station.id === NTRIP_DEFAULT_STATION_ID)
      ? NTRIP_DEFAULT_STATION_ID
      : (NTRIP_STATIONS[0]?.id || null));
}

function saveSelectedNtripStationId(stationId) {
  if (stationId) localStorage.setItem(NTRIP_STORAGE_KEY, stationId);
}

function getSelectedNtripStation() {
  if (!selectedNtripStationId) selectedNtripStationId = loadSelectedNtripStationId();
  return NTRIP_STATIONS.find(station => station.id === selectedNtripStationId) || NTRIP_STATIONS[0] || null;
}

function initNtripBar() {
  renderNtripStationSelect();
}

function renderNtripStationSelect() {
  const select = document.getElementById('ntripSelect');
  if (!select) return;

  if (!selectedNtripStationId) selectedNtripStationId = loadSelectedNtripStationId();

  select.innerHTML = NTRIP_STATIONS.map(station => {
    const suffix = station.id === 'near'
      ? ' — automatique'
      : station.id === NTRIP_DEFAULT_STATION_ID
        ? ' — défaut'
        : '';
    return `<option value="${station.id}" ${station.id === selectedNtripStationId ? 'selected' : ''}>${station.name}${suffix}</option>`;
  }).join('');

  select.value = selectedNtripStationId || '';
}

function selectNtripStation(stationId) {
  const station = NTRIP_STATIONS.find(item => item.id === stationId);
  if (!station) return;

  selectedNtripStationId = station.id;
  saveSelectedNtripStationId(station.id);
  renderNtripStationSelect();

  if (typeof refreshMap === 'function') refreshMap();
}
