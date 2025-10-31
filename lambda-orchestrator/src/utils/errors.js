function isNetworkOr5xx(e) {
  if (e?.code === 'ECONNABORTED') return true; // timeout
  const st = e?.response?.status;
  return !st || (st >= 500 && st < 600);
}

function inferStepFromError(err) {
  const u = err.config?.url || '';
  if (u.includes('/internal/')) return 'validate_customer';
  if (u.includes('/orders/') && u.endsWith('/confirm')) return 'confirm_order';
  if (u.includes('/orders')) return 'create_order';
  return 'unknown';
}

module.exports = { isNetworkOr5xx, inferStepFromError };
