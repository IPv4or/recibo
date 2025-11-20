const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        // Ensure you add MONGO_URI in your .env or Railway variables
        if (!process.env.MONGO_URI) {
            console.log('MONGO_URI not found, skipping DB connection for now...');
            return;
        }
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        // Don't exit process in dev so the server keeps running
        console.log('Continuing without DB connection...');
    }
};

module.exports = connectDB;
