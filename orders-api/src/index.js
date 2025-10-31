const express = require('express');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use('/products', productsRoutes);
app.use('/orders', ordersRoutes);
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'orders-api' }));

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`🚀 Orders API running on port ${PORT}`));
