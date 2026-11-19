// Adaptadores independientes: los datos ausentes nunca se sustituyen por cifras inventadas.
export class ProviderError extends Error {
  constructor(message, status = 502) { super(message); this.status = status; }
}

export function safeUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' ? u.href : ''; } catch { return ''; }
}
export function plain(value = '') {
  return String(value).replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}
export function releaseTime(value) {
  const months = { ene:'jan', feb:'feb', mar:'mar', abr:'apr', may:'may', jun:'jun', jul:'jul', ago:'aug', sep:'sep', oct:'oct', nov:'nov', dic:'dec' };
  const normalized = String(value || '').toLowerCase().replace(/\b(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic)\b/g, m => months[m]);
  const result = Date.parse(normalized);
  return Number.isFinite(result) ? result : 0;
}
export function sourceLinks(name) {
  const q = encodeURIComponent(name);
  return [
    { name: 'Backloggd', url: `https://www.backloggd.com/search/games/?q=${q}` },
    { name: 'GameFAQs', url: `https://gamefaqs.gamespot.com/search?game=${q}` },
    { name: 'OpenCritic', url: `https://opencritic.com/search?criteria=${q}` },
    { name: 'Metacritic', url: `https://www.metacritic.com/search/${q}/` },
  ];
}
export function storeSearches(name) {
  const q = encodeURIComponent(name);
  return [
    { name: 'Steam', url: `https://store.steampowered.com/search/?term=${q}` },
    { name: 'Epic Games', url: `https://store.epicgames.com/es-MX/browse?q=${q}&sortBy=relevancy&sortDir=DESC&count=40` },
    { name: 'Xbox', url: `https://www.xbox.com/es-MX/Search/Results?q=${q}` },
    { name: 'PlayStation', url: `https://store.playstation.com/es-mx/search/${q}` },
    { name: 'GOG', url: `https://www.gog.com/en/games?query=${q}` },
  ];
}

export function normalizeSteam(d) {
  return {
    id: `steam-${d.steam_appid}`, provider: 'steam', externalId: d.steam_appid, name: plain(d.name),
    image: safeUrl(d.header_image), description: plain(d.short_description), fullDescription: plain(d.about_the_game || d.detailed_description || '').slice(0, 12000),
    platforms: Object.entries(d.platforms || {}).filter(([, enabled]) => enabled).map(([key]) => ({ windows: 'Windows', mac: 'macOS', linux: 'Linux' })[key]).filter(Boolean),
    genres: (d.genres || []).map(g => plain(g.description)), release: d.release_date?.date || '', releaseTimestamp: releaseTime(d.release_date?.date), comingSoon: !!d.release_date?.coming_soon,
    developers: d.developers || [],
    playModes: ['single','multi','coop'].filter(mode => (d.categories || []).some(category => ({ single: [2], multi: [1, 9, 20, 36, 37, 38, 39], coop: [9, 38, 39] })[mode].includes(Number(category.id)))),
    score: d.metacritic?.score || null, scoreSource: 'Metacritic vía Steam', scoreUrl: safeUrl(d.metacritic?.url),
    price: d.is_free ? { amount: 0, currency: 'MXN', label: 'Gratis', discount: 0 } : d.price_overview ? { amount: d.price_overview.final / 100, currency: d.price_overview.currency, label: d.price_overview.final_formatted, discount: d.price_overview.discount_percent } : null,
    stores: [{ name: 'Steam', url: `https://store.steampowered.com/app/${d.steam_appid}/` }],
    screenshots: (d.screenshots || []).slice(0, 5).map(s => safeUrl(s.path_full)).filter(Boolean),
    trailers: (d.movies || []).map(movie => ({ name: plain(movie.name), poster: safeUrl(movie.thumbnail), url: safeUrl(movie.mp4?.max || movie.mp4?.['480'] || movie.webm?.max || movie.webm?.['480'] || movie.hls_h264), hls: !movie.mp4 && !movie.webm })).filter(movie => movie.url).slice(0, 4),
  };
}

