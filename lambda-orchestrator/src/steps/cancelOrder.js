function makeCancelOrder(http, ORD_BASE, APIS_JWT) {
  return async function cancelOrder(orderId) {
    const r = await http.post(`${ORD_BASE}/orders/${orderId}/cancel`, {}, {
      headers: { Authorization: `Bearer ${APIS_JWT}` }
    });
    return r.data;
  };
}

module.exports = { makeCancelOrder };
