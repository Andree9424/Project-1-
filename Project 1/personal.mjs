export const libraryStates = { wishlist: 'Quiero jugar', playing: 'Jugando', completed: 'Terminados' };
export const validGame = game => game && /^(steam-\d+|rawg-\d+|epic-[a-f0-9]{32})$/.test(game.id) && typeof game.name === 'string';
export function gameSummary(game) {
  return Object.fromEntries(['id','name','provider','image','platforms','genres','release','releaseTimestamp','score','scoreSource','price','playModes'].filter(key => game[key] !== undefined).map(key => [key, game[key]]));
}
export function mergePurchase(previous, game) {
  return { status: 'wishlist', rating: 0, review: '', ...previous, game: { provider: game.id.split('-')[0], ...previous?.game, ...gameSummary(game) }, demoPurchase: true };
}

export function matchesExtraFilters(game, { budget = '', year = '', kind = '' } = {}) {
  if (budget !== '' && (!Number.isFinite(game.price?.amount) || game.price.currency !== 'MXN' || game.price.amount > Number(budget))) return false;
  if (year && (!game.releaseTimestamp || new Date(game.releaseTimestamp).getUTCFullYear() !== Number(year))) return false;
  if (kind && !game.playModes?.includes(kind)) return false;
  return true;
}

