const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        if (!process.env.MONGO_URI) {
            console.log('MONGO_URI not found, skipping DB connection for now...');
            return;
        }
        
        await mongoose.connect(process.env.MONGO_URI);
        console.log('MongoDB Connected...');
    } catch (err) {
        console.error(err.message);
        console.log('Continuing without DB connection...');
    }
};

module.exports = connectDB;
