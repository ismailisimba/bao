const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    player1Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    player2Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },
    gameState: { type: mongoose.Schema.Types.Mixed, required: true },
    status: { type: String, enum: ['waiting', 'active', 'finished'], default: 'waiting' },
    vsAi: { type: Boolean, default: false },
    isPrivate: { type: Boolean, default: false },
    inviteeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', default: null },
    inviteCode: { type: String, default: null },
}, { timestamps: true });

gameSchema.index({ inviteCode: 1 }, { sparse: true });

module.exports = mongoose.model('Game', gameSchema);
