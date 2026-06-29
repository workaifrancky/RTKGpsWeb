// ============================================================
// stats.js — Statistiques de session v2
// RTKGpsWeb v2
// ============================================================

function computeStats() {
  const pts = getPoints();
  if (pts.length === 0) return { count:0, distance:0, area:0, avgHdop:null, avgSat:null, bestFix:'None', duration:0, tonte:0, interdit:0, obstacle:0 };

  const tonte    = pts.filter(p=>p.type==='tonte');
  const interdit = pts.filter(p=>p.type==='interdit');
  const obstacle = pts.filter(p=>p.type==='obstacle');

  let totalDistance = 0;
  for (let i=1; i<pts.length; i++) {
    totalDistance += haversine(pts[i-1].lat, pts[i-1].lon, pts[i].lat, pts[i].lon);
  }

  const validHdop = pts.filter(p=>p.hdop!==null);
  const validSat  = pts.filter(p=>p.satellites!==null);
  const avgHdop   = validHdop.length>0 ? validHdop.reduce((s,p)=>s+p.hdop,0)/validHdop.length : null;
  const avgSat    = validSat.length>0  ? Math.round(validSat.reduce((s,p)=>s+p.satellites,0)/validSat.length) : null;
  const bestFix   = pts.reduce((best,p)=>(p.fixScore||0)>(best.fixScore||0)?p:best, pts[0]).fix;
  const area      = tonte.length>=3 ? calculateArea(tonte) : 0;
  const first     = new Date(pts[0].timestamp);
  const last      = new Date(pts[pts.length-1].timestamp);
  const duration  = (last-first)/1000;

  return { count:pts.length, distance:totalDistance, area, avgHdop, avgSat, bestFix, duration, tonte:tonte.length, interdit:interdit.length, obstacle:obstacle.length };
}

function updateStatsDisplay() {
  const s = computeStats();
  setHTML('statCount',    s.count);
  setHTML('statTonte',    s.tonte);
  setHTML('statInterdit', s.interdit);
  setHTML('statObstacle', s.obstacle);
  setHTML('statDistance', s.distance>=1000 ? `${(s.distance/1000).toFixed(3)} km` : `${s.distance.toFixed(1)} m`);
  setHTML('statArea',     s.area>0 ? formatArea(s.area) : '—');
  setHTML('statHdop',     s.avgHdop!==null ? fmt(s.avgHdop,2) : '—');
  setHTML('statSat',      s.avgSat!==null  ? s.avgSat : '—');
  setHTML('statDuration', formatDuration(s.duration));
  const meta = getFixMeta(s.bestFix);
  setHTML('statBestFix',  `<span class="${meta.cssClass}" style="font-weight:800">${s.bestFix}</span>`);
}

function setHTML(id,html){const el=document.getElementById(id);if(el)el.innerHTML=html;}
