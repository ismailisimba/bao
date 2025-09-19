-- Migration: Add is_private and invitee_id columns to games table
ALTER TABLE games ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;
ALTER TABLE games ADD COLUMN IF NOT EXISTS invitee_id INTEGER REFERENCES bao_profiles(id);
