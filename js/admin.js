const adminMsg = (text, error = false) => {
  const el = document.querySelector('#admin-message');
  if (!el) return;
  el.textContent = text;
  el.className = `form-message show${error ? ' error' : ''}`;
};

const stockMsg = (text, error = false) => {
  const el = document.querySelector('#stock-message');
  if (!el) return;
  el.textContent = text;
  el.className = `form-message show${error ? ' error' : ''}`;
  clearTimeout(stockMsg._t);
  stockMsg._t = setTimeout(() => { el.className = 'form-message'; }, 4000);
};

async function adminAPI(url, options = {}) { return API.request(url, options); }

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
const when = (v) => v ? new Date(v).toLocaleString('en-AU', { dateStyle: 'short', timeStyle: 'short' }) : '—';

document.addEventListener('DOMContentLoaded', async () => {
  /* ------------------------------------------------------------- SIGN IN */
  const login = document.querySelector('#admin-login-form');
  if (login) {
    login.addEventListener('submit', async e => {
      e.preventDefault();
      const f = new FormData(login);
      try {
        await adminAPI('/api/admin/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email: f.get('email'), password: f.get('password'), mfaCode: f.get('mfaCode') || undefined })
        });
        location.href = 'admin.html';
      } catch (err) { adminMsg(err.message, true); }
    });
  }

  const dashboard = document.querySelector('#admin-dashboard');
  if (!dashboard) return;

  /* ---------------------------------------------------------------- STOCK */
  function renderStock(data) {
    const tbody = document.querySelector('#stock-table');
    if (!tbody) return;

    const s = data.summary;
    const summaryEl = document.querySelector('#stock-summary');
    if (summaryEl) {
      summaryEl.textContent = `${s.total} fragrances · ${s.outOfStock} out of stock · ${s.lowStock} running low`;
    }
    document.querySelector('#admin-outofstock').textContent = s.outOfStock;

    tbody.innerHTML = data.products.map(p => {
      const state = p.is_out ? '<span class="pill pill-out">Out</span>'
                  : p.is_low ? '<span class="pill pill-low">Low</span>'
                  : '<span class="pill pill-ok">OK</span>';
      return `<tr data-product="${esc(p.id)}">
        <td><strong>${esc(p.name)}</strong><br><small>Updated ${when(p.stock_updated_at)}</small></td>
        <td>${esc(p.collection)}</td>
        <td>${state} <strong class="stock-count">${p.stock_packets}</strong></td>
        <td><small>${p.full_boxes} box${p.full_boxes === 1 ? '' : 'es'} + ${p.loose_packets} loose</small></td>
        <td class="stock-controls">
          <input class="stock-input" type="number" min="0" step="1" value="${p.stock_packets}" aria-label="Stock for ${esc(p.name)}">
        </td>
        <td class="stock-actions">
          <button class="stock-save" type="button">Save</button>
          <button class="stock-add" type="button">+ Add</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="6">No products yet.</td></tr>';
  }

  async function loadStock() {
    try {
      const data = await adminAPI('/api/admin/stock');
      renderStock(data);
    } catch (err) { stockMsg(err.message, true); }
  }

  async function loadMovements() {
    try {
      const { movements } = await adminAPI('/api/admin/stock/movements');
      document.querySelector('#movements-table').innerHTML = movements.slice(0, 25).map(m => {
        const delta = Number(m.change_packets);
        return `<tr>
          <td>${when(m.created_at)}</td>
          <td>${esc(m.product_name)}</td>
          <td class="${delta < 0 ? 'delta-down' : 'delta-up'}">${delta > 0 ? '+' : ''}${delta}</td>
          <td>${m.balance_after}</td>
          <td>${esc(String(m.reason).replace(/_/g, ' '))}${m.order_number ? ` · ${esc(m.order_number)}` : ''}</td>
          <td>${esc(m.admin_email || 'system')}</td>
        </tr>`;
      }).join('') || '<tr><td colspan="6">No stock movements yet.</td></tr>';
    } catch (err) { /* panel is informational; stay quiet */ }
  }

  async function patchStock(productId, body) {
    await adminAPI(`/api/admin/products/${productId}/stock`, { method: 'PATCH', body: JSON.stringify(body) });
    await Promise.all([loadStock(), loadMovements()]);
  }

  // Event delegation so the buttons keep working after every re-render.
  document.querySelector('#stock-table')?.addEventListener('click', async (e) => {
    const row = e.target.closest('tr[data-product]');
    if (!row) return;
    const productId = row.dataset.product;
    const input = row.querySelector('.stock-input');
    const value = Number(input?.value);

    if (!Number.isInteger(value) || value < 0) return stockMsg('Enter a whole number of packets, zero or more.', true);

    if (e.target.classList.contains('stock-save')) {
      try {
        await patchStock(productId, { stockPackets: value, note: 'Set from admin dashboard' });
        stockMsg('Stock updated.');
      } catch (err) { stockMsg(err.message, true); }
    }

    if (e.target.classList.contains('stock-add')) {
      if (value === 0) return stockMsg('Enter how many packets to add, then press + Add.', true);
      try {
        await patchStock(productId, { adjustBy: value, note: 'Delivery booked in' });
        stockMsg(`Added ${value} packets.`);
      } catch (err) { stockMsg(err.message, true); }
    }
  });

  /* ------------------------------------------------------------ DASHBOARD */
  try {
    const me = await adminAPI('/api/admin/me');
    document.querySelector('#admin-name').textContent = me.admin.firstName;
    document.querySelector('#admin-name-copy').textContent = me.admin.firstName;
    document.querySelector('#admin-role').textContent = me.admin.role.replace('_', ' ');

    const [orders, customers, products] = await Promise.all([
      adminAPI('/api/admin/orders'),
      adminAPI('/api/admin/customers'),
      adminAPI('/api/admin/products')
    ]);

    document.querySelector('#admin-orders').textContent = orders.orders.length;
    document.querySelector('#admin-customers').textContent = customers.customers.length;
    document.querySelector('#admin-products').textContent = products.products.length;

    document.querySelector('#orders-table').innerHTML = orders.orders.slice(0, 20).map(o =>
      `<tr><td>${esc(o.order_number)}</td><td>${esc(o.email || 'Guest')}</td><td>AUD ${Number(o.total).toFixed(2)}</td><td>${esc(o.status)}</td></tr>`
    ).join('') || '<tr><td colspan="4">No orders yet.</td></tr>';

    document.querySelector('#customers-table').innerHTML = customers.customers.slice(0, 20).map(c =>
      `<tr><td>${esc(c.first_name)} ${esc(c.last_name)}</td><td>${esc(c.email)}</td><td>${c.email_verified_at ? 'Verified' : 'Pending'}</td></tr>`
    ).join('') || '<tr><td colspan="3">No customers yet.</td></tr>';

    await Promise.all([loadStock(), loadMovements()]);
  } catch (err) {
    location.href = 'admin-login.html';
    return;
  }

  document.querySelector('#admin-logout')?.addEventListener('click', async () => {
    try { await adminAPI('/api/admin/auth/logout', { method: 'POST' }); }
    finally { location.href = 'admin-login.html'; }
  });
});