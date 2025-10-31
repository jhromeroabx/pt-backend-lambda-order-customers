const axiosRaw = require('axios');

function createHttp(name) {
  const client = axiosRaw.create({
    timeout: 5000,
    headers: { 'Content-Type': 'application/json' }
  });

  client.interceptors.request.use((cfg) => {
    console.log(JSON.stringify({
      at: 'request',
      svc: name,
      method: cfg.method?.toUpperCase(),
      url: cfg.url,
      headers: { 'x-idem': cfg.headers?.['X-Idempotency-Key'] || null }
    }));
    return cfg;
  });

  client.interceptors.response.use(
    (res) => res,
    (err) => {
      const status = err.response?.status || 0;
      console.error(JSON.stringify({
        at: 'response_error',
        svc: name,
        status,
        url: err.config?.url,
        data: err.response?.data ?? null,
        msg: err.message
      }));
      return Promise.reject(err);
    }
  );

  return client;
}

module.exports = { createHttp };
