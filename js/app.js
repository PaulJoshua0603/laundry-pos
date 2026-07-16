/* ══════════════════════════════════════════════════════════
   SudsUp POS · app.js
   Point-of-sale logic. Runs once a user is logged in
   (see auth.js → enterApp() → initAppForUser()).
══════════════════════════════════════════════════════════ */

/* ─── DATA ─── */
const SERVICES = [
  { id:'w1', cat:'wash', icon:'\ud83e\udee7', name:'Regular Wash (1)',  desc:' 38 mins wash 1 wash 2 rinse (3\u20135 kg) ', price:160 },
  { id:'w2', cat:'wash', icon:'\ud83e\udee7', name:'Regular Wash (2)',  desc:'38 mins wash 1 wash 2 rinse (6\u20137 kg)', price:180 },
  { id:'w3', cat:'wash', icon:'\ud83d\udecf\ufe0f', name:'Premium Wash (1)',    desc:'48 mins wash 1 wash 3 rinse (6\u20137 kg)', price:200 },
  { id:'w4', cat:'wash', icon:'\ud83c\udf28\ufe0f', name:'Premium Wash (2)',desc:'Per load', price:230 },
  { id:'d1', cat:'dry',  icon:'\u2600\ufe0f', name:'Regular Dry',   desc:'Max 7 kgs / load', price:60 },
  { id:'d2', cat:'dry',  icon:'\ud83c\udf24\ufe0f', name:'Dry Heavy',     desc:'Max 8 kgs / load', price:70 },
  { id:'d3', cat:'addon',  icon:'\u23f1\ufe0f', name:'Add Dry',       desc:'+10 minutes dry only', price:30 },
  { id:'a1', cat:'addon', icon:'\ud83c\udf38', name:'Downy Fabric Conditioner', desc:'Added to final rinse', price:10 },
  { id:'a2', cat:'addon', icon:'\u2728', name:'Surf Fabric Softener',    desc:'Added to final rinse', price:10 },
  { id:'a3', cat:'addon', icon:'\u2728', name:'Del Fabric Softener',    desc:'Added to final rinse', price:10 },
  { id:'a4', cat:'addon', icon:'\ud83e\uddfc', name:'Ariel Liquid Detergent',    desc:'Extra detergent scoop', price:15 },
  { id:'a5', cat:'addon', icon:'\ud83c\udf0a', name:'Wings Liquid Detergent',  desc:'Extra detergent scoop', price:15 },
];

const ORDERS_PREFIX = 'sudsup_orders_';
const PAYSETTINGS_PREFIX = 'sudsup_paysettings_';
const PRINTWIDTH_KEY = 'sudsup_printer_mm';

/* Order status workflow — shown as an editable dropdown per order. */
const STATUS_OPTIONS = [
  { id:'washing',   label:'Washing',            icon:'\ud83e\udee7', cls:'status-washing'   },
  { id:'drying',    label:'Drying',             icon:'\u2600\ufe0f', cls:'status-drying'    },
  { id:'ready',     label:'Ready for Pickup',   icon:'\u2705',       cls:'status-ready'     },
  { id:'storage',   label:'On Storage',         icon:'\ud83d\udce6', cls:'status-storage'   },
  { id:'awaiting',  label:'Awaiting Pickup',    icon:'\u23f3',       cls:'status-awaiting'  },
  { id:'completed', label:'Picked Up',          icon:'\ud83c\udfc1', cls:'status-completed' },
  { id:'cancelled', label:'Cancelled',          icon:'\u2715',       cls:'status-cancelled' },
];
const STATUS_MAP = Object.fromEntries(STATUS_OPTIONS.map(s => [s.id, s]));

const ORDER_TYPES = {
  walkin:   { label:'Walk-in',  icon:'\ud83d\udeb6' },
  delivery: { label:'Delivery', icon:'\ud83d\udef5\ufe0f' },
};

let cart       = [];   // [{service, qty}]
let orders     = [];   // completed orders for the current user
let payment    = 'cash';
let activeView = 'pos';
let currentUser = null;
let clockStarted = false;
let paySettings = { gcash:{qr:null,number:''}, maya:{qr:null,number:''} };

/* sales tracking state */
let salesPeriod = 'week';   // 'week' | 'month' | 'year'
let salesOffset = 0;        // 0 = current period, -1 = previous, etc.

/* ─── PER-USER ORDER PERSISTENCE ─── */
function ordersKey(){
  return ORDERS_PREFIX + (currentUser ? currentUser.userId : 'anon');
}
function loadOrdersFromStorage(){
  try {
    const raw = JSON.parse(localStorage.getItem(ordersKey())) || [];
    // revive Date objects (stored as ISO strings) and backfill fields
    // that may be missing from orders saved by an earlier version.
    return raw.map(o => ({
      ...o,
      time: new Date(o.time),
      pickup: o.pickup ? new Date(o.pickup) : null,
      type: o.type || 'walkin',
      status: (o.status === 'done') ? 'completed' : (STATUS_MAP[o.status] ? o.status : (o.status === 'pending' ? 'washing' : o.status)),
      paid: (o.paid === undefined) ? (o.payment !== 'later') : o.paid,
      paidMethod: o.paidMethod !== undefined ? o.paidMethod : (o.paid === false ? null : o.payment),
      paidAt: o.paidAt ? new Date(o.paidAt) : (o.paid === false ? null : new Date(o.time)),
    }));
  } catch { return []; }
}
function saveOrdersToStorage(){
  localStorage.setItem(ordersKey(), JSON.stringify(orders));
}



