// lambda-orchestrator/handler.js
const axiosRaw = require('axios');
require('dotenv').config();

/** Axios client con timeout y pequeño backoff de reintentos */
function createHttp(name) {
  const client = axiosRaw.create({
    timeout: 5000, // 5s por hop
    headers: { 'Content-Type': 'application/json' }
  });

  // Interceptor de logging mínimo
  client.interceptors.request.use((cfg) => {
    console.log(JSON.stringify({
      at: 'request',
      svc: name,
      method: cfg.method?.toUpperCase(),
      url: cfg.url,
      headers: { 'x-idem': cfg.headers['X-Idempotency-Key'] || null }
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
        data: err.response?.data || null,
        msg: err.message
      }));
      return Promise.reject(err);
    }
  );

  return client;
}

const http = createHttp('orchestrator');

/** Backoff exponencial simple */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function retry(fn, { retries = 2, baseMs = 250, factor = 2, isRetriable = () => true } = {}) {
  let attempt = 0, lastErr;
  while (attempt <= retries) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      // Sólo reintenta si la heurística lo permite
      if (!isRetriable(err) || attempt === retries) break;
      const delay = Math.floor(baseMs * Math.pow(factor, attempt));
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastErr;
}

/** Util: env */
const CUS_BASE = process.env.CUSTOMERS_API_BASE;
const ORD_BASE = process.env.ORDERS_API_BASE;
const SERVICE_TOKEN = process.env.SERVICE_TOKEN;
const APIS_JWT = process.env.JWT_TOKEN_FOR_APIS;

/** Helpers HTTP (con reintentos) */
async function getInternalCustomer(customerId) {
  return retry(
    () => http.get(`${CUS_BASE}/internal/${customerId}`, {
      headers: { Authorization: `Bearer ${SERVICE_TOKEN}` }
    }),
    {
      retries: 2,
      isRetriable: (e) => isNetworkOr5xx(e)
    }
  ).then(r => r.data);
}

async function createOrder(customer_id, items) {
  return retry(
    () => http.post(`${ORD_BASE}/orders`, { customer_id, items }, {
      headers: { Authorization: `Bearer ${APIS_JWT}` }
    }),
    { retries: 1, isRetriable: (e) => isNetworkOr5xx(e) }
  ).then(r => r.data);
}

async function confirmOrder(orderId, idempotency_key) {
  return retry(
    () => http.post(`${ORD_BASE}/orders/${orderId}/confirm`, {}, {
      headers: {
        Authorization: `Bearer ${APIS_JWT}`,
        'X-Idempotency-Key': idempotency_key
      }
    }),
    { retries: 2, isRetriable: (e) => isNetworkOr5xx(e) }
  ).then(r => r.data);
}

async function cancelOrder(orderId) {
  // No se reintenta agresivamente para evitar efectos indeseados
  return http.post(`${ORD_BASE}/orders/${orderId}/cancel`, {}, {
    headers: { Authorization: `Bearer ${APIS_JWT}` }
  }).then(r => r.data);
}

async function getOrder(orderId) {
  return http.get(`${ORD_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${APIS_JWT}` }
  }).then(r => r.data);
}

/** Heurística de reintento: red/timeout/5xx */
function isNetworkOr5xx(e) {
  if (e.code === 'ECONNABORTED') return true; // timeout
  const st = e.response?.status;
  return !st || (st >= 500 && st < 600);
}

/** Respuesta estándar */
function respond(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  };
}

/**
 * Handler con:
 * - pasos explícitos
 * - compensación si confirm falla (cancel)
 * - verificación de estado en errores ambiguos
 * - logging estructurado
 */
