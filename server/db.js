require('dotenv').config();
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

module.exports = { connectDB, mongoose };
