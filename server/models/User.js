const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: {
        type: String, required: true, unique: true,
        lowercase: true, trim: true, minlength: 3, maxlength: 24
    },
    pinHash: { type: String, required: true },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
