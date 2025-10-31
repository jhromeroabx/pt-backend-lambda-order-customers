const { retry } = require('../utils/retry');
const { isNetworkOr5xx } = require('../utils/errors');

function normalizeData(d) {
  // Axios ya parsea a objeto; si fuera string en algún caso raro, parsea.
  if (typeof d === 'string') {
    try { return JSON.parse(d); } catch { return d; }
  }
  return d;
}

function makeConfirmOrder(http, ORD_BASE, APIS_JWT) {
  return async function confirmOrder(orderId, idempotency_key) {
    return retry(
      () => http.post(`${ORD_BASE}/orders/${orderId}/confirm`, {}, {
        headers: {
          Authorization: `Bearer ${APIS_JWT}`,
          'X-Idempotency-Key': idempotency_key
        }
      }),
      { retries: 2, isRetriable: (e) => isNetworkOr5xx(e) }
      // ).then(r => normalizeData(r.data));
    ).then(r => {
      const data = normalizeData(r.data);
      // algunos backends devuelven { data: {...} } en lugar de {...}
      return data.data || data;
    });
  };
}

module.exports = { makeConfirmOrder };