export function normalizeEpic(d) {
  const slug = d.catalogNs?.mappings?.find(m => m.pageType === 'productHome')?.pageSlug || d.offerMappings?.find(m => m.pageType === 'productHome')?.pageSlug || d.productSlug;
  const price = d.price?.totalPrice;
  const decimals = price?.currencyInfo?.decimals ?? 2;
  return {
    id: `epic-${d.id}`, provider: 'epic', externalId: d.id, name: plain(d.title),
    image: safeUrl((d.keyImages?.find(i => i.type === 'OfferImageWide') || d.keyImages?.find(i => i.type === 'DieselStoreFrontWide') || d.keyImages?.[0])?.url),
    description: plain(d.description), platforms: ['PC (consulta requisitos en Epic)'], genres: [],
    release: '', releaseTimestamp: 0, comingSoon: false, developers: [plain(d.seller?.name || '')].filter(Boolean), score: null, scoreSource: '', scoreUrl: '',
    price: price ? { amount: price.discountPrice / 10 ** decimals, currency: price.currencyCode, discount: 0, label: price.discountPrice === 0 ? 'Gratis' : '' } : null,
    stores: slug ? [{ name: 'Epic Games', url: safeUrl(`https://store.epicgames.com/es-MX/p/${slug}`) }] : [],
    screenshots: (d.keyImages || []).filter(i => i.type === 'featuredMedia').map(i => safeUrl(i.url)).filter(Boolean).slice(0, 5),
  };
}

export function normalizeRawg(d) {
  return {
    id: `rawg-${d.id}`, provider: 'rawg', externalId: d.id, name: plain(d.name), image: safeUrl(d.background_image),
    description: plain(d.description_raw || d.description || ''), platforms: (d.platforms || []).map(p => plain(p.platform.name)),
    genres: (d.genres || []).map(g => plain(g.name)), release: d.released || '', releaseTimestamp: releaseTime(d.released), comingSoon: false,
    developers: (d.developers || []).map(v => plain(v.name)), score: d.metacritic || null, scoreSource: 'Metacritic vía RAWG', scoreUrl: safeUrl(d.metacritic_url),
    communityScore: d.rating || null, ratingsCount: d.ratings_count || 0, price: null, stores: [], screenshots: [],
    rawgUrl: `https://rawg.io/games/${d.slug || d.id}`,
    popularity: d.added || 0,
  };
}

// Solo se extraen identificadores de Steam; nunca se envía HTML externo al cliente.
export function parseSteamSearch(data) {
  if (data.success !== 1 || typeof data.results_html !== 'string' || !Number.isFinite(Number(data.total_count))) {
    throw new ProviderError('Steam no pudo devolver esta página del catálogo. Inténtalo de nuevo.');
  }
  const ids = [...new Set([...data.results_html.matchAll(/<a\b[^>]*\bdata-ds-appid="(\d+)"[^>]*>/g)].map(match => match[1]))];
  return { ids, total: Number(data.total_count) };
}

