const express = require('express');
const customersRoutes = require('./routes/customers');
require('dotenv').config();
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const path = require('node:path');
const swaggerDocument = YAML.load(path.join(__dirname, '../openapi.yaml'));

const app = express();
app.use(express.json());

app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

app.use('/customers', customersRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Customers API running on port ${PORT}`));