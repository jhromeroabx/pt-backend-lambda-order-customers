require('dotenv').config();
const { createHttp } = require('./http/client');
const { logInfo, logError } = require('./utils/log');
const { respond, safeParse, safeErr } = require('./utils/response');
const { isNetworkOr5xx, inferStepFromError } = require('./utils/errors');
const { makeValidateCustomer } = require('./steps/validateCustomer');
const { makeCreateOrder } = require('./steps/createOrder');
const { makeConfirmOrder } = require('./steps/confirmOrder');
const { makeCancelOrder } = require('./steps/cancelOrder');
const { makeGetOrder } = require('./steps/getOrder');

const http = createHttp('orchestrator');

const CUS_BASE     = process.env.CUSTOMERS_API_BASE;
const ORD_BASE     = process.env.ORDERS_API_BASE;
const SERVICE_TOKEN= process.env.SERVICE_TOKEN;
const APIS_JWT     = process.env.JWT_TOKEN_FOR_APIS;

const validateCustomer = makeValidateCustomer(http, CUS_BASE, SERVICE_TOKEN);
const createOrder      = makeCreateOrder(http, ORD_BASE, APIS_JWT);
const confirmOrder     = makeConfirmOrder(http, ORD_BASE, APIS_JWT);
const cancelOrder      = makeCancelOrder(http, ORD_BASE, APIS_JWT);
const getOrder         = makeGetOrder(http, ORD_BASE, APIS_JWT);

async function createAndConfirm(event) {
  const startedAt = new Date().toISOString();
  const body = typeof event.body === 'string' ? safeParse(event.body) : (event.body || {});
  const { customer_id, items, idempotency_key, correlation_id = null } = body || {};

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
    // STEP 1
    logInfo({ at: 'step', step: 'validate_customer' });
    const customer = await validateCustomer(customer_id);

    // STEP 2
    logInfo({ at: 'step', step: 'create_order' });
    order = await createOrder(customer_id, items);

    // STEP 3
    logInfo({ at: 'step', step: 'confirm_order' });
    const confirmation = await confirmOrder(order.id, idempotency_key);
    logInfo({ at: 'debug', step: 'after_confirm', confirmation });

    // STEP 4
    logInfo({ at: 'step', step: 'consolidate' });
    const fullOrder = await getOrder(confirmation.id);

    const payload = { success: true, correlationId: correlation_id, data: { customer, order: fullOrder } };
    logInfo({ at: 'end', ok: true, payload });
    return respond(201, payload);

  } catch (err) {
    const httpStatus = err.response?.status || 500;
    const errData = err.response?.data;
    const isAmbiguous = isNetworkOr5xx(err);
    const step = inferStepFromError(err);

    logError({ at: 'catch', correlation_id, step, httpStatus, isAmbiguous, errMsg: err.message, errData });

    // Compensación si falló confirmación
    if (order?.id && step === 'confirm_order') {
      if (isAmbiguous) {
        try {
          const latest = await getOrder(order.id);
          if (latest?.status === 'CONFIRMED') {
            const customer = await validateCustomer(order.customer_id);
            const payload = { success: true, correlationId: correlation_id, data: { customer, order: latest } };
            logInfo({ at: 'recover_confirmed', orderId: order.id });
            return respond(200, payload);
          }
        } catch (_) {}
      }
      try {
        await cancelOrder(order.id);
        logInfo({ at: 'compensation', action: 'cancel', orderId: order.id });
      } catch (ce) {
        logError({ at: 'compensation_error', orderId: order.id, msg: ce.message });
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

    if (!order?.id && step === 'create_order' && isAmbiguous) {
      return respond(504, {
        type: 'UnknownCreateOutcome',
        step,
        retriable: true,
        correlation_id,
        message: 'Create order outcome unknown (timeout/5xx). Safe to retry the whole orchestration.',
        details: safeErr(errData || err.message)
      });
    }

    if (httpStatus === 400 || httpStatus === 404 || httpStatus === 409) {
      return respond(httpStatus, { type: 'DomainError', step, retriable: false, correlation_id, message: errData?.error || err.message });
    }

    return respond(isNetworkOr5xx(err) ? 504 : 500, { type: 'UpstreamOrNetworkError', step, retriable: true, correlation_id, message: errData?.error || err.message });
  }
}

module.exports = { createAndConfirm };