/* ─── INIT (called from auth.js after login) ─── */
function initAppForUser(session){
  currentUser = session;
  cart = [];
  payment = 'cash';
  orders = loadOrdersFromStorage();
  paySettings = loadPaySettings();
  salesPeriod = 'week';
  salesOffset = 0;

  document.getElementById('shopName') && (document.getElementById('shopName').textContent = session.business);

  document.querySelectorAll('.pill[data-cat]').forEach(p => p.classList.remove('active'));
  document.querySelector('.pill[data-cat="all"]')?.classList.add('active');
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.pay-btn[data-pay="cash"]')?.classList.add('active');
  document.querySelectorAll('.pill[data-period]').forEach(p => p.classList.remove('active'));
  document.querySelector('.pill[data-period="week"]')?.classList.add('active');

  renderProducts();
  updateCart();
  updateSidebarStats();
  renderPaySettingsForm();
  applySavedPrinterWidth();
  switchView('pos');

  if (!clockStarted){
    updateClock();
    setInterval(updateClock, 1000);
    clockStarted = true;
  }
}

/* ─── CLOCK & BUSINESS HOURS ─── */
const BUSINESS_HOURS = { openHour: 6, closeHour: 20, label: 'Mon\u2013Sun \u00b7 6:00 AM\u2013 8:00 PM' };

function isShopOpen(d = new Date()){
  const h = d.getHours() + d.getMinutes()/60;
  return h >= BUSINESS_HOURS.openHour && h < BUSINESS_HOURS.closeHour;
}

function updateClock(){
  const now = new Date();
  const d = now.toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'});
  const t = now.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'});
  const el = document.getElementById('topbarDate');
  if (el) el.textContent = `${d} \u00b7 ${t}`;

  const badge = document.getElementById('topbarBadge');
  if(badge){
    const open = isShopOpen(now);
    badge.textContent = open ? 'OPEN' : 'CLOSED';
    badge.classList.toggle('is-closed', !open);
    badge.title = BUSINESS_HOURS.label;
  }
}

/* ─── THEME ─── */
function initThemeToggle(){
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  updateThemeIcon();
  btn.addEventListener('click', toggleTheme);
}
function toggleTheme(){
  const root = document.documentElement;
  const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
  root.setAttribute('data-theme', next);
  localStorage.setItem('sudsup_theme', next);
  updateThemeIcon();
  if (typeof renderGoogleButton === 'function' && typeof googleConfigured === 'function' && googleConfigured()){
    renderGoogleButton();
  }
}
function updateThemeIcon(){
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  btn.textContent = isLight ? '\ud83c\udf19' : '\u2600\ufe0f';
  btn.title = isLight ? 'Switch to dark mode' : 'Switch to light mode';
}

/* ─── PRODUCTS ─── */
function renderProducts(cat){
  cat = cat || activeCat();
  const grid = document.getElementById('productGrid');
  if (!grid) return;
  const filtered = cat === 'all' ? SERVICES : SERVICES.filter(s => s.cat === cat);
  grid.innerHTML = filtered.map(s => {
    const inCart = cart.find(c => c.service.id === s.id);
    const qty = inCart ? inCart.qty : 0;
    return `
    <div class="product-card${qty ? ' in-cart' : ''}" onclick="addToCart('${s.id}')" id="pc-${s.id}">
      ${qty ? `<div class="product-qty-badge">${qty}</div>` : ''}
      <div class="product-icon">${s.icon}</div>
      <div class="product-name">${s.name}</div>
      <div class="product-desc">${s.desc}</div>
      <div class="product-price">\u20b1${s.price}</div>
    </div>`;
  }).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle();
  document.getElementById('categoryPills')?.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if(!pill) return;
    document.querySelectorAll('#categoryPills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    renderProducts(pill.dataset.cat);
  });
  document.getElementById('receiptModal')?.addEventListener('click', e => {
    if(e.target === document.getElementById('receiptModal')) closeReceipt();
  });
  document.getElementById('salesPeriodPills')?.addEventListener('click', e => {
    const pill = e.target.closest('.pill');
    if(!pill) return;
    document.querySelectorAll('#salesPeriodPills .pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    salesPeriod = pill.dataset.period;
    salesOffset = 0;
    renderSales();
  });
});

/* ─── CART LOGIC ─── */
function addToCart(id){
  const service = SERVICES.find(s => s.id === id);
  if(!service) return;
  const existing = cart.find(c => c.service.id === id);
  if(existing) existing.qty++;
  else cart.push({ service, qty: 1 });
  updateCart();
  renderProducts(activeCat());
  toast(`${service.icon} ${service.name} added`, 'success');
}

function changeQty(id, delta){
  const idx = cart.findIndex(c => c.service.id === id);
  if(idx === -1) return;
  cart[idx].qty += delta;
  if(cart[idx].qty <= 0) cart.splice(idx, 1);
  updateCart();
  renderProducts(activeCat());
}

function removeFromCart(id){
  cart = cart.filter(c => c.service.id !== id);
  updateCart();
  renderProducts(activeCat());
}

