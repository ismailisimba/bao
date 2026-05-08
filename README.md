---
title: Bao Game
emoji: 🪵
colorFrom: amber
colorTo: brown
sdk: docker
pinned: false
license: mit
---

# Bao – The East African Board Game

A multiplayer real-time implementation of **Bao la Kiswahili**, the ancient Swahili mancala strategy game, built with Node.js, Socket.IO, Three.js, and MongoDB. You can play it [on this link](https://eznd-bao.hf.space/)

## Features
- 🎮 **Multiplayer** – play against friends in real time
- 🤖 **Play vs Computer** – AI opponent available instantly
- 🔗 **Invite links** – share private game links with friends
- 🏆 **Leaderboard** – global rankings for all players
- 🔑 **Simple auth** – username + PIN, or generate a random account in one click

## Environment Variables

Set these in your HuggingFace Space secrets:

| Variable | Description |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret key for signing JWTs |
| `PORT` | Set to `7860` (default for HF Spaces) |

## Local Development

```bash
cd server
cp .env.example .env   # fill in your values
npm install
npm run dev
```
