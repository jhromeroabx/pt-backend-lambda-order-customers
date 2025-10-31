const express = require('express');
const { authMiddleware } = require('../middlewares/auth');
const { createOrder, getOrder, searchOrders, confirmOrder, cancelOrder } = require('../controllers/ordersController');

const router = express.Router();

router.post('/', authMiddleware, createOrder);
router.get('/', authMiddleware, searchOrders);
router.get('/:id', authMiddleware, getOrder);
router.post('/:id/confirm', authMiddleware, confirmOrder);
router.post('/:id/cancel', authMiddleware, cancelOrder);

module.exports = router;
