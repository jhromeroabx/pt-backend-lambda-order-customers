const { retry } = require('../utils/retry');
const { isNetworkOr5xx } = require('../utils/errors');

function makeCreateOrder(http, ORD_BASE, APIS_JWT) {
  return async function createOrder(customer_id, items) {
    return retry(
      () => http.post(`${ORD_BASE}/orders`, { customer_id, items }, {
        headers: { Authorization: `Bearer ${APIS_JWT}` }
      }),
      { retries: 1, isRetriable: (e) => isNetworkOr5xx(e) }
    ).then(r => r.data);
  };
}

module.exports = { makeCreateOrder };
