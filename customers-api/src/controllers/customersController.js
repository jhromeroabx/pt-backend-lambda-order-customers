const Joi = require('joi');
const { pool } = require('../db');

const customerSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().min(5).max(20).optional()
});

async function createCustomer(req, res) {
  const { error, value } = customerSchema.validate(req.body);
  if (error) return res.status(400).json({ error: error.message });
  const { name, email, phone } = value;
  try {
    const [result] = await pool.execute(
      'INSERT INTO customers (name, email, phone) VALUES (?, ?, ?)',
      [name, email, phone || null]
    );
    const [rows] = await pool.execute('SELECT * FROM customers WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (e) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already exists' });
    }
    return res.status(500).json({ error: 'Internal error', details: e.message });
  }
}

async function getCustomer(req, res) {
  const id = Number.parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    const [rows] = await pool.execute('SELECT * FROM customers WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', details: e.message });
  }
}

async function searchCustomers(req, res) {
  const { search = "", cursor = 0, limit = 20 } = req.query;
  const like = `%${search}%`;
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM customers WHERE name LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT ?, ?',
      [like, like, Number(cursor), Number(limit)]
    );
    return res.json({ data: rows, nextCursor: rows.length === Number(limit) ? Number(cursor) + Number(limit) : null });
  } catch (e) {
    return res.status(500).json({ error: 'Internal error', details: e.message });
  }
}

module.exports = { createCustomer, getCustomer, searchCustomers };
