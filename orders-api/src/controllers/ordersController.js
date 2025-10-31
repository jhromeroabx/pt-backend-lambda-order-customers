const Joi = require('joi');
const axios = require('axios');
const { pool } = require('../db');

const orderSchema = Joi.object({
  customer_id: Joi.number().integer().required(),
  items: Joi.array().items(Joi.object({
    product_id: Joi.number().integer().required(),
    qty: Joi.number().integer().min(1).required()
  })).min(1).required()
});

async function validateCustomer(customerId) {
  const base = process.env.CUSTOMERS_API_BASE || 'http://localhost:3001';
  const token = process.env.SERVICE_TOKEN;
  const url = `${base}/internal/${customerId}`;
  const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
  return res.data;
}

async function createOrder(req, res) {
  const { error, value } = orderSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { customer_id, items } = value;

  let conn;
  try {
    // Validate customer via Customers API internal endpoint
    await validateCustomer(customer_id);

    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Calculate totals and check stock
    let total = 0;
    const productRows = {};
    for (const it of items) {
      const [rows] = await conn.execute('SELECT * FROM products WHERE id=? FOR UPDATE', [it.product_id]);
      if (!rows.length) throw new Error(`Product ${it.product_id} not found`);
      const p = rows[0];
      if (p.stock < it.qty) throw new Error(`Insufficient stock for product ${it.product_id}`);
      productRows[it.product_id] = p;
      total += p.price_cents * it.qty;
    }

    // Create order
    const [ordRes] = await conn.execute(
      'INSERT INTO orders (customer_id, status, total_cents) VALUES (?, ?, ?)',
      [customer_id, 'CREATED', total]
    );
    const orderId = ordRes.insertId;

    // Items + decrement stock
    for (const it of items) {
      const p = productRows[it.product_id];
      const subtotal = p.price_cents * it.qty;
      await conn.execute(
        'INSERT INTO order_items (order_id, product_id, qty, unit_price_cents, subtotal_cents) VALUES (?, ?, ?, ?, ?)',
        [orderId, it.product_id, it.qty, p.price_cents, subtotal]
      );
      await conn.execute('UPDATE products SET stock = stock - ? WHERE id=?', [it.qty, it.product_id]);
    }

    await conn.commit();

    const [orderRows] = await pool.execute('SELECT * FROM orders WHERE id=?', [orderId]);
    return res.status(201).json(orderRows[0]);
  } catch (e) {
    if (conn) await conn.rollback();
    const msg = e.response?.data || e.message;
    return res.status(400).json({ error: msg });
  } finally {
    if (conn) conn.release();
  }
}

async function getOrder(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const [orders] = await pool.execute('SELECT * FROM orders WHERE id=?', [id]);
  if (!orders.length) return res.status(404).json({ error: 'Not found' });
  const [items] = await pool.execute('SELECT * FROM order_items WHERE order_id=?', [id]);
  return res.json({ ...orders[0], items });
}

async function searchOrders(req, res) {
  const { status, from, to, cursor = 0, limit = 20 } = req.query;
  const where = [];
  const vals = [];
  if (status) { where.push('status=?'); vals.push(status); }
  if (from) { where.push('created_at>=?'); vals.push(from); }
  if (to) { where.push('created_at<=?'); vals.push(to); }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows] = await pool.execute(
    `SELECT * FROM orders ${whereSql} ORDER BY id DESC LIMIT ?, ?`,
    vals.concat([Number(cursor), Number(limit)])
  );
  return res.json({ data: rows, nextCursor: rows.length === Number(limit) ? Number(cursor) + Number(limit) : null });
}

async function confirmOrder(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const idemKey = req.header('X-Idempotency-Key');
  if (!idemKey) return res.status(400).json({ error: 'Missing X-Idempotency-Key' });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // Idempotency check
    const [idemRows] = await conn.execute('SELECT * FROM idempotency_keys WHERE `key`=?', [idemKey]);
    if (idemRows.length) {
      const saved = idemRows[0];
      // Return stored response if exists
      if (saved.response_body) {
        await conn.commit();
        return res.json(JSON.parse(saved.response_body));
      }
    } else {
      await conn.execute(
        'INSERT INTO idempotency_keys (`key`, target_type, target_id, status) VALUES (?, ?, ?, ?)',
        [idemKey, 'order_confirm', id, 'STARTED']
      );
    }

    const [orders] = await conn.execute('SELECT * FROM orders WHERE id=? FOR UPDATE', [id]);
    if (!orders.length) throw new Error('Order not found');
    const order = orders[0];
    if (order.status === 'CONFIRMED') {
      const body = { id: order.id, status: order.status, total_cents: order.total_cents };
      await conn.execute('UPDATE idempotency_keys SET status=?, response_body=? WHERE `key`=?',
        ['COMPLETED', JSON.stringify(body), idemKey]);
      await conn.commit();
      return res.json(body);
    }
    if (order.status !== 'CREATED') throw new Error('Order not in CREATED');

    await conn.execute('UPDATE orders SET status=? WHERE id=?', ['CONFIRMED', id]);
    const resultBody = { id, status: 'CONFIRMED', total_cents: order.total_cents };
    await conn.execute('UPDATE idempotency_keys SET status=?, response_body=? WHERE `key`=?',
      ['COMPLETED', JSON.stringify(resultBody), idemKey]);

    await conn.commit();
    return res.json(resultBody);
  } catch (e) {
    if (conn) await conn.rollback();
    return res.status(400).json({ error: e.message });
  } finally {
    if (conn) conn.release();
  }
}

async function cancelOrder(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [orders] = await conn.execute('SELECT * FROM orders WHERE id=? FOR UPDATE', [id]);
    if (!orders.length) throw new Error('Order not found');
    const order = orders[0];

    if (order.status === 'CREATED') {
      // restore stock
      const [items] = await conn.execute('SELECT * FROM order_items WHERE order_id=?', [id]);
      for (const it of items) {
        await conn.execute('UPDATE products SET stock = stock + ? WHERE id=?', [it.qty, it.product_id]);
      }
      await conn.execute('UPDATE orders SET status=? WHERE id=?', ['CANCELED', id]);
    } else if (order.status === 'CONFIRMED') {
      // simple rule: allow cancel within 10 minutes
      const createdAt = new Date(order.created_at);
      const diffMin = (Date.now() - createdAt.getTime()) / 60000;
      if (diffMin > 10) throw new Error('Cancel window expired');
      await conn.execute('UPDATE orders SET status=? WHERE id=?', ['CANCELED', id]);
    } else {
      throw new Error('Order already canceled');
    }

    await conn.commit();
    const [rows] = await pool.execute('SELECT * FROM orders WHERE id=?', [id]);
    return res.json(rows[0]);
  } catch (e) {
    if (conn) await conn.rollback();
    return res.status(400).json({ error: e.message });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { createOrder, getOrder, searchOrders, confirmOrder, cancelOrder };
