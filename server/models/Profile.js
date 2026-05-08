const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    displayName: { type: String, required: true },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    isBot: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Profile', profileSchema);
