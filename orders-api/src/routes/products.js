const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const { createProduct, getProduct, searchProducts, patchProduct } = require('../controllers/productsController');

const router = express.Router();

router.get('/health', (req, res) => res.json({ status: 'ok', service: 'orders-api' }));

router.post('/', authMiddleware, createProduct);
router.get('/', authMiddleware, searchProducts);
router.get('/:id', authMiddleware, getProduct);
router.patch('/:id', authMiddleware, patchProduct);

module.exports = router;
