const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');

const rootDir = __dirname;
const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 8000);

// Adresses IPv4 non internes : sert au « mode serveur local » du hub de
// transfert (JS : transferViaLocalServer() → GET /api/local-info).
function getLocalAddresses() {
  const addresses = [];
  const interfaces = os.networkInterfaces();
  Object.values(interfaces).forEach(list => {
    (list || []).forEach(entry => {
      if (!entry || entry.family !== 'IPv4' || entry.internal) return;
      addresses.push(entry.address);
    });
  });
  return addresses;
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    // Force fresh fetch in browsers (useful during field tests and rapid UI iterations).
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    Pragma: 'no-cache',
    Expires: '0',
    'Surrogate-Control': 'no-store',
  });
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const relativePath = urlPath === '/' ? '/index.html' : urlPath;
  const filePath = path.normalize(path.join(rootDir, relativePath));

  // Petite API locale (aucune dépendance) : liste les adresses réseau du poste
  // pour que l'application mobile puisse afficher l'URL « mode local ».
  if (urlPath === '/api/local-info') {
    const addresses = getLocalAddresses();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    });
    res.end(JSON.stringify({
      ok: true,
      port,
      addresses,
      urls: addresses.map(address => `http://${address}:${port}/`),
    }));
    return;
  }

  if (!filePath.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (error, stat) => {
    if (error || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    sendFile(res, filePath);
  });
});

server.listen(port, host, () => {
  console.log(`Serving http://${host}:${port}`);
});