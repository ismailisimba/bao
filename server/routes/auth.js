const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Profile = require('../models/Profile');

// --- Random username/PIN generators ---
const ADJECTIVES = ['Swift','Brave','Mighty','Ancient','Silent','Bold','Clever','Noble','Fierce','Calm','Wise','Quick','Dark','Bright','Keen'];
const ANIMALS = ['Lion','Leopard','Eagle','Hyena','Rhino','Cobra','Crane','Zebra','Buffalo','Falcon','Jackal','Warthog','Baboon','Impala','Gecko'];

function generateUsername() {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const ani = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
    const num = Math.floor(Math.random() * 900) + 100; // 100-999
    return `${adj}${ani}${num}`.toLowerCase();
}

function generatePin() {
    return String(Math.floor(100000 + Math.random() * 900000)); // 6 digits
}

function makeToken(userId, profileId, displayName) {
    return jwt.sign(
        { userId, baoProfileId: profileId, displayName },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
    );
}

// GET /api/auth/generate — suggest a random username+PIN (does NOT save)
router.get('/generate', async (_req, res) => {
    // Keep generating until we find an unused username
    let username;
    for (let i = 0; i < 10; i++) {
        username = generateUsername();
        const exists = await User.findOne({ username });
        if (!exists) break;
    }
    res.json({ username, pin: generatePin() });
});

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { username, pin, displayName } = req.body;
    if (!username || !pin) {
        return res.status(400).json({ message: 'Username and PIN are required.' });
    }
    if (String(pin).length < 4 || String(pin).length > 8) {
        return res.status(400).json({ message: 'PIN must be 4–8 digits.' });
    }
    try {
        const existing = await User.findOne({ username: username.toLowerCase().trim() });
        if (existing) {
            return res.status(409).json({ message: 'Username already taken.' });
        }
        const pinHash = await bcrypt.hash(String(pin), 10);
        const user = await User.create({ username: username.toLowerCase().trim(), pinHash });
        const profile = await Profile.create({
            userId: user._id,
            displayName: displayName || username,
        });
        const token = makeToken(user._id, profile._id, profile.displayName);
        res.status(201).json({ token });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { username, pin } = req.body;
    if (!username || !pin) {
        return res.status(400).json({ message: 'Username and PIN are required.' });
    }
    try {
        const user = await User.findOne({ username: username.toLowerCase().trim() });
        if (!user) return res.status(401).json({ message: 'Invalid username or PIN.' });

        const valid = await bcrypt.compare(String(pin), user.pinHash);
        if (!valid) return res.status(401).json({ message: 'Invalid username or PIN.' });

        let profile = await Profile.findOne({ userId: user._id });
        if (!profile) {
            profile = await Profile.create({ userId: user._id, displayName: user.username });
        }
        const token = makeToken(user._id, profile._id, profile.displayName);
        res.json({ token });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;
