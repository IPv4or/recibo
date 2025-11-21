const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

connectDB();

app.use(cors());
app.use(express.json({ limit: '50mb' })); 

app.use(express.static(path.join(__dirname, '../client')));

app.use('/api', require('./routes/api'));

app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
