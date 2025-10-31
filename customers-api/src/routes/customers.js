const express = require('express');
const { createCustomer, getCustomer, searchCustomers } = require('../controllers/customersController');
const { authMiddleware, internalAuth } = require('../middlewares/auth');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'customers-api' }));

router.post('/', authMiddleware, createCustomer);
router.get('/', authMiddleware, searchCustomers);
router.get('/:id', authMiddleware, getCustomer);

// internal endpoint for Orders API
router.get('/internal/:id', internalAuth, getCustomer);

module.exports = router;
