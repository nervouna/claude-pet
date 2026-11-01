const http = require('node:http');

const MAX_BODY = 32 * 1024 * 1024;

// Local endpoint the Claude Code hooks post to. Only listens on loopback.
function startServer({ port, onEvent, getState, onError }) {
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/event') {
      const chunks = [];
      let size = 0;
      req.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_BODY) chunks.push(chunk);
      });
      req.on('end', () => {
        res.writeHead(204).end();
        if (size > MAX_BODY) return;
        try {
          onEvent(JSON.parse(Buffer.concat(chunks).toString('utf8')));
        } catch {
          // Malformed payloads are ignored; hooks must never be affected.
        }
      });
      return;
    }
    if (req.method === 'GET' && req.url === '/state') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(getState()));
      return;
    }
    res.writeHead(404).end();
  });
  server.on('error', onError);
  server.listen(port, '127.0.0.1');
  return server;
}

module.exports = { startServer };