export function createProviders({ fetchImpl = fetch, rawgKey = '', now = () => Date.now() } = {}) {
  const cache = new Map();
  const pending = new Map();
  async function request(key, url, ttl = 300000) {
    const saved = cache.get(key);
    if (saved && saved.until > now()) return saved.value;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      let response;
      try { response = await fetchImpl(url, { signal: AbortSignal.timeout(18000), headers: { Accept: 'application/json' } }); }
      catch { throw new ProviderError('No pudimos conectar con la fuente. Comprueba tu conexión e inténtalo de nuevo.'); }
      if (!response.ok) throw new ProviderError(response.status === 429 ? 'La fuente ha limitado las consultas. Espera unos minutos y vuelve a intentarlo.' : 'La fuente no está disponible en este momento.');
      let value;
      try { value = await response.json(); } catch { throw new ProviderError('La fuente devolvió una respuesta no válida.'); }
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { value, until: now() + ttl });
      return value;
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  }
  async function mapLimit(items, fn, concurrency = 4) {
    const results = new Array(items.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) { const i = cursor++; try { results[i] = await fn(items[i]); } catch { results[i] = null; } }
    }));
    return results.filter(Boolean);
  }
  async function steamDetails(id) {
    const data = await request(`steam-detail-${id}`, `https://store.steampowered.com/api/appdetails?appids=${id}&l=spanish&cc=mx`, 3600000);
    const entry = data[id];
    if (!entry?.success || entry.data.type !== 'game') throw new ProviderError('Este elemento no tiene una ficha de videojuego disponible.', 404);
    return normalizeSteam(entry.data);
  }
  async function steamReviews(id) {
    const input = encodeURIComponent(JSON.stringify({ appid: Number(id), languages: ['all'], num_per_page: 0, day_range: 0, purchase_type: 1, display_language: 'spanish' }));
    const data = await request(`steam-reviews-${id}`, `https://api.steampowered.com/IUserReviewsService/GetAppReviews/v1/?input_json=${input}`, 600000);
    const summary = data.response?.query_summary;
    if (!summary || !Number.isFinite(summary.total_reviews)) throw new ProviderError('El resumen de reseñas no está disponible.');
    return { total: summary.total_reviews, positive: summary.total_positive, negative: summary.total_negative, label: summary.review_score_desc || '', percent: summary.total_reviews ? Math.round(summary.total_positive / summary.total_reviews * 100) : null, source: 'Usuarios de Steam', url: `https://store.steampowered.com/app/${id}/#app_reviews_hash` };
  }
  async function epicGames() {
    const data = await request('epic-promotions', 'https://store-site-backend-static.ak.epicgames.com/freeGamesPromotions?locale=es-MX&country=MX&allowCountries=MX');
    const entries = data.data?.Catalog?.searchStore?.elements;
    if (!Array.isArray(entries)) throw new ProviderError('El catálogo de promociones de Epic no está disponible.');
    return entries.filter(d => d.offerType === 'BASE_GAME' && d.price?.totalPrice?.discountPrice === 0 && d.promotions?.promotionalOffers?.some(group => group.promotionalOffers?.some(p => Date.parse(p.startDate) <= now() && Date.parse(p.endDate) > now()))).map(normalizeEpic);
  }
  async function rawg(path, params = {}) {
    if (!rawgKey) throw new ProviderError('Para explorar juegos de consolas, configura tu clave de RAWG en el archivo .env. Steam y Epic funcionan sin ella.', 503);
    const query = new URLSearchParams({ ...params, key: rawgKey });
    return request(`rawg-${path}-${new URLSearchParams(params)}`, `https://api.rawg.io/api/${path}?${query}`);
  }
  async function list({ source = 'steam', query = '', sort = 'popular', page = 1 } = {}) {
    const fetchedAt = new Date(now()).toISOString();
    if (source === 'epic') {
      let games = await epicGames();
      if (query) games = games.filter(g => g.name.toLowerCase().includes(query.toLowerCase()));
      games.sort((a, b) => a.name.localeCompare(b.name, 'es'));
      return { games, fetchedAt, hasMore: false, note: 'Promociones gratuitas activas de Epic en México. No representa todo su catálogo; confirma los requisitos y el plazo en la tienda.' };
    }
    if (source === 'rawg') {
      const ordering = { popular: '-added', recent: '-released', rating: '-metacritic', name: 'name' }[sort] || '-added';
      const params = { page: String(page), page_size: '24', ordering };
      if (query) params.search = query;
      if (sort === 'recent') params.dates = `1970-01-01,${new Date(now()).toISOString().slice(0, 10)}`;
      const data = await rawg('games', params);
      if (!Array.isArray(data.results)) throw new ProviderError('RAWG no devolvió un catálogo válido.');
      return { games: data.results.map(normalizeRawg), total: data.count ?? null, fetchedAt, hasMore: !!data.next, note: 'Datos de RAWG. Popularidad = número de usuarios que agregaron el juego; no equivale a descargas. Los filtros se aplican a los resultados cargados.' };
    }
    let entries, note, total = null, hasMore = false;
    if (query || ['catalog','recent','bestsellers','name'].includes(sort)) {
      const size = 25;
      const params = new URLSearchParams({ page: String(page), start: String((page - 1) * size), count: String(size), term: query, category1: '998', json: '1', infinite: '1', l: 'spanish', cc: 'mx' });
      if (sort === 'name') params.set('sort_by', 'Name_ASC');
      if (sort === 'recent') params.set('sort_by', 'Released_DESC');
      if (sort === 'bestsellers') params.set('filter', 'topsellers');
      const data = await request(`steam-catalog-${params}`, `https://store.steampowered.com/search/results/?${params}`);
      const result = parseSteamSearch(data);
      total = result.total;
      hasMore = page * size < total && result.ids.length > 0;
      entries = result.ids.map(id => ({ appid: Number(id) }));
      note = 'Catálogo público de Steam para México, con páginas de 25 resultados. La disponibilidad depende de la región y de los filtros de Steam. Los filtros de género, plataforma y gratis se aplican a los juegos cargados.';
      if (query) note += ' La búsqueda consulta todo el catálogo público de la tienda; también puede coincidir con palabras de la descripción.';
      if (sort === 'recent') note += ' Orden de lanzamiento de Steam; puede incluir próximos estrenos.';
      if (sort === 'bestsellers') note += ' Orden de más vendidos de Steam; no son descargas.';
    } else {
      const data = await request('steam-chart', 'https://api.steampowered.com/ISteamChartsService/GetMostPlayedGames/v1/');
      if (!Array.isArray(data.response?.ranks)) throw new ProviderError('La clasificación de Steam no está disponible.');
      total = data.response.ranks.length;
      entries = data.response.ranks.slice((page - 1) * 25, page * 25);
      hasMore = page * 25 < total;
      note = `Clasificación de más jugados de Steam (semana del ${new Date(data.response.rollup_date * 1000).toISOString().slice(0, 10)}). Pico = jugadores simultáneos en el periodo; no son descargas. Usa «Explorar catálogo» para acceder a juegos fuera de esta clasificación.`;
    }
    const games = await mapLimit(entries, async entry => ({ ...await steamDetails(entry.appid), rank: entry.rank || null, peakPlayers: entry.peak_in_game ?? null }));
    if (entries.length && !games.length) throw new ProviderError('Steam no pudo cargar las fichas. Vuelve a intentarlo dentro de unos minutos.');
    if (sort === 'recent') games.sort((a,b) => b.releaseTimestamp - a.releaseTimestamp);
    if (sort === 'rating') games.sort((a,b) => (b.score ?? -1) - (a.score ?? -1));
    if (sort === 'name') games.sort((a,b) => a.name.localeCompare(b.name, 'es'));
    if (sort === 'rating') note += ' Orden por Metacritic dentro de esta selección; los juegos sin puntuación aparecen al final.';
    if (games.length < entries.length) note += ` Se omitieron ${entries.length - games.length} elementos no disponibles o que no son videojuegos.`;
    return { games, fetchedAt, hasMore, total, note };
  }
  async function detail(id) {
    const [source, externalId] = id.split('-');
    let game;
    if (source === 'steam') {
      game = await steamDetails(externalId);
      try { game = { ...game, reviews: await steamReviews(externalId) }; }
      catch (error) { game = { ...game, reviewError: error.message }; }
    } else if (source === 'epic') {
      game = (await epicGames()).find(g => g.externalId === externalId);
      if (!game) throw new ProviderError('Esta promoción ya no está disponible.', 404);
    } else if (source === 'rawg') {
      const data = await rawg(`games/${externalId}`);
      game = normalizeRawg(data);
      const extra = await Promise.allSettled([rawg(`games/${externalId}/stores`), rawg(`games/${externalId}/screenshots`)]);
      const stores = (extra[0].status === 'fulfilled' ? extra[0].value.results || [] : []).map(s => ({ name: (data.stores || []).find(v => v.store.id === s.store_id)?.store.name || 'Tienda', url: safeUrl(s.url) })).filter(s => s.url);
      const screenshots = (extra[1].status === 'fulfilled' ? extra[1].value.results || [] : []).map(s => safeUrl(s.image)).filter(Boolean).slice(0,5);
      game = { ...game, stores, screenshots, reviewError: 'Consulta las reseñas completas en sus sitios de origen.' };
    } else throw new ProviderError('Fuente desconocida.', 400);
    return { ...game, fetchedAt: new Date(now()).toISOString(), reviewLinks: sourceLinks(game.name), storeSearches: storeSearches(game.name) };
  }
  return { list, detail, status: () => ({ steam: true, epic: true, rawg: !!rawgKey }) };
}
