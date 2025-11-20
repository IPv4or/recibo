const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');
require('dotenv').config();

const app = express();

// 1. Connect Database (UNCOMMENTED NOW)
connectDB();

// 2. Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); 

// 3. Serve Static Frontend
app.use(express.static(path.join(__dirname, '../client')));

// 4. API Routes
app.use('/api', require('./routes/api'));

// 5. Catch-all route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/index.html'));
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
