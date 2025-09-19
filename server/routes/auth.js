const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// POST /api/auth/register
router.post('/register', async (req, res) => {
    const { email, password, displayName } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }
    try {
        // Check if user already exists in bao_users or users
        const userCheck = await db.query('SELECT id FROM bao_users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        //const mainUserCheck = await db.query('SELECT user_id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        if (userCheck.rows.length > 0) {
            return res.status(409).json({ message: 'User already exists.' });
        }
        // Hash password
        const passwordHash = await bcrypt.hash(password, 10);
        // Insert user into bao_users
        const userResult = await db.query(
            'INSERT INTO bao_users (email, password_hash) VALUES ($1, $2) RETURNING id, email',
            [email, passwordHash]
        );
        const user = userResult.rows[0];
        // Create bao profile
        const profileResult = await db.query(
            'INSERT INTO bao_profiles (user_id, display_name) VALUES ($1, $2) RETURNING id, display_name',
            [user.id, displayName || email.split('@')[0]]
        );
        const baoProfile = profileResult.rows[0];
        // Create JWT
        const tokenPayload = {
            userId: user.id,
            baoProfileId: baoProfile.id,
            displayName: baoProfile.display_name
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });
        res.status(201).json({ token });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

// A NOTE ON THIS FILE:
// This is an EXAMPLE authentication flow. You should adapt this
// to your existing `users` table and password hashing mechanism.
// For this example, we assume your `users` table has `id`, `email`, `password_hash`.

// POST /api/auth/login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ message: 'Email and password are required.' });
    }

    try {
        // 1. Try bao_users first
        let userResult = await db.query('SELECT id, email, password_hash FROM bao_users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
        let user = userResult.rows[0];
        let userId = user ? user.id : null;
        let isPasswordValid = false;
        let isBaoUser = false;
        if (user) {
            isPasswordValid = await bcrypt.compare(password, user.password_hash);
            isBaoUser = true;
        } else {
            // 2. Try main users table
            userResult = await db.query('SELECT user_id, email, password_hash FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
            user = userResult.rows[0];
            if (user) {
                userId = user.user_id;
                isPasswordValid = await bcrypt.compare(password, user.password_hash);
            }
        }
        if (!user || !isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 2. Find or create a Bao profile for this user
        let profileResult = await db.query('SELECT id, display_name FROM bao_profiles WHERE user_id = $1', [userId]);
        let baoProfile;

        if (profileResult.rows.length === 0) {
            // Create a profile on first login to the game
            const displayName = email.split('@')[0]; // A simple default display name
            const newProfileResult = await db.query(
                'INSERT INTO bao_profiles (user_id, display_name) VALUES ($1, $2) RETURNING id, display_name',
                [userId, displayName]
            );
            baoProfile = newProfileResult.rows[0];
        } else {
            baoProfile = profileResult.rows[0];
        }

        // 3. Create a JWT
        const tokenPayload = {
            userId: userId,
            baoProfileId: baoProfile.id,
            displayName: baoProfile.display_name
        };
        const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.json({ token });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ message: 'Internal server error.' });
    }
});

module.exports = router;
