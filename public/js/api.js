const API = {
  _csrfToken: null,
  _csrfPromise: null,

  async csrf(forceRefresh = false) {

    if (!forceRefresh && API._csrfToken) {
      return API._csrfToken;
    }

    if (!forceRefresh && API._csrfPromise) {
      return API._csrfPromise;
    }

    API._csrfPromise = fetch('/api/auth/csrf', {
      credentials: 'include',
      cache: 'no-store'
    })
      .then(async response => {

        const data = await response
          .json()
          .catch(() => ({}));

        if (!response.ok) {
          throw Object.assign(
            new Error(
              data.error ||
              'Could not initialize security token'
            ),
            {
              status: response.status,
              data
            }
          );
        }

        API._csrfToken = data.csrfToken;

        return API._csrfToken;
      })
      .finally(() => {
        API._csrfPromise = null;
      });

    return API._csrfPromise;
  },

  async request(url, options = {}) {

    const method = (
      options.method || 'GET'
    ).toUpperCase();

    const headers = {
      ...(options.headers || {})
    };

    if (
      options.body !== undefined &&
      !headers['Content-Type']
    ) {
      headers['Content-Type'] = 'application/json';
    }

    const isMutation = [
      'POST',
      'PUT',
      'PATCH',
      'DELETE'
    ].includes(method);

    if (isMutation) {
      headers['X-CSRF-Token'] = await API.csrf();
    }

    let response = await fetch(url, {
      ...options,
      method,
      headers,
      credentials: 'include'
    });

    /*
     * If the CSRF token is stale, refresh it once and retry.
     * This prevents unnecessary failures after a session has
     * been open for a while.
     */
    if (
      isMutation &&
      response.status === 403
    ) {

      const firstData = await response
        .clone()
        .json()
        .catch(() => ({}));

      if (
        String(firstData.error || '')
          .toLowerCase()
          .includes('csrf')
      ) {

        API._csrfToken = null;

        headers['X-CSRF-Token'] =
          await API.csrf(true);

        response = await fetch(url, {
          ...options,
          method,
          headers,
          credentials: 'include'
        });
      }
    }

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {

      throw Object.assign(
        new Error(
          data.error ||
          'Request failed'
        ),
        {
          status: response.status,
          data
        }
      );
    }

    return data;
  }
};