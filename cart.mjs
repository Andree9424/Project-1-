export function cartTotals(games) {
  const cents = new Map();
  for (const game of games) {
    const { amount, currency } = game.price || {};
    if (!Number.isFinite(amount) || amount < 0 || !/^[A-Z]{3}$/.test(currency)) throw new Error('Precio no válido');
    cents.set(currency, (cents.get(currency) || 0) + Math.round(amount * 100));
  }
  return [...cents].map(([currency, amount]) => ({ currency, amount: amount / 100 }));
}

export function makeReceipt(games, id, date = new Date().toISOString()) {
  return { id, date, games: games.map(({ id, name, price }) => ({ id, name, price: { ...price } })), totals: cartTotals(games) };
}

export function createCart({ el, button, image, priceText, onPurchase = () => '' }) {
  const dialog = document.querySelector('#cart-dialog');
  const content = document.querySelector('#cart-content');
  const count = document.querySelector('#cart-count');
  const key = 'nexus-demo-cart-v1';
  let cart = new Map();
  let history = [];
  const eligible = game => game && /^(steam-\d+|rawg-\d+|epic-[a-f0-9]{32})$/.test(game.id) && typeof game.name === 'string' && Number.isFinite(game.price?.amount) && game.price.amount >= 0 && /^[A-Z]{3}$/.test(game.price.currency);
  try {
    const data = JSON.parse(localStorage.getItem(key) || '[]');
    if (Array.isArray(data)) cart = new Map(data.filter(eligible).slice(0, 50).map(g => [g.id, g]));
  } catch { /* Funciona durante esta sesión si el almacenamiento no está disponible. */ }
  try {
    const data = JSON.parse(localStorage.getItem('nexus-demo-orders-v1') || '[]');
    if (Array.isArray(data)) history = data.filter(order => typeof order?.id === 'string' && Number.isFinite(Date.parse(order.date)) && Array.isArray(order.games) && order.games.length > 0 && order.games.every(eligible)).slice(0, 50);
  } catch { /* El historial también funciona durante la sesión. */ }
  // Recupera compras anteriores una sola vez, sin volver a añadir juegos retirados manualmente.
  for (const order of [...history].reverse()) onPurchase(order.games, order.id);
  function persist() {
    count.textContent = cart.size;
    for (const node of document.querySelectorAll('[data-cart-game]')) node.textContent = cart.has(node.dataset.cartGame) ? 'En tu carrito ✓' : 'Añadir al carrito +';
    try { localStorage.setItem(key, JSON.stringify([...cart.values()])); }
    catch { document.querySelector('#shop-status').textContent = 'Tu carrito se conservará solo durante esta sesión.'; }
  }
  function totals(games) {
    const list = el('div', 'cart-totals');
    for (const price of cartTotals(games)) list.append(el('strong', '', priceText({ price })));
    return list;
  }
  function render() {
    content.replaceChildren();
    if (!cart.size) {
      content.append(el('p', 'cart-empty', 'Tu próxima aventura todavía no está en el carrito.'), button('Seguir explorando ↗', 'button', () => dialog.close()));
      return;
    }
    const games = [...cart.values()];
    const list = el('ul', 'cart-items');
    for (const game of games) {
      const row = el('li', 'cart-item');
      const info = el('div');
      info.append(el('h3', '', game.name), el('p', '', priceText(game)));
      row.append(image(game.image, game.name), info, button('Quitar', 'reset-button', () => { cart.delete(game.id); persist(); render(); }, `Quitar ${game.name} del carrito`));
      list.append(row);
    }
    content.append(list, totals(games), el('p', 'catalog-note', 'Precios de referencia al añadir los juegos. Una unidad por título. Las monedas se suman por separado.'));
    const confirm = el('label', 'demo-confirm');
    const checkbox = el('input'); checkbox.type = 'checkbox';
    confirm.append(checkbox, el('span', '', 'Entiendo que esta compra es ficticia: no recibiré juegos ni se cobrará dinero.'));
    const pay = button('Simular compra →', 'button checkout-button', () => {
      if (!checkbox.checked || !cart.size) return;
      // La operación es local: no se envían pagos ni datos a una tienda.
      const order = makeReceipt(games, `DEMO-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`);
      history.unshift(order); history = history.slice(0, 50);
      try { localStorage.setItem('nexus-demo-orders-v1', JSON.stringify(history)); }
      catch { document.querySelector('#shop-status').textContent = 'El recibo se conservará solo durante esta sesión.'; }
      const libraryMessage = onPurchase(games, order.id);
      cart.clear(); persist();
      content.replaceChildren(el('div', 'purchase-check', '✓'), el('h3', '', '¡Compra simulada completada!'), el('p', '', `Recibo ${order.id} · ${new Date(order.date).toLocaleString('es-MX')}`));
      const receipt = el('ul', 'receipt-items');
      games.forEach(game => receipt.append(el('li', '', `${game.name} · ${priceText(game)}`)));
      content.append(receipt, totals(games), el('p', 'demo-notice', 'Se cobró $0. No se ha comprado, descargado ni activado ningún juego.'), button('Volver al catálogo ↗', 'button', () => dialog.close()));
      if (libraryMessage) content.append(el('p', 'catalog-note', libraryMessage));
      content.querySelector('h3').tabIndex = -1; content.querySelector('h3').focus();
    });
    pay.disabled = true;
    checkbox.addEventListener('change', () => { pay.disabled = !checkbox.checked; });
    content.append(confirm, pay);
  }
  document.querySelector('#open-cart').addEventListener('click', () => { document.querySelector('#cart-title').firstChild.textContent = 'Tu carrito'; render(); dialog.showModal(); document.body.classList.add('cart-open'); });
  document.querySelector('#open-history').addEventListener('click', () => {
    document.querySelector('#cart-title').firstChild.textContent = 'Compras simuladas';
    content.replaceChildren(el('p', 'catalog-note', 'Hasta 50 recibos guardados en este navegador. Todos son ficticios: no corresponden a compras, descargas ni licencias reales.'));
    if (!history.length) content.append(el('p', 'cart-empty', 'Todavía no has completado una compra simulada.'));
    for (const order of history) {
      const section = el('details', 'history-order'); const summary = el('summary', '', `${order.id} · ${new Date(order.date).toLocaleString('es-MX')}`);
      const list = el('ul', 'receipt-items'); order.games.forEach(game => list.append(el('li', '', `${game.name} · ${priceText(game)}`)));
      section.append(summary, list, totals(order.games), el('p', 'catalog-note', 'Importe cobrado realmente: $0.')); content.append(section);
    }
    dialog.showModal(); document.body.classList.add('cart-open'); dialog.scrollTop = 0;
  });
  document.querySelector('#close-cart').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.body.classList.remove('cart-open'));
  persist();
  return {
    addButton(game) {
      if (!eligible(game)) return null;
      const add = button(cart.has(game.id) ? 'En tu carrito ✓' : 'Añadir al carrito +', 'cart-add', () => {
        if (cart.size >= 50 && !cart.has(game.id)) { document.querySelector('#shop-status').textContent = 'El carrito admite hasta 50 juegos.'; return; }
        const { id, name, image, price } = game;
        cart.set(id, { id, name, image, price }); persist();
        document.querySelector('#shop-status').textContent = `${game.name} añadido al carrito de demostración.`;
      }, `Añadir ${game.name} al carrito simulado`);
      add.dataset.cartGame = game.id;
      return add;
    }
  };
}
