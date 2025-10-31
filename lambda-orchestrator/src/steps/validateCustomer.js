const { retry } = require('../utils/retry');
const { isNetworkOr5xx } = require('../utils/errors');

function makeValidateCustomer(http, CUS_BASE, SERVICE_TOKEN) {
  return async function getInternalCustomer(customerId) {
    return retry(
      () => http.get(`${CUS_BASE}/internal/${customerId}`, {
        headers: { Authorization: `Bearer ${SERVICE_TOKEN}` }
      }),
      { retries: 2, isRetriable: (e) => isNetworkOr5xx(e) }
    ).then(r => r.data);
  };
}

module.exports = { makeValidateCustomer };
