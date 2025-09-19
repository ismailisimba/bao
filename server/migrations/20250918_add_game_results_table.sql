-- Migration: Add game_results table for logging results
CREATE TABLE IF NOT EXISTS game_results (
    id SERIAL PRIMARY KEY,
    game_id INTEGER REFERENCES games(id),
    winner_profile_id INTEGER REFERENCES bao_profiles(id),
    loser_profile_id INTEGER REFERENCES bao_profiles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