module.exports.createAndConfirm = async (event) => {
  const startedAt = new Date().toISOString();
  const body = typeof event.body === 'string' ? safeParse(event.body) : (event.body || {});
  const { customer_id, items, idempotency_key, correlation_id = null } = body || {};

  // Validaciones rápidas
  if (!customer_id || !Array.isArray(items) || items.length === 0 || !idempotency_key) {
    return respond(400, {
      type: 'BadRequest',
      step: 'validate_input',
      retriable: false,
      correlation_id,
      message: 'Missing fields: customer_id, items[], idempotency_key'
    });
  }

  logInfo({ at: 'start', correlation_id, startedAt, body });

  let order = null;

  try {
    // STEP 1: Validate customer
    logInfo({ at: 'step', step: 'validate_customer' });
    const customer = await getInternalCustomer(customer_id);

    // STEP 2: Create order (CREATED)
    logInfo({ at: 'step', step: 'create_order' });
    order = await createOrder(customer_id, items);

    // STEP 3: Confirm (idempotent)
    logInfo({ at: 'step', step: 'confirm_order' });
    const confirmation = await confirmOrder(order.id, idempotency_key);

    // Consolidate & return
    logInfo({ at: 'step', step: 'consolidate' });
    const fullOrder = await getOrder(confirmation.id);

    const payload = {
      success: true,
      correlationId: correlation_id,
      data: { customer, order: fullOrder }
    };
    logInfo({ at: 'end', ok: true, payload });
    return respond(201, payload);

  } catch (err) {
    // Tratamiento por tipo de error y paso
    const httpStatus = err.response?.status || 500;
    const errData = err.response?.data;
    const isAmbiguous = isNetworkOr5xx(err); // podría haber sucedido el paso aunque el cliente no recibió respuesta
    const step = inferStepFromError(err);

    logError({
      at: 'catch',
      correlation_id,
      step,
      httpStatus,
      isAmbiguous,
      errMsg: err.message,
      errData
    });

    // Si falló en confirmación y tenemos order creada → intentar compensación
    if (order?.id && step === 'confirm_order') {
      // En errores ambiguos (timeout/5xx), primero inspecciona estado real
      if (isAmbiguous) {
        try {
          const latest = await getOrder(order.id);
          if (latest?.status === 'CONFIRMED') {
            // Ya quedó confirmada: devolver como éxito
            const customer = await getInternalCustomer(order.customer_id);
            const payload = {
              success: true,
              correlationId: correlation_id,
              data: { customer, order: latest }
            };
            logInfo({ at: 'recover_confirmed', orderId: order.id });
            return respond(200, payload);
          }
        } catch (_) {
          // ignorar y proseguir a compensación si aplica
        }
      }

      // Compensación: cancelar
      try {
        await cancelOrder(order.id);
        logInfo({ at: 'compensation', action: 'cancel', orderId: order.id });
      } catch (ce) {
        logError({ at: 'compensation_error', orderId: order.id, msg: ce.message });
        // Si cancel también falla, informamos que quedó en estado incierto
        return respond(502, {
          type: 'CompensationFailed',
          step,
          retriable: true,
          correlation_id,
          message: 'Confirmation failed and compensation (cancel) also failed. Manual intervention may be required.',
          details: safeErr(errData || err.message)
        });
      }
    }

    // Para fallos previos a crear la orden o durante creación:
    // — si la creación fue ambigua, intenta verificar si existe la orden.
    if (!order?.id && step === 'create_order' && isAmbiguous) {
      // Nota: en un sistema real tendríamos una clave idempotente para creación
      // (hash de customer_id+items) y un endpoint para "get or create".
      // Aquí solo señalamos que es reintento seguro y sugerimos reintentar.
      return respond(504, {
        type: 'UnknownCreateOutcome',
        step,
        retriable: true,
        correlation_id,
        message: 'Create order outcome unknown (timeout/5xx). Safe to retry the whole orchestration.',
        details: safeErr(errData || err.message)
      });
    }

    // Respuestas tipificadas
    if (httpStatus === 400 || httpStatus === 404 || httpStatus === 409) {
      return respond(httpStatus, {
        type: 'DomainError',
        step,
        retriable: false,
        correlation_id,
        message: errData?.error || err.message
      });
    }

    // 5xx, timeout, red
    return respond(isNetworkOr5xx(err) ? 504 : 500, {
      type: 'UpstreamOrNetworkError',
      step,
      retriable: true,
      correlation_id,
      message: errData?.error || err.message
    });
  }
};

// ------- utils -------
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
function safeErr(x) { return typeof x === 'string' ? x : (x?.error || x); }
function inferStepFromError(err) {
  const u = err.config?.url || '';
  if (u.includes('/internal/')) return 'validate_customer';
  if (u.includes('/orders/') && u.endsWith('/confirm')) return 'confirm_order';
  if (u.includes('/orders')) return 'create_order';
  return 'unknown';
}
function logInfo(obj) { console.log(JSON.stringify({ level: 'INFO', ...obj })); }
function logError(obj) { console.error(JSON.stringify({ level: 'ERROR', ...obj })); }
