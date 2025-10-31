function makeGetOrder(http, ORD_BASE, APIS_JWT) {
  return async function getOrder(orderId) {
    const r = await http.get(`${ORD_BASE}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${APIS_JWT}` }
    });
    return r.data;
  };
}

module.exports = { makeGetOrder };
