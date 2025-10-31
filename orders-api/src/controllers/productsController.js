const Joi = require('joi');
const { pool } = require('../db');

const productSchema = Joi.object({
  sku: Joi.string().min(2).max(50).required(),
  name: Joi.string().min(2).max(100).required(),
  price_cents: Joi.number().integer().min(0).required(),
  stock: Joi.number().integer().min(0).required(),
});

async function createProduct(req, res) {
  const { error, value } = productSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { sku, name, price_cents, stock } = value;
  try {
    const [result] = await pool.execute(
      'INSERT INTO products (sku, name, price_cents, stock) VALUES (?, ?, ?, ?)',
      [sku, name, price_cents, stock]
    );
    const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'SKU already exists' });
    }
    return res.status(500).json({ error: 'Internal error', details: e.message });
  }
}

async function getProduct(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [id]);
  if (!rows.length) return res.status(404).json({ error: 'Not found' });
  return res.json(rows[0]);
}

async function searchProducts(req, res) {
  const { search = "", cursor = 0, limit = 20 } = req.query;
  const like = `%${search}%`;
  const [rows] = await pool.execute(
    'SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY id DESC LIMIT ?, ?',
    [like, like, Number(cursor), Number(limit)]
  );
  return res.json({ data: rows, nextCursor: rows.length === Number(limit) ? Number(cursor) + Number(limit) : null });
}

async function patchProduct(req, res) {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  const { price_cents, stock } = req.body;
  if (price_cents == null && stock == null) return res.status(400).json({ error: 'Nothing to update' });
  const sets = [];
  const vals = [];
  if (price_cents != null) { sets.push('price_cents=?'); vals.push(price_cents); }
  if (stock != null) { sets.push('stock=?'); vals.push(stock); }
  vals.push(id);
  await pool.execute(`UPDATE products SET ${sets.join(', ')} WHERE id=?`, vals);
  const [rows] = await pool.execute('SELECT * FROM products WHERE id = ?', [id]);
  return res.json(rows[0]);
}

module.exports = { createProduct, getProduct, searchProducts, patchProduct };
