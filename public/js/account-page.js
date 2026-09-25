document.addEventListener('DOMContentLoaded', async () => {
  const form = document.querySelector('#account-form');
  if (!form) return;

  const msg = document.querySelector('#account-message');
  const accountShell = document.querySelector('.account-page-shell');
  const loading = document.querySelector('#account-auth-loading');

  const say = (text, error = false) => {
    if (!msg) return;

    msg.textContent = text;
    msg.className = `form-message show${error ? ' error' : ''}`;
  };

  const revealAccount = () => {
    accountShell?.classList.add('account-ready');
    loading?.setAttribute('aria-hidden', 'true');
  };

  let account;

  try {
    account = await API.request('/api/account');
  } catch (err) {

    /*
     * A real authentication failure should go to login.
     * Do not show the login page until the backend has actually
     * confirmed that there is no valid session.
     */
    if (err?.status === 401) {
      const returnPath = 'account.html';
      window.location.replace(
        `login.html?return=${encodeURIComponent(returnPath)}`
      );
      return;
    }

    /*
     * Server/network error:
     * do NOT redirect to login and do NOT leave a blank page.
     */
    revealAccount();

    say(
      'We could not load your account right now. Please try again.',
      true
    );

    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'text-link account-retry';
    retry.textContent = 'Try again →';

    retry.addEventListener('click', () => {
      window.location.reload();
    });

    msg?.appendChild(document.createElement('br'));
    msg?.appendChild(retry);

    console.error('Account initialisation failed:', err);
    return;
  }

  const u = account.user;

  form.elements.firstName.value = u.first_name || '';
  form.elements.lastName.value = u.last_name || '';
  form.elements.phone.value = u.phone || '';

  const emailEl = document.querySelector('#account-email');
  const readonlyEmail = document.querySelector('#account-email-readonly');
  const statusEl = document.querySelector('#account-status');

  if (emailEl) emailEl.textContent = u.email || '';
  if (readonlyEmail) readonlyEmail.value = u.email || '';

  if (statusEl) {
    statusEl.textContent = u.email_verified_at
      ? 'Email verified'
      : 'Email not verified';
  }

  const orders = document.querySelector('#account-orders');

  if (orders) {
    orders.innerHTML = account.orders?.length
      ? account.orders.map(o => `
          <article class="account-order">
            <div>
              <small>${o.order_number}</small>
              <h3>${new Date(o.created_at).toLocaleDateString('en-AU')}</h3>
            </div>

            <div>
              <span>${o.status}</span>
              <strong>AUD ${Number(o.total).toFixed(2)}</strong>
            </div>
          </article>
        `).join('')
      : '<p>No orders yet. Explore the collections to find your first ritual.</p>';
  }

  /*
   * Addresses
   */
  const addressForm = document.querySelector('#address-form');
  const addresses = document.querySelector('#addresses');

  const renderAddresses = () => {
    if (!addresses) return;

    addresses.innerHTML = (account.addresses || []).map(a => `
      <article class="account-address">
        <strong>${a.label}</strong>
        <p>
          ${a.first_name} ${a.last_name}<br>
          ${a.address_line_1}
          ${a.address_line_2 ? `<br>${a.address_line_2}` : ''}
          <br>
          ${a.suburb}, ${a.state} ${a.postcode}
          <br>
          Australia
        </p>
      </article>
    `).join('') || '<p>No saved addresses yet.</p>';
  };

  renderAddresses();

  /*
   * Reveal only after the account data is ready.
   */
  revealAccount();

  /*
   * Profile update
   */
  form.addEventListener('submit', async e => {
    e.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const originalText = button?.innerHTML;

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = 'Saving…';
    }

    try {
      const f = new FormData(form);

      await API.request('/api/account', {
        method: 'PATCH',
        body: JSON.stringify({
          firstName: f.get('firstName'),
          lastName: f.get('lastName'),
          phone: f.get('phone') || null
        })
      });

      say('Your details have been updated.');

    } catch (err) {

      say(
        err?.message || 'Could not update your details.',
        true
      );

    } finally {

      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML = originalText || 'Save details <span>→</span>';
      }
    }
  });

  /*
   * Logout
   */
  document.querySelector('#account-logout')?.addEventListener(
    'click',
    async () => {

      const button = document.querySelector('#account-logout');

      if (button?.dataset.loading === 'true') return;

      if (button) {
        button.dataset.loading = 'true';
        button.disabled = true;
        button.textContent = 'Signing out…';
      }

      try {
        await API.request('/api/auth/logout', {
          method: 'POST'
        });
      } finally {
        window.location.replace('index.html');
      }
    }
  );

  /*
   * Add address
   */
  addressForm?.addEventListener('submit', async e => {
    e.preventDefault();

    const button = addressForm.querySelector('button[type="submit"]');
    const originalText = button?.innerHTML;

    if (button) {
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = 'Saving…';
    }

    try {
      const f = new FormData(addressForm);

      const d = await API.request('/api/account/addresses', {
        method: 'POST',
        body: JSON.stringify({
          label: f.get('label') || 'Home',
          firstName: f.get('firstName'),
          lastName: f.get('lastName'),
          addressLine1: f.get('addressLine1'),
          addressLine2: f.get('addressLine2') || null,
          suburb: f.get('suburb'),
          state: f.get('state'),
          postcode: f.get('postcode'),
          country: 'AU',
          isDefaultShipping: true,
          isDefaultBilling: true
        })
      });

      account.addresses = [
        d.address,
        ...(account.addresses || [])
      ];

      renderAddresses();
      addressForm.reset();

      say('Address saved.');

    } catch (err) {

      say(
        err?.message || 'Could not save this address.',
        true
      );

    } finally {

      if (button) {
        button.disabled = false;
        button.removeAttribute('aria-busy');
        button.innerHTML =
          originalText || 'Save address <span>→</span>';
      }
    }
  });
});