function clearCart(silent){
  if(cart.length === 0) return;
  cart = [];
  document.getElementById('custName').value = '';
  document.getElementById('custPhone').value = '';
  document.getElementById('custAddr').value = '';
  if(document.getElementById('custType')) document.getElementById('custType').value = 'walkin';
  if(document.getElementById('custPickup')) document.getElementById('custPickup').value = '';
  payment = 'cash';
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.toggle('active', b.dataset.pay === 'cash'));
  updateQrPreview();
  updateCart();
  renderProducts(activeCat());
  if(!silent) toast('Order cleared');
}

function activeCat(){
  return document.querySelector('#categoryPills .pill.active')?.dataset.cat || 'all';
}

function cartTotal(){
  return cart.reduce((sum, c) => sum + c.service.price * c.qty, 0);
}

function updateCart(){
  const items = document.getElementById('cartItems');
  const total = cartTotal();
  const count = cart.reduce((n, c) => n + c.qty, 0);

  document.getElementById('cartCountBadge').textContent = count;
  const mobileNum = document.getElementById('mobileCartNum');
  if(count > 0){ mobileNum.style.display='flex'; mobileNum.textContent = count; }
  else mobileNum.style.display='none';

  if(cart.length === 0){
    items.innerHTML = `
    <div class="cart-empty" id="cartEmpty">
      <div class="cart-empty-icon">\ud83e\uddfa</div>
      <div class="cart-empty-text">No items yet. Tap a service.</div>
    </div>`;
  } else {
    items.innerHTML = cart.map(c => `
    <div class="cart-item">
      <div style="font-size:20px;margin-top:1px">${c.service.icon}</div>
      <div class="cart-item-info">
        <div class="cart-item-name">${c.service.name}</div>
        <div class="cart-item-price">${c.service.desc} \u00b7 \u20b1${c.service.price} each</div>
        <div class="cart-item-controls">
          <button class="qty-btn" onclick="changeQty('${c.service.id}',-1)">\u2212</button>
          <span class="qty-display">${c.qty}</span>
          <button class="qty-btn" onclick="changeQty('${c.service.id}',1)">+</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <button class="cart-item-del" onclick="removeFromCart('${c.service.id}')">\u2715</button>
        <span class="cart-item-total">\u20b1${c.service.price * c.qty}</span>
      </div>
    </div>`).join('');
  }

  document.getElementById('cartSubtotal').textContent = `\u20b1${total.toLocaleString()}`;
  document.getElementById('cartDiscount').textContent = '\u2014';
  document.getElementById('cartTotal').textContent = `\u20b1${total.toLocaleString()}`;

  const btn = document.getElementById('checkoutBtn');
  btn.disabled = cart.length === 0;
  btn.textContent = cart.length === 0 ? 'Charge \u20b10' : `Charge \u20b1${total.toLocaleString()}`;
}

