const http = require('http');
const fs = require('fs');
const path = require('path');

const HOST = '0.0.0.0';
const PORT = 3000;
const ROOT_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8'
};

function sendResponse(res, statusCode, body, headers = {}) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function getSafePath(requestPath) {
  const decodedPath = decodeURIComponent(requestPath.split('?')[0]);
  const normalizedPath = path.normalize(decodedPath).replace(/^([.][.][/\\])+/, '');
  const relativePath = normalizedPath === '/' ? '/index.html' : normalizedPath;
  const resolvedPath = path.resolve(ROOT_DIR, `.${relativePath}`);

  if (!resolvedPath.startsWith(ROOT_DIR)) {
    return null;
  }

  return resolvedPath;
}

const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    return sendResponse(res, 200, JSON.stringify({ ok: true }), {
      'Content-Type': 'application/json; charset=utf-8'
    });
  }

  const filePath = getSafePath(req.url || '/');
  if (!filePath) {
    return sendResponse(res, 403, 'Forbidden', {
      'Content-Type': 'text/plain; charset=utf-8'
    });
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr) {
      return sendResponse(res, 404, 'Not Found', {
        'Content-Type': 'text/plain; charset=utf-8'
      });
    }

    const finalPath = stats.isDirectory() ? path.join(filePath, 'index.html') : filePath;

    fs.readFile(finalPath, (readErr, data) => {
      if (readErr) {
        return sendResponse(res, 404, 'Not Found', {
          'Content-Type': 'text/plain; charset=utf-8'
        });
      }

      const ext = path.extname(finalPath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      return sendResponse(res, 200, data, { 'Content-Type': contentType });
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`CodeRunner is serving at http://${HOST}:${PORT}`);
});
