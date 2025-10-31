const express = require('express');
const productsRoutes = require('./routes/products');
const ordersRoutes = require('./routes/orders');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('node:path');
const swaggerDocument = YAML.load(path.join(__dirname, '../openapi.yaml'));

const app = express();
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// ✅ Endpoint de salud — debe estar antes de app.listen()
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'orders-api' });
});

// ✅ Rutas principales
app.use('/products', productsRoutes);
app.use('/orders', ordersRoutes);

const PORT = process.env.PORT || 3002;
// 👇 Escuchar en todas las interfaces (muy importante para Docker/Windows)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Orders API running on port ${PORT}`);
});