/* ─── PAYMENT ─── */
function selectPayment(el){
  document.querySelectorAll('.pay-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  payment = el.dataset.pay;
  updateQrPreview();
}

function updateQrPreview(){
  const box = document.getElementById('qrPreviewBox');
  const laterNote = document.getElementById('laterNote');
  if(!box) return;
  if(payment === 'later'){
    box.style.display = 'none'; box.innerHTML = '';
    if(laterNote) laterNote.style.display = 'block';
    return;
  }
  if(laterNote) laterNote.style.display = 'none';
  if(payment !== 'gcash' && payment !== 'maya'){
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  const label = payment === 'gcash' ? 'GCash' : 'Maya';
  const icon  = payment === 'gcash' ? '\ud83d\udcf1' : '\ud83d\udc9c';
  const info  = paySettings[payment] || {};
  box.style.display = 'flex';
  if(info.qr || info.number){
    box.innerHTML = `
      ${info.qr ? `<img class="qr-preview-img" src="${info.qr}" alt="${label} QR"/>` : `<div class="qr-preview-img" style="display:flex;align-items:center;justify-content:center;font-size:22px">${icon}</div>`}
      <div class="qr-preview-info">
        <div class="qr-preview-title">${icon} Show this ${label} code to the customer</div>
        <div class="qr-preview-sub">${info.number ? info.number : 'No account number set yet'}</div>
      </div>`;
  } else {
    box.innerHTML = `
      <div class="qr-preview-empty">
        No ${label} QR set up yet. Add one in <a onclick="switchView('payments')">Payment Methods</a> so it shows here at checkout.
      </div>`;
  }
}

/* ─── CHECKOUT ─── */
function checkout(){
  if(cart.length === 0) return;
  const name   = document.getElementById('custName').value.trim() || 'Walk-in Customer';
  const phone  = document.getElementById('custPhone').value.trim();
  const addr   = document.getElementById('custAddr').value.trim();
  const type   = document.getElementById('custType')?.value || 'walkin';
  const pickupRaw = document.getElementById('custPickup')?.value || '';
  const pickup = pickupRaw ? new Date(pickupRaw) : null;
  const total  = cartTotal();
  const id     = 'ORD-' + String(orders.length + 1).padStart(4,'0');
  const time   = new Date();

  const isPaid = payment !== 'later';
  const order = {
    id, name, phone, addr, type, pickup,
    items: cart.map(c => ({...c})),
    total, payment, time,
    status: 'washing',
    paid: isPaid,
    paidMethod: isPaid ? payment : null,
    paidAt: isPaid ? time : null,
  };
  orders.unshift(order);
  saveOrdersToStorage();
  showReceipt(order);
  toast(`\u2705 ${id} placed for ${name} \u00b7 \u20b1${total.toLocaleString()}${!isPaid ? ' (unpaid)' : ''}`, 'success');

  updateSidebarStats();
  document.getElementById('orderCountBadge').textContent = orders.length;
  clearCart(true);
  renderOrderTable();
}

function isToday(d){
  const n = new Date();
  return d.getFullYear()===n.getFullYear() && d.getMonth()===n.getMonth() && d.getDate()===n.getDate();
}
function todaysOrders(){
  return orders.filter(o => o.status!=='cancelled' && isToday(o.time));
}

function updateSidebarStats(){
  const today = todaysOrders();
  const rev = today.reduce((s,o)=>s + (o.paid ? o.total : 0), 0);
  const unpaidToday = today.filter(o=>!o.paid);
  const unpaidTotal = orders.filter(o=>o.status!=='cancelled' && !o.paid).reduce((s,o)=>s+o.total,0);
  document.getElementById('sidebarRevenue').textContent = `\u20b1${rev.toLocaleString()}`;
  document.getElementById('sidebarOrderCount').textContent = `${today.length} order${today.length!==1?'s':''} today`;
  document.getElementById('orderCountBadge').textContent = orders.length;
  const unpaidEl = document.getElementById('sidebarUnpaid');
  if(unpaidEl){
    if(unpaidTotal > 0){
      unpaidEl.style.display = 'block';
      unpaidEl.textContent = `\u20b1${unpaidTotal.toLocaleString()} unpaid`;
    } else unpaidEl.style.display = 'none';
  }
}

/* ─── RECEIPT ─── */
function showReceipt(order){
  const payLabel = {cash:'Cash',gcash:'GCash',maya:'Maya',later:'Pay Later'}[order.payment] || order.payment;
  const paidLabel = {cash:'Cash',gcash:'GCash',maya:'Maya'}[order.paidMethod];
  const typeInfo = ORDER_TYPES[order.type] || ORDER_TYPES.walkin;
  const statusInfo = STATUS_MAP[order.status];
  const lines = order.items.map(c =>
    `<div class="receipt-row"><span>${c.service.icon} ${c.service.name} \u00d7 ${c.qty}</span><span>\u20b1${(c.service.price*c.qty).toLocaleString()}</span></div>`
  ).join('');
  const payRefLine = (order.payment !== 'cash' && order.payment !== 'later' && paySettings[order.payment]?.number)
    ? `<div class="receipt-row" style="margin-top:2px"><span>${payLabel} to</span><span>${paySettings[order.payment].number}</span></div>`
    : '';
  const pickupLine = order.pickup
    ? `<div class="receipt-row customer"><span>Pickup</span><span>${order.pickup.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>`
    : '';
  const paymentLine = order.paid
    ? `<div class="receipt-row" style="margin-top:4px"><span>Payment</span><span>${paidLabel || payLabel}</span></div>`
    : `<div class="receipt-row" style="margin-top:4px"><span>Payment</span><span>UNPAID \u2014 pay on pickup</span></div>`;
  document.getElementById('receiptBody').innerHTML = `
    <div class="receipt-header">
      <div class="receipt-logo">\ud83e\udee7</div>
      <div class="receipt-biz">${(currentUser && currentUser.business) || 'SudsUp Laundry'}</div>
      <div class="receipt-sub">Official Receipt</div>
    </div>
    <hr class="receipt-divider"/>
    <div class="receipt-row customer"><span>Customer</span><span>${order.name}</span></div>
    ${order.phone ? `<div class="receipt-row customer"><span>Phone</span><span>${order.phone}</span></div>` : ''}
    <div class="receipt-row customer"><span>Order ID</span><span>${order.id}</span></div>
    <div class="receipt-row customer"><span>Order Type</span><span>${typeInfo.icon} ${typeInfo.label}</span></div>
    <div class="receipt-row customer"><span>Status</span><span>${statusInfo ? statusInfo.icon+' '+statusInfo.label : order.status}</span></div>
    ${pickupLine}
    <div class="receipt-row customer"><span>Time</span><span>${order.time.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</span></div>
    <hr class="receipt-divider"/>
    ${lines}
    <hr class="receipt-divider"/>
    <div class="receipt-row total"><span>TOTAL</span><span>\u20b1${order.total.toLocaleString()}</span></div>
    ${paymentLine}
    ${payRefLine}
    ${!order.paid ? `<div class="receipt-row" style="margin-top:2px;font-weight:700"><span>Balance due</span><span>\u20b1${order.total.toLocaleString()}</span></div>` : ''}
    <div class="receipt-footer">
      Thank you for choosing ${(currentUser && currentUser.business) || 'SudsUp'}! \ud83e\udee7<br/>
      <span style="font-size:10px">Keep this receipt for reference.</span>
    </div>`;

  document.getElementById('basketTag').innerHTML = `
    <div class="tag-label">BASKET TAG</div>
    <div class="tag-name">${order.name}</div>
    ${order.phone ? `<div class="tag-phone">${order.phone}</div>` : ''}
    <div class="tag-divider"></div>
    <div class="tag-row"><span>${order.id}</span><span>${typeInfo.icon} ${typeInfo.label}</span></div>
    <div class="tag-row"><span>${order.items.reduce((n,c)=>n+c.qty,0)} item${order.items.reduce((n,c)=>n+c.qty,0)!==1?'s':''}</span><span>${order.time.toLocaleDateString('en-PH',{month:'short',day:'numeric'})}</span></div>
    ${order.pickup ? `<div class="tag-row"><span>Pickup</span><span>${order.pickup.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</span></div>` : ''}`;

  document.getElementById('receiptModal').classList.add('show');
}

/* ─── PRINTER PAPER WIDTH (58mm / 80mm) ─── */
function setPrinterWidth(mm, el){
  document.querySelectorAll('.printer-size-row .pill').forEach(p => p.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('receiptModal').style.setProperty('--receipt-w', mm + 'mm');
  localStorage.setItem(PRINTWIDTH_KEY, mm);
}
function applySavedPrinterWidth(){
  const saved = parseInt(localStorage.getItem(PRINTWIDTH_KEY), 10) || 80;
  const pill = document.querySelector(`.printer-size-row .pill[data-mm="${saved}"]`);
  if(pill) setPrinterWidth(saved, pill);
}

function closeReceipt(){
  document.getElementById('receiptModal').classList.remove('show');
}
function printReceipt(){
  window.print();
}

/* ─── ORDERS TABLE ─── */
function renderOrderTable(){
  const q = (document.getElementById('orderSearch')?.value||'').toLowerCase();
  const filtered = orders.filter(o =>
    o.id.toLowerCase().includes(q) ||
    o.name.toLowerCase().includes(q)
  );
  const tbody = document.getElementById('orderTableBody');
  if(!tbody) return;
  tbody.innerHTML = filtered.length === 0
    ? `<tr><td colspan="10" style="text-align:center;color:var(--text3);padding:28px">No orders yet.</td></tr>`
    : filtered.map(o => {
      const typeInfo = ORDER_TYPES[o.type] || ORDER_TYPES.walkin;
      const statusOptsHtml = STATUS_OPTIONS.map(s =>
        `<option value="${s.id}" ${s.id===o.status?'selected':''}>${s.icon} ${s.label}</option>`
      ).join('');
      const currentStatus = STATUS_MAP[o.status] || STATUS_MAP.washing;
      const pickupText = o.pickup
        ? o.pickup.toLocaleString('en-PH',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})
        : '\u2014';
      const paidMethodLabel = {cash:'Cash',gcash:'GCash',maya:'Maya'}[o.paidMethod] || '';
      const paymentCell = o.paid
        ? `<span class="pay-badge pay-badge-paid" title="Paid via ${paidMethodLabel}">\u2713 Paid${paidMethodLabel?' \u00b7 '+paidMethodLabel:''}</span>`
        : `<div class="pay-unpaid-cell">
             <span class="pay-badge pay-badge-unpaid">\u23f3 Unpaid</span>
             <select class="pay-mark-select" onchange="if(this.value){markOrderPaid('${o.id}', this.value); this.value='';}">
               <option value="">Mark paid via\u2026</option>
               <option value="cash">\ud83d\udcb5 Cash</option>
               <option value="gcash">\ud83d\udcf1 GCash</option>
               <option value="maya">\ud83d\udc9c Maya</option>
             </select>
           </div>`;
      return `
    <tr>
      <td class="mono">${o.id}</td>
      <td>${o.name}</td>
      <td><span class="type-badge">${typeInfo.icon} ${typeInfo.label}</span></td>
      <td style="color:var(--text2)">${o.items.length} item${o.items.length!==1?'s':''}</td>
      <td class="mono" style="color:var(--yellow)">\u20b1${o.total.toLocaleString()}</td>
      <td>
        <select class="status-select ${currentStatus.cls}" onchange="updateOrderStatus('${o.id}', this.value)">
          ${statusOptsHtml}
        </select>
      </td>
      <td>${paymentCell}</td>
      <td class="mono" style="font-size:11px">${pickupText}</td>
      <td class="mono" style="font-size:11px">${o.time.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</td>
      <td style="display:flex;gap:6px;justify-content:flex-end">
        <button class="btn btn-ghost btn-sm" onclick="showReceipt(orders.find(x=>x.id==='${o.id}'))" title="View receipt">\ud83e\uddfe</button>
        ${(o.status!=='completed' && o.status!=='cancelled')?`<button class="btn btn-success btn-sm" onclick="updateOrderStatus('${o.id}','completed')" title="Mark as completed">\u2713 Done</button>`:''}
        ${o.status!=='cancelled'?`<button class="btn btn-danger btn-sm" onclick="cancelOrder('${o.id}')" title="Cancel order">\u2715</button>`:''}
        <button class="btn btn-danger btn-sm" onclick="deleteOrder('${o.id}')" title="Delete order permanently">\ud83d\uddd1\ufe0f</button>
      </td>
    </tr>`;
    }).join('');
}

function markOrderPaid(id, method){
  const o = orders.find(x=>x.id===id);
  if(!o || o.paid) return;
  o.paid = true;
  o.paidMethod = method;
  o.paidAt = new Date();
  saveOrdersToStorage();
  renderOrderTable();
  updateSidebarStats();
  if(activeView === 'summary') renderSummary();
  if(activeView === 'sales') renderSales();
  toast(`${o.id} marked as paid \u00b7 ${({cash:'Cash',gcash:'GCash',maya:'Maya'})[method]}`);
}

function updateOrderStatus(id, newStatus){
  const o = orders.find(x=>x.id===id);
  if(!o || !STATUS_MAP[newStatus]) return;
  o.status = newStatus;
  saveOrdersToStorage();
  renderOrderTable();
  updateSidebarStats();
  if(activeView === 'summary') renderSummary();
  if(activeView === 'sales') renderSales();
  toast(`${o.id} marked as ${STATUS_MAP[newStatus].label}`);
}

function cancelOrder(id){
  const o = orders.find(x=>x.id===id);
  if(o){ o.status='cancelled'; saveOrdersToStorage(); renderOrderTable(); updateSidebarStats(); toast('Order cancelled', 'error'); renderSummary(); }
}

function deleteOrder(id){
  const o = orders.find(x=>x.id===id);
  if(!o) return;
  if(!confirm(`Permanently delete order ${o.id}? This cannot be undone.`)) return;
  orders = orders.filter(x => x.id !== id);
  saveOrdersToStorage();
  renderOrderTable();
  updateSidebarStats();
  if(activeView === 'summary') renderSummary();
  if(activeView === 'sales') renderSales();
  toast('Order deleted', 'error');
}

/* ─── SUMMARY ─── */
function renderSummary(){
  const done = todaysOrders();
  const paidOrders = done.filter(o => o.paid);
  const unpaidOrders = done.filter(o => !o.paid);
  const rev  = paidOrders.reduce((s,o)=>s+o.total,0);
  const avg  = paidOrders.length ? Math.round(rev/paidOrders.length) : 0;
  const unpaidTotal = unpaidOrders.reduce((s,o)=>s+o.total,0);

  document.getElementById('sumRevenue').textContent = `\u20b1${rev.toLocaleString()}`;
  document.getElementById('sumOrders').textContent  = done.length;
  document.getElementById('sumAvg').textContent     = `\u20b1${avg.toLocaleString()}`;
  document.getElementById('sumUnpaid').textContent  = `\u20b1${unpaidTotal.toLocaleString()}`;
  document.getElementById('sumUnpaidSub').textContent = `${unpaidOrders.length} order${unpaidOrders.length!==1?'s':''}`;

  const svcMap = {};
  done.forEach(o => o.items.forEach(c => {
    const k = c.service.id;
    if(!svcMap[k]) svcMap[k] = {service:c.service, qty:0, rev:0};
    svcMap[k].qty += c.qty;
    svcMap[k].rev += c.service.price * c.qty;
  }));
  const sorted = Object.values(svcMap).sort((a,b)=>b.rev-a.rev);
  const maxRev = sorted[0]?.rev || 1;
  document.getElementById('topServicesBody').innerHTML = sorted.length === 0
    ? `<div style="padding:20px 16px;color:var(--text3);font-size:13px;text-align:center">No data yet.</div>`
    : sorted.map(s => `
    <div style="padding:10px 16px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${s.service.icon} ${s.service.name} <span style="font-size:11px;color:var(--text3);font-weight:400">(${s.service.desc})</span></span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--yellow);font-weight:700">\u20b1${s.rev.toLocaleString()}</span>
      </div>
      <div style="height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${Math.round(s.rev/maxRev*100)}%;background:var(--blue);border-radius:2px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--text3)">${s.qty} load${s.qty!==1?'s':''} \u00b7 \u20b1${s.service.price} each</div>
    </div>`).join('');

  const payMap = {cash:0, gcash:0, maya:0};
  paidOrders.forEach(o => { const m = o.paidMethod || o.payment; if(payMap[m]!==undefined) payMap[m] += o.total; });
  const payTotal = Object.values(payMap).reduce((a,b)=>a+b,0) || 1;
  const payIcons = {cash:'\ud83d\udcb5',gcash:'\ud83d\udcf1',maya:'\ud83d\udc9c'};
  document.getElementById('payBreakdown').innerHTML = Object.entries(payMap).map(([k,v])=>`
    <div style="display:flex;flex-direction:column;gap:6px">
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:13px;color:var(--text2)">${payIcons[k]} ${k.charAt(0).toUpperCase()+k.slice(1)}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--text);font-weight:600">\u20b1${v.toLocaleString()}</span>
      </div>
      <div style="height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${Math.round(v/payTotal*100)}%;background:${k==='cash'?'var(--green)':k==='gcash'?'var(--blue)':'#A855F7'};border-radius:2px"></div>
      </div>
    </div>`).join('');
}

function clearDayData(){
  if(!confirm('Clear all order data for today? This cannot be undone. (Past days stay in Sales Tracking.)')) return;
  orders = orders.filter(o => !isToday(o.time));
  cart = [];
  saveOrdersToStorage();
  updateCart();
  renderProducts(activeCat());
  updateSidebarStats();
  renderOrderTable();
  renderSummary();
  renderSales();
  toast('Day data cleared');
}

/* ─── VIEW SWITCHER ─── */
function switchView(v){
  activeView = v;
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v)?.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.getElementById('nav-'+v)?.classList.add('active');
  if(v==='summary') renderSummary();
  if(v==='orders') renderOrderTable();
  if(v==='sales') renderSales();
  if(v==='payments') renderPaySettingsForm();

  if(v !== 'cart'){
    document.getElementById('cartPanel').classList.remove('mobile-open');
  }
}

/* ─── MOBILE NAV ─── */
function mobileNav(target){
  document.querySelectorAll('.mobile-nav-btn').forEach(b=>b.classList.remove('active'));
  // 'sales' and 'payments' are opened via the More sheet, not a bottom-bar
  // icon, so only highlight a bottom-bar button if one matches this target.
  document.getElementById('mnav-'+target)?.classList.add('active');

  if(target === 'cart'){
    document.getElementById('cartPanel').classList.toggle('mobile-open');
    switchViewMainOnly('pos');
  } else {
    document.getElementById('cartPanel').classList.remove('mobile-open');
    switchViewMainOnly(target);
  }
}

function switchViewMainOnly(v){
  document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
  document.getElementById('view-'+v)?.classList.add('active');
  if(v==='summary') renderSummary();
  if(v==='orders') renderOrderTable();
  if(v==='sales') renderSales();
  if(v==='payments') renderPaySettingsForm();
}

/* ─── MOBILE "MORE" SHEET ─── */
function toggleMobileMore(show){
  const overlay = document.getElementById('mobileMoreOverlay');
  if(!overlay) return;
  const shouldShow = typeof show === 'boolean' ? show : !overlay.classList.contains('show');
  overlay.classList.toggle('show', shouldShow);
}

/* ══════════════════════════════════════════
   SALES TRACKING (week / month / year)
   Orders persist in localStorage across days, so this pulls real
   historical data for the signed-in shop, not just "today".
══════════════════════════════════════════ */
function startOfWeek(d){
  // Week starts Monday.
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (x.getDay() + 6) % 7; // Mon=0 ... Sun=6
  x.setDate(x.getDate() - day);
  return x;
}

function getPeriodBounds(period, offset){
  const now = new Date();
  if(period === 'week'){
    const start = startOfWeek(now);
    start.setDate(start.getDate() + offset*7);
    const end = new Date(start); end.setDate(end.getDate()+7);
    const buckets = [];
    for(let i=0;i<7;i++){
      const bStart = new Date(start); bStart.setDate(bStart.getDate()+i);
      const bEnd = new Date(bStart); bEnd.setDate(bEnd.getDate()+1);
      buckets.push({ start:bStart, end:bEnd, label: bStart.toLocaleDateString('en-PH',{weekday:'short'}) });
    }
    const endLabelDate = new Date(end); endLabelDate.setDate(endLabelDate.getDate()-1);
    const label = `${start.toLocaleDateString('en-PH',{month:'short',day:'numeric'})} \u2013 ${endLabelDate.toLocaleDateString('en-PH',{month:'short',day:'numeric',year:'numeric'})}`;
    return { start, end, buckets, label, chartHint:'by day' };
  }
  if(period === 'month'){
    const base = new Date(now.getFullYear(), now.getMonth()+offset, 1);
    const start = new Date(base.getFullYear(), base.getMonth(), 1);
    const end = new Date(base.getFullYear(), base.getMonth()+1, 1);
    const daysInMonth = Math.round((end-start)/86400000);
    const buckets = [];
    for(let i=0;i<daysInMonth;i++){
      const bStart = new Date(start); bStart.setDate(bStart.getDate()+i);
      const bEnd = new Date(bStart); bEnd.setDate(bEnd.getDate()+1);
      buckets.push({ start:bStart, end:bEnd, label: String(i+1) });
    }
    const label = start.toLocaleDateString('en-PH',{month:'long',year:'numeric'});
    return { start, end, buckets, label, chartHint:'by day' };
  }
  // year
  const y = now.getFullYear()+offset;
  const start = new Date(y,0,1);
  const end = new Date(y+1,0,1);
  const buckets = [];
  for(let m=0;m<12;m++){
    const bStart = new Date(y,m,1);
    const bEnd = new Date(y,m+1,1);
    buckets.push({ start:bStart, end:bEnd, label: bStart.toLocaleDateString('en-PH',{month:'short'}) });
  }
  return { start, end, buckets, label:String(y), chartHint:'by month' };
}

function salesNav(delta){
  salesOffset += delta;
  if(salesOffset > 0) salesOffset = 0; // never navigate into the future
  renderSales();
}

function renderSales(){
  if(!document.getElementById('view-sales')) return;
  const { start, end, buckets, label, chartHint } = getPeriodBounds(salesPeriod, salesOffset);

  document.getElementById('salesRangeLabel').textContent = label;
  document.getElementById('salesChartHint').textContent = chartHint;
  document.getElementById('salesNextBtn').disabled = salesOffset >= 0;
  document.getElementById('salesPrevBtn').disabled = false;

  const inRange = orders.filter(o => o.time >= start && o.time < end && o.status !== 'cancelled');
  const rev = inRange.reduce((s,o)=>s + (o.paid ? o.total : 0), 0);
  const avg = inRange.length ? Math.round(rev/inRange.length) : 0;

  document.getElementById('salesRevenue').textContent = `\u20b1${rev.toLocaleString()}`;
  document.getElementById('salesOrders').textContent  = inRange.length;
  document.getElementById('salesAvg').textContent     = `\u20b1${avg.toLocaleString()}`;
  document.getElementById('salesRevenueSub').textContent =
    salesPeriod === 'week' ? 'This week' : salesPeriod === 'month' ? 'This month' : 'This year';

  // per-bucket revenue for the bar chart
  const bucketRevs = buckets.map(b =>
    orders.filter(o => o.time >= b.start && o.time < b.end && o.status !== 'cancelled')
          .reduce((s,o)=>s + (o.paid ? o.total : 0), 0)
  );
  const maxRev = Math.max(...bucketRevs, 1);
  const chart = document.getElementById('salesChart');
  chart.innerHTML = buckets.map((b,i) => {
    const v = bucketRevs[i];
    const h = Math.max(Math.round(v/maxRev*100), v>0?4:1);
    const isPeak = v === maxRev && v > 0;
    return `
    <div class="sales-bar-col${isPeak?' is-peak':''}">
      <span class="sales-bar-val">\u20b1${v.toLocaleString()}</span>
      <div class="sales-bar${v===0?' empty':''}" style="height:${h}%"></div>
      <span class="sales-bar-label">${b.label}</span>
    </div>`;
  }).join('');

  // top services for the period
  const svcMap = {};
  inRange.forEach(o => o.items.forEach(c => {
    const k = c.service.id;
    if(!svcMap[k]) svcMap[k] = {service:c.service, qty:0, rev:0};
    svcMap[k].qty += c.qty;
    svcMap[k].rev += c.service.price * c.qty;
  }));
  const sorted = Object.values(svcMap).sort((a,b)=>b.rev-a.rev);
  const maxSvcRev = sorted[0]?.rev || 1;
  document.getElementById('salesTopServices').innerHTML = sorted.length === 0
    ? `<div style="padding:20px 16px;color:var(--text3);font-size:13px;text-align:center">No sales in this period.</div>`
    : sorted.map(s => `
    <div style="padding:10px 16px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:13px;font-weight:600;color:var(--text)">${s.service.icon} ${s.service.name}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--yellow);font-weight:700">\u20b1${s.rev.toLocaleString()}</span>
      </div>
      <div style="height:4px;background:var(--surface2);border-radius:2px;overflow:hidden">
        <div style="height:100%;width:${Math.round(s.rev/maxSvcRev*100)}%;background:var(--blue);border-radius:2px;transition:width .4s"></div>
      </div>
      <div style="font-size:11px;color:var(--text3)">${s.qty} load${s.qty!==1?'s':''}</div>
    </div>`).join('');
}

/* ══════════════════════════════════════════
   PAYMENT METHOD SETTINGS (GCash / Maya QR)
══════════════════════════════════════════ */
function paySettingsKey(){
  return PAYSETTINGS_PREFIX + (currentUser ? currentUser.userId : 'anon');
}
function loadPaySettings(){
  try {
    return JSON.parse(localStorage.getItem(paySettingsKey())) || { gcash:{qr:null,number:''}, maya:{qr:null,number:''} };
  } catch { return { gcash:{qr:null,number:''}, maya:{qr:null,number:''} }; }
}
function savePaySettingsToStorage(){
  localStorage.setItem(paySettingsKey(), JSON.stringify(paySettings));
}

function handleQrUpload(method, input){
  const file = input.files && input.files[0];
  if(!file) return;
  if(!file.type.startsWith('image/')){
    toast('Please choose an image file', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    paySettings[method] = paySettings[method] || {qr:null, number:''};
    paySettings[method].qr = reader.result; // data URL, stored locally only
    renderPaySettingsForm();
    toast(`${method === 'gcash' ? 'GCash' : 'Maya'} QR ready \u2014 tap Save to keep it`);
  };
  reader.readAsDataURL(file);
}

function savePaySettings(method){
  const numberInput = document.getElementById(method + 'Number');
  paySettings[method] = paySettings[method] || {qr:null, number:''};
  paySettings[method].number = numberInput ? numberInput.value.trim() : '';
  savePaySettingsToStorage();
  updateQrPreview();
  toast(`${method === 'gcash' ? 'GCash' : 'Maya'} details saved`, 'success');
}

function clearPaySettings(method){
  if(!confirm(`Remove the saved ${method === 'gcash' ? 'GCash' : 'Maya'} QR and number?`)) return;
  paySettings[method] = {qr:null, number:''};
  savePaySettingsToStorage();
  renderPaySettingsForm();
  updateQrPreview();
  toast('Removed');
}

function renderPaySettingsForm(){
  ['gcash','maya'].forEach(method => {
    const info = paySettings[method] || {qr:null, number:''};
    const img = document.getElementById(method + 'QrPreview');
    const empty = document.getElementById(method + 'QrEmpty');
    const numberInput = document.getElementById(method + 'Number');
    if(img && empty){
      if(info.qr){ img.src = info.qr; img.style.display='block'; empty.style.display='none'; }
      else { img.style.display='none'; empty.style.display='flex'; empty.style.alignItems='center'; empty.style.justifyContent='center'; }
    }
    if(numberInput && document.activeElement !== numberInput) numberInput.value = info.number || '';
  });
}

/* ─── TOAST ─── */
function toast(msg, type=''){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'show' + (type ? ' '+type : '');
  clearTimeout(el._t);
  el._t = setTimeout(()=>el.className='', 2200);
}
