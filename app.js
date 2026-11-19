import { createCart } from './cart.mjs';
import { createPersonal, matchesExtraFilters } from './personal.mjs';

const $ = selector => document.querySelector(selector);
const elements = { grid: $('#games-grid'), status: $('#catalog-status'), error: $('#catalog-error'), empty: $('#empty-results'), dialog: $('#game-dialog'), detail: $('#game-detail') };
const sourceNames = { steam: 'Steam', epic: 'Epic Games', rawg: 'RAWG' };
const number = new Intl.NumberFormat('es-MX');
const personal = createPersonal({ el, button, image, priceText, onOpen: openDetail });
const shop = createCart({ el, button, image, priceText, onPurchase: personal.importPurchases });
let trailerPlayer;
let games = [], page = 1, hasMore = false, savedOnly = false, listController, detailController, searchTimer, failedAppend = false;
let saved = new Map();
try {
  const data = JSON.parse(localStorage.getItem('gaming-hub-saved') || '[]');
  if (Array.isArray(data)) saved = new Map(data.filter(g => g && /^(steam-\d+|rawg-\d+|epic-[a-f0-9]{32})$/.test(g.id) && typeof g.name === 'string').slice(0, 300).map(g => [g.id, g]));
} catch { /* El catálogo también funciona cuando el almacenamiento está bloqueado. */ }

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function button(text, className, action, label) {
  const node = el('button', className, text);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  node.addEventListener('click', action);
  return node;
}
function httpsUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
function externalLink(text, url, className = '') {
  const link = el('a', className, `${text} ↗`);
  link.href = httpsUrl(url) || '#';
  link.target = '_blank'; link.rel = 'noopener noreferrer';
  link.setAttribute('aria-label', `${text}, abre otra pestaña`);
  return link;
}
function linkList(items, className = 'source-link') {
  const list = el('div', 'detail-links');
  list.append(...(items || []).map(item => externalLink(item.name, item.url, className)));
  return list;
}
function image(url, name, className, eager = false) {
  const frame = el('div', `image-frame ${className || ''}`);
  const fallback = el('span', 'image-fallback', name);
  frame.append(fallback);
  const src = httpsUrl(url);
  if (src) {
    const img = el('img'); img.src = src; img.alt = name; img.loading = eager ? 'eager' : 'lazy'; img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true }); frame.append(img);
  }
  return frame;
}
const staticHosting = location.hostname.endsWith('.github.io');
let bundledCatalog;
async function staticData(path, signal) {
  bundledCatalog ||= fetch(new URL('./data/catalog.json', import.meta.url)).then(async response => {
    if (!response.ok) throw new Error('Falta data/catalog.json. Sube también la carpeta data a GitHub.');
    return response.json();
  }).catch(error => { bundledCatalog = undefined; throw error; });
  const catalog = await bundledCatalog;
  signal?.throwIfAborted();
  const url = new URL(path, location.origin);
  if (url.pathname.startsWith('/api/games/')) {
    const game = catalog.games.find(game => game.id === url.pathname.split('/').pop());
    if (!game) throw new Error('Esta ficha no está incluida en la edición de GitHub Pages. Consulta su tienda original.');
    return game;
  }
  const source = url.searchParams.get('source') || 'steam';
  const sort = url.searchParams.get('sort') || 'catalog';
  const query = (url.searchParams.get('q') || '').trim().toLocaleLowerCase('es');
  const page = Number(url.searchParams.get('page') || 1);
  let pool = catalog.games.filter(game => game.provider === source && (!query || game.name.toLocaleLowerCase('es').includes(query)));
  if (sort === 'name') pool.sort((a, b) => a.name.localeCompare(b.name, 'es'));
  else if (sort === 'recent') pool.sort((a, b) => (b.releaseTimestamp || 0) - (a.releaseTimestamp || 0));
  else if (sort === 'rating') pool.sort((a, b) => (b.score || 0) - (a.score || 0));
  else if (!query && sort !== 'catalog' && catalog.orders[sort]) {
    const order = catalog.orders[sort];
    pool = pool.filter(game => order.includes(game.id)).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
  }
  return { games: pool.slice((page - 1) * 25, page * 25), total: pool.length, hasMore: page * 25 < pool.length, fetchedAt: catalog.fetchedAt,
    note: 'Edición GitHub Pages · catálogo guardado para la presentación. La búsqueda y los órdenes se limitan a esta selección; precios, promociones y reseñas corresponden a la fecha indicada. Consulta las tiendas para ver datos actuales.' };
}
async function getJson(path, signal) {
  if (staticHosting) return staticData(path, signal);
  try {
    const timeout = AbortSignal.timeout(45000);
    const response = await fetch(path, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
    if (!response.headers.get('content-type')?.includes('application/json')) {
      throw new Error('El servicio de datos no está disponible. Inícialo en VS Code con Ctrl + Shift + B y vuelve a intentarlo.');
    }
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'La fuente no está disponible.');
    return data;
  } catch (error) {
    if (error.name === 'TimeoutError') throw new Error('La consulta está tardando demasiado. Comprueba tu conexión y vuelve a intentarlo.');
    if (error instanceof TypeError) throw new Error('No hay conexión con NEXUS. Comprueba que Live Server y el servicio de datos estén activos.');
    throw error;
  }
}
function priceText(game) {
  if (!game.price) return 'Consultar precio';
  if (game.price.amount === 0) return 'Gratis';
  try { return new Intl.NumberFormat('es-MX', { style: 'currency', currency: game.price.currency }).format(game.price.amount) + ` ${game.price.currency}`; }
  catch { return game.price.label || 'Consultar precio'; }
}
function saveGame(game) {
  if (saved.has(game.id)) saved.delete(game.id);
  else {
    if (saved.size >= 300) { elements.status.textContent = 'Ya tienes 300 guardados. Quita uno para añadir otro.'; return; }
    saved.set(game.id, game);
  }
  try { localStorage.setItem('gaming-hub-saved', JSON.stringify([...saved.values()])); }
  catch { elements.status.textContent = 'Guardado durante esta sesión. Tu navegador no permite conservarlo al cerrar.'; }
  if (savedOnly) updateFilterOptions();
  render();
}
function card(game) {
  const article = el('article', 'game-card live-card');
  const visual = image(game.image, game.name, 'live-cover');
  visual.append(el('span', 'game-badge', game.rank ? `#${game.rank} · MÁS JUGADOS` : sourceNames[game.provider] || game.provider));
  const isSaved = saved.has(game.id);
  const save = button(isSaved ? '♥' : '♡', 'save-game', () => saveGame(game), `${isSaved ? 'Quitar de' : 'Añadir a'} guardados: ${game.name}`);
  save.setAttribute('aria-pressed', String(isSaved));
  visual.append(save);
  const body = el('div', 'card-body');
  const heading = el('div', 'card-title');
  const title = el('h3');
  title.append(button(game.name, 'card-open', () => openDetail(game)));
  heading.append(title);
  if (game.score) { const score = el('span', 'rating', `MC ${game.score}`); score.title = `${game.scoreSource}: ${game.score}/100`; heading.append(score); }
  body.append(heading, el('p', 'card-description', game.description || game.genres?.join(' · ') || 'Abre la ficha para conocer este juego.'));
  const platforms = el('div', 'platform-tags'); (game.platforms || []).slice(0, 3).forEach(p => platforms.append(el('span', '', p))); body.append(platforms);
  const footer = el('div', 'card-footer');
  footer.append(el('span', 'game-price', priceText(game)));
  footer.append(button('Ver ficha ↗', 'details-button', () => openDetail(game), `Ver ficha de ${game.name}`));
  body.append(footer);
  const cartButton = shop.addButton(game);
  if (cartButton) body.append(cartButton);
  body.append(personal.compareButton(game));
  if (game.peakPlayers !== null && game.peakPlayers !== undefined) body.append(el('div', 'peak-players', `${number.format(game.peakPlayers)} jugadores · pico del periodo`));
  article.append(visual, body); return article;
}
function visiblePool() { return savedOnly ? [...saved.values()] : games; }
function updateFilterOptions() {
  for (const [selector, key, label] of [['#genre','genres','Todos los géneros'], ['#platform','platforms','Todas las plataformas']]) {
    const select = $(selector), previous = select.value;
    const values = [...new Set(visiblePool().flatMap(g => g[key] || []))].sort((a,b) => a.localeCompare(b, 'es'));
    select.replaceChildren(new Option(label, ''), ...values.map(value => new Option(value, value)));
    select.value = values.includes(previous) ? previous : '';
  }
}
function render() {
  updateDiscoveryTabs();
  let pool = [...visiblePool()];
  if ($('#sort').value === 'rating') pool.sort((a,b) => (b.score ?? -1) - (a.score ?? -1));
  if (savedOnly) {
    const q = $('#search').value.trim().toLowerCase();
    if (q) pool = pool.filter(g => g.name.toLowerCase().includes(q));
    const sort = $('#sort').value;
    if (sort === 'name') pool.sort((a,b) => a.name.localeCompare(b.name, 'es'));
    if (sort === 'recent') pool.sort((a,b) => b.releaseTimestamp - a.releaseTimestamp);
  }
  const genre = $('#genre').value, platform = $('#platform').value;
  const extra = { budget: $('#budget').value, year: $('#release-year').value, kind: $('#play-mode').value };
  const shown = pool.filter(g => (!genre || g.genres?.includes(genre)) && (!platform || g.platforms?.includes(platform)) && (!$('#free-only').checked || g.price?.amount === 0) && matchesExtraFilters(g, extra));
  elements.grid.replaceChildren(...shown.map(card));
  elements.empty.hidden = shown.length > 0;
  $('#result-count').textContent = `${shown.length} JUEGOS${savedOnly ? ' GUARDADOS' : ' PARA DESCUBRIR'}`;
  $('#load-more').hidden = !hasMore || savedOnly;
  $('#saved-count').textContent = saved.size;
}
function updateDiscoveryTabs() {
  $('.discovery-tabs').hidden = savedOnly || $('#source').value !== 'steam';
  for (const tab of document.querySelectorAll('[data-order]')) {
    tab.setAttribute('aria-pressed', String(tab.dataset.order === $('#sort').value));
  }
}
function skeleton() {
  elements.grid.replaceChildren(...Array.from({ length: 8 }, () => { const node = el('div', 'skeleton-card'); node.setAttribute('aria-hidden','true'); return node; }));
}
async function loadGames(append = false) {
  clearTimeout(searchTimer);
  updateDiscoveryTabs();
  if (savedOnly) { render(); return; }
  listController?.abort(); const controller = listController = new AbortController();
  if (!append) { page = 1; games = []; skeleton(); }
  elements.error.hidden = true; elements.empty.hidden = true;
  $('#load-more').hidden = !append;
  $('#load-more').disabled = true;
  $('#load-more').textContent = 'Cargando más juegos…';
  for (const id of ['#genre', '#platform', '#free-only']) $(id).disabled = true;
  elements.grid.setAttribute('aria-busy', 'true');
  elements.status.textContent = append ? 'Cargando más juegos…' : `Buscando mundos en ${sourceNames[$('#source').value]}…`;
  $('#catalog-note').textContent = ''; $('#updated-at').textContent = '';
  const query = new URLSearchParams({ source: $('#source').value, sort: $('#sort').value, q: $('#search').value.trim(), page: String(page) });
  try {
    const data = await getJson(`/api/games?${query}`, controller.signal);
    if (controller !== listController) return;
    games = [...new Map([...(append ? games : []), ...data.games].map(g => [g.id, g])).values()];
    hasMore = data.hasMore;
    const total = data.total;
    failedAppend = false;
    updateFilterOptions(); render();
    elements.status.textContent = `${sourceNames[$('#source').value]} · ${number.format(games.length)} juegos cargados${Number.isFinite(total) ? ` · ${number.format(total)} resultados ${staticHosting ? 'en el catálogo guardado' : 'en la fuente'}` : ''}. Filtros sobre los juegos cargados.`;
    $('#load-more').textContent = `Cargar más juegos ↓${Number.isFinite(total) ? ` · ${number.format(total)} resultados` : ''}`;
    $('#catalog-note').textContent = data.note;
    $('#updated-at').textContent = `Consultado: ${new Date(data.fetchedAt).toLocaleString('es-MX')} · Puede utilizar datos en caché. Precios y disponibilidad sujetos a la tienda.`;
    if ($('#source').value === 'rawg') $('#catalog-note').append(' ', externalLink('Datos de RAWG', 'https://rawg.io/'));
  } catch (error) {
    if (error.name === 'AbortError' || controller !== listController) return;
    if (!append) elements.grid.replaceChildren();
    else { page = Math.max(1, page - 1); $('#load-more').hidden = false; }
    failedAppend = append;
    elements.status.textContent = 'La consulta no se completó.';
    $('#error-message').textContent = error.message;
    elements.error.hidden = false;
    $('#result-count').textContent = 'CATÁLOGO NO DISPONIBLE';
  } finally {
    if (controller === listController) {
      elements.grid.setAttribute('aria-busy', 'false');
      $('#load-more').disabled = false;
      for (const id of ['#genre', '#platform', '#free-only']) $(id).disabled = false;
    }
  }
}
function configureSort() {
  const source = $('#source').value;
  const options = source === 'epic' ? [['name','Nombre A–Z']] : source === 'rawg' ? [['popular','Popularidad · usuarios de RAWG'], ['recent','Lanzamientos recientes'], ['rating','Mejor puntuación · Metacritic'], ['name','Nombre A–Z']] : [['catalog','Explorar catálogo · Steam'], ['popular','Más jugados · Steam'], ['recent','Lanzamientos recientes'], ['bestsellers','Más vendidos · Steam'], ['rating','Mejor puntuación · Metacritic'], ['name','Nombre A–Z']];
  $('#sort').replaceChildren(...options.map(([value,label]) => new Option(label,value)));
}
function detailSection(title, text) { const section = el('section','detail-section'); section.append(el('h3','',title)); if (text) section.append(el('p','',text)); return section; }
function stopTrailer() {
  trailerPlayer?.destroy(); trailerPlayer = undefined;
  elements.detail.querySelector('video')?.pause();
}
function trailerSection(game) {
  const section = detailSection('Tráiler y videos');
  const fallback = externalLink('Buscar tráiler en YouTube', `https://www.youtube.com/results?search_query=${encodeURIComponent(game.name + ' official trailer')}`, 'text-link');
  const movies = game.trailers || [];
  if (!movies.length) { section.append(el('p', '', 'La fuente no proporciona un video reproducible para este juego.'), fallback); return section; }
  const select = el('select'); select.setAttribute('aria-label', 'Elegir video del juego');
  movies.forEach((movie, i) => select.append(new Option(movie.name || `Video ${i + 1}`, String(i))));
  const video = el('video', 'game-video'); video.controls = true; video.preload = 'none'; video.playsInline = true; video.poster = movies[0].poster || game.image;
  const status = el('p', 'catalog-note', 'Pulsa reproducir para cargar el video. No se reproduce automáticamente.');
  const play = button('Reproducir tráiler ▶', 'button trailer-play', async () => {
    stopTrailer(); play.disabled = true; status.textContent = 'Cargando video…';
    const movie = movies[Number(select.value)];
    try {
      if (movie.hls && !video.canPlayType('application/vnd.apple.mpegurl')) {
        const { default: Hls } = await import('./vendor/hls.light.mjs');
        if (!video.isConnected || !elements.dialog.open) return;
        if (!Hls.isSupported()) throw new Error('Formato no compatible');
        trailerPlayer = new Hls({ enableWorker: false });
        trailerPlayer.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) { status.textContent = 'No se pudo reproducir este video. Puedes probar otro o buscar el tráiler.'; play.disabled = false; stopTrailer(); } });
        trailerPlayer.loadSource(movie.url); trailerPlayer.attachMedia(video);
      } else video.src = movie.url;
      video.poster = movie.poster || game.image;
      await video.play(); status.textContent = movie.name || 'Video de la ficha de Steam.';
    } catch { status.textContent = 'No se pudo iniciar el video. Prueba otro o usa el enlace al tráiler.'; }
    finally { play.disabled = false; }
  });
  select.addEventListener('change', () => { stopTrailer(); video.removeAttribute('src'); video.load(); video.poster = movies[Number(select.value)].poster || game.image; status.textContent = 'Pulsa reproducir para ver el video seleccionado.'; });
  video.addEventListener('error', () => { status.textContent = 'Este video no está disponible. Puedes buscar el tráiler con el enlace de abajo.'; });
  section.append(select, video, play, status, fallback); return section;
}
function drawDetail(game, loading = false) {
  stopTrailer();
  const fragment = document.createDocumentFragment();
  fragment.append(image(game.image, game.name, 'detail-cover', true));
  const content = el('div','detail-content');
  content.append(el('p','eyebrow',`${sourceNames[game.provider]} / FICHA DEL JUEGO`));
  const title = el('h2','',game.name); title.id = 'detail-title'; content.append(title);
  content.append(el('p','detail-description',game.description || (loading ? 'Cargando descripción…' : 'La fuente no proporciona una descripción para este juego.')));
  if (!loading && game.fullDescription && game.fullDescription !== game.description) {
    const more = el('details','full-description'); more.append(el('summary','','Leer descripción completa'),el('p','detail-description',game.fullDescription)); content.append(more);
  }
  const meta = el('dl','detail-meta');
  for (const [label,value] of [['Dónde jugar',(game.platforms || []).join(' · ') || 'Consulta la tienda'], ['Lanzamiento',game.release || 'No disponible en esta fuente'], ['Géneros',(game.genres || []).join(' · ') || 'No disponible'], ['Desarrollador / editor',(game.developers || []).join(', ') || 'No disponible']]) { const pair = el('div'); pair.append(el('dt','',label),el('dd','',value)); meta.append(pair); }
  content.append(meta);
  const detailCartButton = shop.addButton(game);
  if (detailCartButton) content.append(detailCartButton);
  content.append(personal.compareButton(game));
  if (loading) content.append(el('p','detail-loading','Consultando tiendas y reseñas…'));
  else {
    if (staticHosting) content.append(el('p', 'demo-notice', 'Ficha guardada para GitHub Pages. Precios, reseñas y disponibilidad corresponden a la fecha indicada; confirma los datos actuales en la tienda.'));
    content.append(personal.editor(game), trailerSection(game));
    const reviews = detailSection('Lo que dice la comunidad');
    if (game.reviews) {
      const row = el('div','review-summary'); row.append(el('strong','',game.reviews.percent === null ? '—' : `${game.reviews.percent}%`));
      const copy = el('div'); copy.append(el('b','',game.reviews.label || 'Reseñas de Steam'),el('p','',`${number.format(game.reviews.total)} reseñas · todos los idiomas · todo el periodo`)); row.append(copy); reviews.append(row, externalLink('Leer reseñas en Steam',game.reviews.url,'text-link'));
    } else reviews.append(el('p','',game.reviewError || 'Esta fuente no ofrece un resumen de reseñas. Consulta los sitios de reseñas más abajo.'));
    if (game.score) { const score = el('p','critic-score',`${game.score}/100 · ${game.scoreSource}`); if (game.scoreUrl) score.append(' ', externalLink('Ver puntuación',game.scoreUrl,'text-link')); reviews.append(score); }
    if (game.communityScore) reviews.append(el('p','critic-score',`${game.communityScore}/5 · Usuarios de RAWG · ${number.format(game.ratingsCount)} valoraciones`));
    content.append(reviews);
    const stores = detailSection('Dónde comprar o jugar', 'Enlaces de tienda proporcionados por la fuente. Confirma edición, plataforma, región y precio antes de comprar.');
    const storeLinks = linkList(game.stores, 'store-link');
    if (!game.stores?.length) storeLinks.append(el('p','','La fuente no ha proporcionado enlaces directos. Puedes buscar en las tiendas de abajo.'));
    stores.append(storeLinks); if (game.price) stores.append(el('p','detail-price',`${priceText(game)} · ${sourceNames[game.provider]} · región México`)); content.append(stores);
    const searches = detailSection('Buscar en otras tiendas', 'Estos enlaces abren búsquedas. No confirman que el juego esté disponible en esa tienda o consola.');
    searches.append(linkList(game.storeSearches)); content.append(searches);
    const other = detailSection('Reseñas, listas y guías', 'Consulta las fuentes originales. Sus puntuaciones no se importan automáticamente, salvo cuando se indica su procedencia arriba.');
    other.append(linkList(game.reviewLinks)); content.append(other);
    if (game.screenshots?.length) { const gallery = detailSection('Dentro del juego'); const images = el('div','detail-gallery'); game.screenshots.forEach((url,i) => { const link = externalLink('',url); link.setAttribute('aria-label',`Abrir captura ${i+1} de ${game.name}`); link.replaceChildren(image(url,`Captura ${i+1} de ${game.name}`)); images.append(link); }); gallery.append(images); content.append(gallery); }
    const attribution = el('p','catalog-note',`Fuente: ${sourceNames[game.provider]}. Consultado: ${new Date(game.fetchedAt).toLocaleString('es-MX')}. Las imágenes pertenecen a sus respectivos titulares.`);
    if (game.rawgUrl) attribution.append(' ',externalLink('Ficha en RAWG',game.rawgUrl)); content.append(attribution);
  }
  fragment.append(content); elements.detail.replaceChildren(fragment);
}
async function openDetail(game) {
  detailController?.abort(); const controller = detailController = new AbortController();
  drawDetail(game,true);
  if (!elements.dialog.open) elements.dialog.showModal();
  document.body.classList.add('dialog-open'); elements.dialog.scrollTop = 0;
  try { const data = await getJson(`/api/games/${game.id}`,controller.signal); if (controller === detailController && elements.dialog.open) drawDetail(data); }
  catch (error) { if (error.name !== 'AbortError' && controller === detailController && elements.dialog.open) { const note = el('div','detail-content'); note.append(el('p','',error.message)); const retry = el('button','button','Reintentar ficha'); retry.type='button'; retry.addEventListener('click',()=>openDetail(game)); note.append(retry); elements.detail.append(note); elements.detail.querySelector('.detail-loading')?.remove(); } }
}
$('.dialog-close').addEventListener('click',()=>elements.dialog.close());
elements.dialog.addEventListener('close',()=> { detailController?.abort(); stopTrailer(); document.body.classList.remove('dialog-open'); });
elements.dialog.addEventListener('click',event=> { if (event.target === elements.dialog) { const r=elements.dialog.getBoundingClientRect(); if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) elements.dialog.close(); } });
$('#catalog-form').addEventListener('submit',event=> { event.preventDefault(); loadGames(); });
$('#search').addEventListener('input',()=> { clearTimeout(searchTimer); searchTimer=setTimeout(()=>loadGames(),500); });
$('#source').addEventListener('change',()=> { configureSort(); $('#genre').value=''; $('#platform').value=''; loadGames(); });
$('#sort').addEventListener('change',()=>loadGames());
for (const tab of document.querySelectorAll('[data-order]')) {
  tab.addEventListener('click', () => { $('#sort').value = tab.dataset.order; loadGames(); });
}
for (const id of ['#genre','#platform','#free-only','#budget','#release-year','#play-mode']) $(id).addEventListener('change',render);
$('#retry').addEventListener('click',()=> { if (failedAppend) page++; loadGames(failedAppend); });
$('#load-more').addEventListener('click',()=> { page++; loadGames(true); });
$('#saved-toggle').addEventListener('click',()=> {
  savedOnly=!savedOnly; $('#saved-toggle').setAttribute('aria-pressed',String(savedOnly));
  $('#source').disabled=savedOnly; listController?.abort(); elements.grid.setAttribute('aria-busy','false'); elements.error.hidden=true;
  if (savedOnly) { $('#sort').replaceChildren(new Option('Nombre A–Z','name'),new Option('Lanzamientos recientes','recent'),new Option('Mejor puntuación · Metacritic','rating')); updateFilterOptions(); elements.status.textContent='Tus guardados en este navegador. Los datos corresponden al momento en que guardaste cada juego; abre su ficha para actualizarlos.'; $('#catalog-note').textContent=''; $('#updated-at').textContent=''; render(); } else { configureSort(); loadGames(); }
});
$('#reset-filters').addEventListener('click',()=> { for (const id of ['#search','#genre','#platform','#budget','#release-year','#play-mode']) $(id).value=''; $('#free-only').checked=false; loadGames(); });
$('#saved-count').textContent=saved.size;
if (staticHosting) {
  $('#source').querySelector('option[value="rawg"]').remove();
  for (const tab of document.querySelectorAll('[data-order="popular"], [data-order="bestsellers"]')) tab.title = 'Clasificación guardada en la fecha del catálogo';
}
if (location.protocol === 'file:') {
  elements.grid.setAttribute('aria-busy','false'); elements.status.textContent='Abre NEXUS Gaming desde su servidor local.'; elements.error.hidden=false;
  $('#error-message').textContent='Ejecuta npm start en la carpeta Proyect y entra en http://localhost:3000. La conexión a las fuentes necesita el servidor.';
} else loadGames();
