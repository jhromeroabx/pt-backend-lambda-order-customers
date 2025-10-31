const express = require('express');
const customersRoutes = require('./routes/customers');
require('dotenv').config();

const app = express();
app.use(express.json());

app.use('/', customersRoutes);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Customers API running on port ${PORT}`));
