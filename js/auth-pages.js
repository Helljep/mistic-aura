const authMessage = (text, error = false) => {
  const el = document.querySelector('#form-message');
  if (!el) return;
  el.textContent = text;
  el.className = `form-message show${error ? ' error' : ''}`;
};

const authRequest = (url, body) => API.request(url, { method: 'POST', body: JSON.stringify(body) });

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);

  /* ---------------------------------------------------------- SIGN UP */
  const signup = document.querySelector('#signup-form');
  if (signup) {
    signup.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(signup);
      const password = f.get('password');
      if (password !== f.get('confirmPassword')) return authMessage('Passwords do not match.', true);

      const email = String(f.get('email') || '').trim().toLowerCase();

      try {
        await authRequest('/api/auth/register', {
          firstName: f.get('firstName'),
          lastName: f.get('lastName'),
          email,
          password,
          marketingOptIn: f.get('marketingOptIn') === 'on'
        });
        location.href = `verify-email.html?email=${encodeURIComponent(email)}`;
      } catch (err) {
        authMessage(err.message, true);
      }
    });
  }

  /* ----------------------------------------------------------- SIGN IN */
  const login = document.querySelector('#login-form');
  if (login) {
    if (params.get('verified') === 'true') {
      authMessage('Email verified successfully. Please sign in to continue.');
    }

    login.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(login);
      const email = String(f.get('email') || '').trim().toLowerCase();

      try {
        await authRequest('/api/auth/login', { email, password: f.get('password') });
        location.href = 'account.html';
      } catch (err) {
        authMessage(err.message, true);

        if (err.data?.code === 'EMAIL_NOT_VERIFIED') {
          const resend = document.querySelector('#resend-link');
          if (resend) {
            const link = resend.querySelector('a');
            if (link) link.href = `verify-email.html?email=${encodeURIComponent(email)}`;
            resend.classList.remove('hidden');
          }
        }
      }
    });
  }

  /* -------------------------------------------------- FORGOT PASSWORD */
  const forgot = document.querySelector('#forgot-form');
  if (forgot) {
    forgot.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(forgot);
      try {
        const d = await authRequest('/api/auth/forgot-password', { email: f.get('email') });
        authMessage(d.message);
        forgot.reset();
      } catch (err) {
        authMessage(err.message, true);
      }
    });
  }

  /* ------------------------------------------------ VERIFY EMAIL CODE */
  const verify = document.querySelector('#verify-form');
  if (verify) {
    const emailField = verify.querySelector('input[name="email"]');
    const codeField = verify.querySelector('input[name="code"]');

    // Pre-fill the email we just registered with, so the customer only types the code.
    const prefill = params.get('email');
    if (prefill && emailField) {
      emailField.value = prefill;
      emailField.setAttribute('readonly', 'readonly');
      codeField?.focus();
    }

    verify.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(verify);
      const email = String(f.get('email') || '').trim().toLowerCase();
      const code = String(f.get('code') || '').trim();

      try {
        const d = await authRequest('/api/auth/verify-email', { email, code });
        authMessage(d.message);
        setTimeout(() => { location.href = 'login.html?verified=true'; }, 1200);
      } catch (err) {
        authMessage(err.message, true);
      }
    });

    document.querySelector('#resend-code')?.addEventListener('click', async (e) => {
      e.preventDefault();
      const email = String(emailField?.value || '').trim().toLowerCase();
      if (!email) return authMessage('Enter your email address first.', true);

      try {
        const d = await authRequest('/api/auth/resend-verification', { email });
        authMessage(d.message);
        if (codeField) codeField.value = '';
      } catch (err) {
        authMessage(err.message, true);
      }
    });
  }

  /* --------------------------------------------------- RESET PASSWORD */
  const reset = document.querySelector('#reset-form');
  if (reset) {
    reset.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = new FormData(reset);
      if (f.get('password') !== f.get('confirmPassword')) return authMessage('Passwords do not match.', true);

      try {
        const d = await authRequest('/api/auth/reset-password', {
          token: f.get('token'),
          password: f.get('password')
        });
        authMessage(d.message);
        setTimeout(() => { location.href = 'login.html'; }, 1000);
      } catch (err) {
        authMessage(err.message, true);
      }
    });
  }
});