export function createPersonal({ el, button, image, priceText, onOpen }) {
  const announce = message => { document.querySelector('#shop-status').textContent = message; };
  function read(key, validate) {
    try { const data = JSON.parse(localStorage.getItem(key) || '[]'); return Array.isArray(data) ? data.filter(validate) : []; } catch { return []; }
  }
  function store(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); return true; } catch { announce('Los cambios se conservarán durante esta sesión. El navegador no permite guardarlos de forma permanente.'); return false; }
  }
  const library = new Map(read('nexus-library-v1', item => validGame(item?.game) && Object.hasOwn(libraryStates, item.status) && Number.isInteger(item.rating) && item.rating >= 0 && item.rating <= 5 && typeof item.review === 'string').slice(0, 500).map(item => [item.game.id, { ...item, review: item.review.slice(0, 1000) }]));
  const compared = new Map(read('nexus-compare-v1', validGame).slice(0, 2).map(game => [game.id, game]));
  const importedOrders = new Set(read('nexus-library-orders-v1', id => typeof id === 'string'));
  const dialog = el('dialog', 'personal-dialog');
  dialog.setAttribute('aria-labelledby', 'personal-title');
  const close = button('×', 'dialog-close', () => dialog.close(), 'Cerrar panel personal');
  const content = el('div', 'detail-content'); dialog.append(close, content); document.body.append(dialog);
  dialog.addEventListener('close', () => document.body.classList.remove('personal-open'));
  function open(title) {
    content.replaceChildren(); const heading = el('h2', '', title); heading.id = 'personal-title'; content.append(heading);
    if (!dialog.open) dialog.showModal(); document.body.classList.add('personal-open'); dialog.scrollTop = 0;
  }
  function saveLibrary() {
    document.querySelector('#library-count').textContent = library.size;
    libraryView();
    return store('nexus-library-v1', [...library.values()]);
  }
  function updateCompared() {
    document.querySelector('#compare-count').textContent = compared.size;
    for (const node of document.querySelectorAll('[data-compare-game]')) {
      const active = compared.has(node.dataset.compareGame);
      node.textContent = active ? 'Seleccionado para comparar ✓' : 'Comparar +'; node.setAttribute('aria-pressed', String(active));
    }
  }
  function comparison() {
    open('Compara tus próximos juegos');
    content.append(el('p', 'catalog-note', 'Selecciona dos juegos desde sus tarjetas o fichas. Los datos son una referencia de la fuente al seleccionarlos; abre su ficha para consultar información actualizada.'));
    const selected = el('div', 'comparison-selection');
    for (const game of compared.values()) selected.append(button(`Quitar ${game.name} ×`, 'subtle-button', () => { compared.delete(game.id); store('nexus-compare-v1', [...compared.values()]); updateCompared(); comparison(); }));
    content.append(selected);
    if (compared.size !== 2) { content.append(el('p', 'cart-empty', `${compared.size} de 2 juegos seleccionados. Añade ${2 - compared.size} para ver la comparación.`)); return; }
    const games = [...compared.values()];
    const scroll = el('div', 'comparison-scroll');
    const table = el('table', 'comparison-table');
    const caption = el('caption', '', 'Comparación de dos videojuegos');
    const head = el('thead'); const heading = el('tr'); heading.append(el('th', '', 'Características'));
    games.forEach(game => heading.append(el('th', '', game.name))); head.append(heading);
    const body = el('tbody');
    const rows = [['Precio', g => priceText(g)], ['Plataformas', g => g.platforms?.join(', ') || 'No disponible'], ['Lanzamiento', g => g.release || 'No disponible'], ['Géneros', g => g.genres?.join(', ') || 'No disponible'], ['Metacritic', g => g.score ? `${g.score}/100 · ${g.scoreSource}` : 'Sin puntuación'], ['Mi valoración', g => library.get(g.id)?.rating ? `${library.get(g.id).rating}/5 estrellas` : 'Sin valorar']];
    for (const [label, value] of rows) { const row = el('tr'); const th = el('th', '', label); th.scope = 'row'; row.append(th); games.forEach(game => row.append(el('td', '', value(game)))); body.append(row); }
    table.append(caption, head, body); scroll.append(table); content.append(scroll);
  }
  function libraryView() {
    const content = document.querySelector('#library-content');
    const previous = content.querySelector('select')?.value || '';
    content.replaceChildren();
    const filter = el('select'); filter.setAttribute('aria-label', 'Estado de mi biblioteca');
    filter.append(new Option('Todos los estados', ''), ...Object.entries(libraryStates).map(([value, label]) => new Option(label, value)));
    filter.value = previous;
    const list = el('div', 'library-list');
    function draw() {
      const items = [...library.values()].filter(item => !filter.value || item.status === filter.value);
      list.replaceChildren();
      for (const item of items) {
        const row = el('article', 'library-item'); const info = el('div');
        info.append(el('h3', '', item.game.name), el('p', '', `${libraryStates[item.status]}${item.rating ? ` · ${'★'.repeat(item.rating)} ${item.rating}/5` : ''}`));
        if (item.review) info.append(el('p', 'own-review', item.review));
        if (item.demoPurchase) info.append(el('p', 'catalog-note', 'Compra simulada · no es una licencia real'));
        info.append(button('Ver ficha y editar ↗', 'text-action', () => onOpen(item.game)));
        row.append(image(item.game.image, item.game.name), info); list.append(row);
      }
      if (!items.length) list.append(el('p', 'cart-empty', 'Aún no hay juegos en este estado. Abre una ficha y elige cómo quieres organizarlo.'));
    }
    filter.addEventListener('change', draw); content.append(filter, list); draw();
  }
  function syncSection() {
    const showLibrary = location.hash === '#biblioteca';
    document.querySelector('#biblioteca').hidden = !showLibrary;
    document.querySelector('#juegos').hidden = showLibrary;
    document.querySelector('#inicio').hidden = showLibrary;
    for (const link of document.querySelectorAll('.top-nav a, .sidebar nav a')) {
      if (link.getAttribute('href') === (showLibrary ? '#biblioteca' : '#juegos')) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
  document.querySelector('#open-library').addEventListener('click', () => { location.hash = 'biblioteca'; syncSection(); document.querySelector('#library-title').focus({ preventScroll: true }); });
  window.addEventListener('hashchange', syncSection);
  libraryView(); syncSection();
  document.querySelector('#open-compare').addEventListener('click', comparison);
  document.querySelector('#library-count').textContent = library.size; updateCompared();
  return {
    importPurchases(games, orderId) {
      if (importedOrders.has(orderId)) return '';
      let skipped = 0;
      for (const game of games) {
        if (!validGame(game)) continue;
        if (!library.has(game.id) && library.size >= 500) { skipped++; continue; }
        library.set(game.id, mergePurchase(library.get(game.id), game));
      }
      if (saveLibrary() && !skipped) {
        importedOrders.add(orderId); store('nexus-library-orders-v1', [...importedOrders]);
      }
      return skipped ? `La biblioteca está llena: ${skipped} juegos quedaron pendientes. Sus recibos siguen en el historial.` : 'Juegos guardados en Mi biblioteca. Los nuevos aparecen en Quiero jugar; se conserva el progreso de los que ya tenías.';
    },
    compareButton(game) {
      const node = button(compared.has(game.id) ? 'Seleccionado para comparar ✓' : 'Comparar +', 'compare-add', () => {
        if (compared.has(game.id)) compared.delete(game.id);
        else if (compared.size < 2) compared.set(game.id, gameSummary(game));
        else { announce('Ya elegiste dos juegos. Abre Comparar para quitar uno.'); return; }
        store('nexus-compare-v1', [...compared.values()]); updateCompared();
        announce(`${compared.size} de 2 juegos seleccionados para comparar.`);
      }, `Comparar ${game.name}`);
      node.dataset.compareGame = game.id; node.setAttribute('aria-pressed', String(compared.has(game.id))); return node;
    },
    editor(game) {
      const section = el('section', 'detail-section'); section.append(el('h3', '', 'Mi progreso y opinión'));
      const item = library.get(game.id); const form = el('form', 'personal-form');
      function field(label, node) { const wrapper = el('label', '', label); wrapper.append(node); form.append(wrapper); }
      const state = el('select'); state.append(new Option('Sin añadir', ''), ...Object.entries(libraryStates).map(([value, label]) => new Option(label, value))); state.value = item?.status || '';
      const rating = el('select'); rating.append(new Option('Sin valorar', '0'), ...[1,2,3,4,5].map(n => new Option(`${'★'.repeat(n)} · ${n}/5`, String(n)))); rating.value = String(item?.rating || 0);
      const review = el('textarea'); review.maxLength = 1000; review.rows = 4; review.value = item?.review || ''; review.placeholder = '¿Qué te pareció? Tu opinión es privada y no se publica.';
      field('Estado', state); field('Mi calificación', rating); field('Mi opinión (máximo 1000 caracteres)', review);
      const status = el('p', 'catalog-note'); status.setAttribute('role', 'status');
      const submit = el('button', 'button', 'Guardar en mi biblioteca'); submit.type = 'submit';
      form.addEventListener('submit', event => {
        event.preventDefault();
        if (library.size >= 500 && !library.has(game.id)) { status.textContent = 'Tu biblioteca admite hasta 500 juegos.'; return; }
        state.value ||= 'wishlist';
        library.set(game.id, { ...library.get(game.id), game: gameSummary(game), status: state.value, rating: Number(rating.value), review: review.value.trim().slice(0, 1000) });
        saveLibrary(); status.textContent = 'Guardado en tu biblioteca. Tu opinión no se publica.';
      });
      form.append(submit, button('Quitar de mi biblioteca', 'reset-button', () => { library.delete(game.id); saveLibrary(); state.value = ''; rating.value = '0'; review.value = ''; status.textContent = 'Juego y opinión retirados de tu biblioteca.'; }), status);
      section.append(form); return section;
    }
  };
}
