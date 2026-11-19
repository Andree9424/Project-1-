import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createProviders, ProviderError } from './providers.mjs';

const root = dirname(fileURLToPath(import.meta.url));
// Solo se lee .env en el servidor; nunca se publica en el navegador.
try {
  const env = await readFile(join(root, '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }

export function createApp(providers = createProviders({ rawgKey: process.env.RAWG_API_KEY || '' })) {
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' https: data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; connect-src 'self' https://*.steamstatic.com https://*.steampowered.com; media-src 'self' https: blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    function json(status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
    try {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'Método no permitido.' });
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/status') return json(200, providers.status());
      if (url.pathname === '/api/games') {
        const source = url.searchParams.get('source') || 'steam';
        const sort = url.searchParams.get('sort') || 'catalog';
        const query = (url.searchParams.get('q') || '').trim();
        const page = Number(url.searchParams.get('page') || 1);
        if (!['steam','epic','rawg'].includes(source) || !['catalog','popular','recent','bestsellers','rating','name'].includes(sort) || query.length > 100 || !Number.isInteger(page) || page < 1 || page > 100000) return json(400, { error: 'Filtros no válidos.' });
        if (source === 'epic' && !['popular','name'].includes(sort) || source === 'rawg' && ['bestsellers','catalog'].includes(sort)) return json(400, { error: 'Esta fuente no ofrece ese orden.' });
        return json(200, await providers.list({ source, sort, query, page }));
      }
      const match = url.pathname.match(/^\/api\/games\/((?:steam-\d{1,12}|rawg-\d{1,12}|epic-[a-f0-9]{32}))$/);
      if (match) return json(200, await providers.detail(match[1]));
      const files = { '/': ['index.html', 'text/html'], '/index.html': ['index.html','text/html'], '/style.css': ['style.css','text/css'], '/app.js': ['app.js','text/javascript'], '/cart.mjs': ['cart.mjs','text/javascript'], '/personal.mjs': ['personal.mjs','text/javascript'], '/vendor/hls.light.mjs': ['vendor/hls.light.mjs','text/javascript'] };
      const file = files[url.pathname];
      if (!file) return json(404, { error: 'No encontrado.' });
      const content = await readFile(join(root, file[0]));
      res.writeHead(200, { 'Content-Type': `${file[1]}; charset=utf-8`, 'Cache-Control': 'no-cache' });
      res.end(req.method === 'HEAD' ? undefined : content);
    } catch (error) {
      json(error instanceof ProviderError ? error.status : 500, { error: error instanceof ProviderError ? error.message : 'Ha ocurrido un error. Inténtalo de nuevo.' });
    }
  });
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  server.on('error', async error => {
    if (error.code === 'EADDRINUSE') {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/`, { signal: AbortSignal.timeout(3000) });
        if (response.ok && (await response.text()).includes('<title>NEXUS Gaming — Tu próximo universo</title>')) {
          console.log('NEXUS Gaming ya está funcionando. Pulsa Go Live en VS Code y abre http://127.0.0.1:5500.');
          return;
        }
      } catch { /* El puerto puede pertenecer a otro programa. */ }
      console.error(`Otro programa está usando el puerto ${port}. Revisa el servicio antes de cambiar la configuración.`);
    } else console.error('No se pudo iniciar NEXUS Gaming.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => console.log(`NEXUS Gaming: http://localhost:${port}`));
}
