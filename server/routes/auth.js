const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
        // 1. Authenticate against your main users table
        const sql = 'SELECT user_id, email, password_hash, subscription_status FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1';
        const params = [email];
        const userResult = await db.query(sql, params);
    
        if (userResult.rows.length === 0) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        const user = userResult.rows[0];
        const isPasswordValid = await bcrypt.compare(password, user.password_hash);
        // IMPORTANT: Use your existing password validation logic here!
        // For this example, we'll assume it's valid if the user is found.
        //const isPasswordValid = true; 
        
        if (!isPasswordValid) {
            return res.status(401).json({ message: 'Invalid credentials.' });
        }

        // 2. Find or create a Bao profile for this user
        let profileResult = await db.query('SELECT id, display_name FROM bao_profiles WHERE user_id = $1', [user.user_id]);
        let baoProfile;

        if (profileResult.rows.length === 0) {
            // Create a profile on first login to the game
            const displayName = email.split('@')[0]; // A simple default display name
            const newProfileResult = await db.query(
                'INSERT INTO bao_profiles (user_id, display_name) VALUES ($1, $2) RETURNING id, display_name',
                [user.user_id, displayName]
            );
            baoProfile = newProfileResult.rows[0];
        } else {
            baoProfile = profileResult.rows[0];
        }

        // 3. Create a JWT
        const tokenPayload = {
            userId: user.user_id,
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
