import GameScene from './GameScene.js';
import { connectToServer, joinGame, leaveGame, sendMove } from './socket-client.js';

// --- State ---
let token = null;
let currentGameId = null;
let myProfileId = null;
let gameSceneInstance = null;
let lobbyPollInterval = null;
let pendingInviteCode = null;
let pendingInviteHostName = null;

// --- Screen helpers ---
function showScreen(id) {
    ['auth-screen', 'lobby-screen', 'game-screen'].forEach(s => {
        const el = document.getElementById(s);
        if (el) el.style.display = s === id ? (id === 'lobby-screen' ? 'flex' : 'block') : 'none';
    });
}

// --- JWT helper ---
function parseJwt(t) {
    try { return JSON.parse(atob(t.split('.')[1])); } catch { return null; }
}

// =========================================================
// AUTH TAB SWITCHER
// =========================================================
window.switchTab = function(tab) {
    document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
    document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab !== 'login');
    document.getElementById('login-error').textContent = '';
    document.getElementById('register-error').textContent = '';
};

// =========================================================
// LOGIN
// =========================================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value.trim();
    const pin = document.getElementById('login-pin').value.trim();
    const errEl = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');
    errEl.textContent = '';
    btn.disabled = true; btn.textContent = 'Logging in…';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.message || 'Login failed.'; return; }
        await onAuthSuccess(data.token);
    } catch { errEl.textContent = 'Network error. Please try again.'; }
    finally { btn.disabled = false; btn.textContent = 'Login'; }
});

// =========================================================
// REGISTER
// =========================================================
document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value.trim();
    const pin = document.getElementById('reg-pin').value.trim();
    const displayName = document.getElementById('reg-displayname').value.trim();
    const errEl = document.getElementById('register-error');
    const btn = document.getElementById('register-btn');
    errEl.textContent = '';

    if (pin.length < 4 || pin.length > 8 || !/^\d+$/.test(pin)) {
        errEl.textContent = 'PIN must be 4–8 digits.'; return;
    }
    btn.disabled = true; btn.textContent = 'Creating…';
    try {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, pin, displayName }),
        });
        const data = await res.json();
        if (!res.ok) { errEl.textContent = data.message || 'Registration failed.'; return; }
        await onAuthSuccess(data.token);
    } catch { errEl.textContent = 'Network error. Please try again.'; }
    finally { btn.disabled = false; btn.textContent = 'Create Account'; }
});

// =========================================================
// RANDOM ACCOUNT GENERATOR
// =========================================================
async function fetchSuggestion() {
    const res = await fetch('/api/auth/generate');
    return res.json();
}

document.getElementById('gen-suggest-btn').addEventListener('click', async () => {
    const box = document.getElementById('generate-box');
    box.style.display = 'block';
    document.getElementById('gen-username').textContent = '…';
    document.getElementById('gen-pin').textContent = '…';
    const { username, pin } = await fetchSuggestion();
    document.getElementById('gen-username').textContent = username;
    document.getElementById('gen-pin').textContent = pin;
});

document.getElementById('gen-refresh-btn').addEventListener('click', async () => {
    document.getElementById('gen-username').textContent = '…';
    document.getElementById('gen-pin').textContent = '…';
    const { username, pin } = await fetchSuggestion();
    document.getElementById('gen-username').textContent = username;
    document.getElementById('gen-pin').textContent = pin;
});

document.getElementById('gen-use-btn').addEventListener('click', () => {
    const username = document.getElementById('gen-username').textContent;
    const pin = document.getElementById('gen-pin').textContent;
    if (username === '—' || username === '…') return;
    document.getElementById('reg-username').value = username;
    document.getElementById('reg-pin').value = pin;
    document.getElementById('reg-displayname').value = '';
    document.getElementById('generate-box').style.display = 'none';
    document.getElementById('register-btn').focus();
});

// =========================================================
// AUTH SUCCESS
// =========================================================
async function onAuthSuccess(t) {
    token = t;
    const payload = parseJwt(token);
    myProfileId = payload.baoProfileId;
    localStorage.setItem('bao_token', token);
    connectToServer(token, onGameStateUpdate, () => refreshLobbyGames());

    // Handle pending invite
    if (pendingInviteCode) {
        await showLobby();
        handlePendingInvite();
    } else {
        await showLobby();
    }
}

// =========================================================
// LOBBY
// =========================================================
async function showLobby() {
    stopLobbyPoll();
    const payload = parseJwt(token);
    document.getElementById('player-name').textContent = payload.displayName;
    showScreen('lobby-screen');

    if (pendingInviteCode) handlePendingInvite();

    await Promise.all([refreshLobbyGames(), refreshActiveGames(), refreshResults()]);
    startLobbyPoll();
}

function startLobbyPoll() {
    stopLobbyPoll();
    lobbyPollInterval = setInterval(() => {
        refreshLobbyGames();
        refreshActiveGames();
    }, 5000);
}
function stopLobbyPoll() {
    if (lobbyPollInterval) { clearInterval(lobbyPollInterval); lobbyPollInterval = null; }
}

async function refreshLobbyGames() {
    const indicator = document.getElementById('lobby-refresh-indicator');
    if (indicator) indicator.textContent = '⟳';
    try {
        const res = await fetch('/api/games', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const games = await res.json();
        const list = document.getElementById('open-games-list');
        list.innerHTML = '';
        if (games.length === 0) {
            list.innerHTML = '<li class="empty-state"><div class="icon">🎮</div>No open games. Create one!</li>';
        } else {
            games.forEach(g => {
                const li = document.createElement('li');
                li.className = 'game-item';
                li.innerHTML = `
                    <span class="game-item-name">👤 ${g.player1_name}</span>
                    <span class="game-item-badge ${g.is_private ? 'private' : ''}">${g.is_private ? 'Private' : 'Public'}</span>
                `;
                li.addEventListener('click', () => handleJoinGame(g.id));
                list.appendChild(li);
            });
        }
    } catch { /* silent */ }
    finally { if (indicator) indicator.textContent = ''; }
}

async function refreshActiveGames() {
    try {
        const res = await fetch('/api/games/active', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const games = await res.json();
        const container = document.getElementById('active-games-container');
        const list = document.getElementById('active-games-list');
        list.innerHTML = '';

        if (games.length === 0) {
            container.style.display = 'none';
        } else {
            container.style.display = 'block';
            games.forEach(g => {
                const li = document.createElement('li');
                li.className = 'game-item';
                // Active game logic
                const vsText = g.vsAi ? '🤖 Computer' : `👤 ${g.opponentName}`;
                li.innerHTML = `
                    <span class="game-item-name">vs ${vsText}</span>
                    <span class="game-item-badge ${g.status === 'active' ? '' : 'private'}">${g.status === 'active' ? 'In Progress' : 'Waiting'}</span>
                `;
                li.addEventListener('click', () => {
                    currentGameId = g.id;
                    joinGame(currentGameId);
                    showGame();
                });
                list.appendChild(li);
            });
        }
    } catch { /* silent */ }
}

async function refreshResults() {
    try {
        const res = await fetch('/api/games/results', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) return;
        const results = await res.json();
        const list = document.getElementById('game-results-list');
        list.innerHTML = '';
        if (results.length === 0) {
            list.innerHTML = '<li class="result-item" style="color:var(--cream-dim);opacity:0.6;">No results yet.</li>';
            return;
        }
        results.forEach(r => {
            const li = document.createElement('li');
            li.className = 'result-item';
            const aiTag = r.is_vs_ai ? '<span class="ai-badge">vs AI</span>' : '';
            const time = new Date(r.created_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });
            li.innerHTML = `<span class="winner">🏆 ${r.winner_name}</span>${aiTag}<span class="vs">beat</span><span class="loser">${r.loser_name}</span><div class="time">${time}</div>`;
            list.appendChild(li);
        });
    } catch { /* silent */ }
}

// =========================================================
// INVITE LINK HANDLING
// =========================================================
function handlePendingInvite() {
    if (!pendingInviteCode) return;
    const banner = document.getElementById('lobby-invite-banner');
    const hostEl = document.getElementById('lobby-invite-host');
    const joinBtn = document.getElementById('lobby-join-invite-btn');
    if (pendingInviteHostName) hostEl.textContent = pendingInviteHostName;
    banner.style.display = 'block';
    joinBtn.onclick = async () => {
        banner.style.display = 'none';
        await handleJoinByInviteCode(pendingInviteCode);
        pendingInviteCode = null;
        pendingInviteHostName = null;
    };
}

async function handleJoinByInviteCode(code) {
    try {
        const res = await fetch(`/api/games/invite/${code}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) { showToast('Invite link expired or already used.', 'error'); return; }
        const game = await res.json();
        await handleJoinGame(game.id);
    } catch { showToast('Could not join invite game.', 'error'); }
}

// =========================================================
// CREATE GAME BUTTONS
// =========================================================
document.getElementById('play-ai-btn').addEventListener('click', () => handleCreateGame({ vsAi: true }));
document.getElementById('create-public-btn').addEventListener('click', () => handleCreateGame({ isPrivate: false }));
document.getElementById('create-private-btn').addEventListener('click', async () => {
    await handleCreateGame({ isPrivate: true });
});

async function handleCreateGame({ vsAi = false, isPrivate = false } = {}) {
    try {
        const res = await fetch('/api/games', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ vsAi, isPrivate }),
        });
        if (!res.ok) { showToast('Failed to create game.', 'error'); return; }
        const game = await res.json();
        currentGameId = game.id;

        if (isPrivate && game.inviteCode) {
            const link = `${window.location.origin}?invite=${game.inviteCode}`;
            const box = document.getElementById('invite-box');
            const input = document.getElementById('invite-link-input');
            box.style.display = 'block';
            input.value = link;
            showToast('Invite link created! Share it with your friend.', 'success');
        }

        joinGame(currentGameId);
        await showGame();
    } catch { showToast('Network error.', 'error'); }
}

// =========================================================
// JOIN GAME
// =========================================================
async function handleJoinGame(gameId) {
    try {
        const res = await fetch(`/api/games/${gameId}/join`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            const d = await res.json();
            showToast(d.message || 'Failed to join game.', 'error');
            refreshLobbyGames();
            return;
        }
        currentGameId = gameId;
        joinGame(currentGameId);
        await showGame();
    } catch { showToast('Network error.', 'error'); }
}

// =========================================================
// SHOW GAME SCREEN
// =========================================================
async function showGame() {
    stopLobbyPoll();
    // Show loading overlay before init
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.classList.remove('hidden');
        // Reset progress
        const bar = document.getElementById('loading-bar');
        const status = document.getElementById('loading-status');
        if (bar) bar.style.width = '0%';
        if (status) status.textContent = 'Initializing…';
    }
    showScreen('game-screen');
    if (!gameSceneInstance) {
        const canvas = document.getElementById('game-canvas');
        gameSceneInstance = new GameScene(canvas, handlePitClick);
        // Fire game-over toast exactly when the last animation + turn-transition ends
        gameSceneInstance.onAnimationComplete = (finalState) => {
            if (!finalState.gameOver) return;
            const winner  = finalState.winner;
            const myNum   = finalState.player1_id === myProfileId ? 1 : 2;
            const winnerName = winner === 1
                ? (finalState.player1_name || 'Player 1')
                : (finalState.player2_name || 'Player 2');
            const isMyWin = winner === myNum;
            const msg = isMyWin ? `🎉 You won! Great game!` : `😔 ${winnerName} wins. Better luck next time!`;
            showToast(msg, isMyWin ? 'success' : 'error');
        };
        await gameSceneInstance.init();
    } else {
        // Scene already initialized, just hide overlay immediately
        if (overlay) overlay.classList.add('hidden');
    }
}

// =========================================================
// BACK TO LOBBY
// =========================================================
document.getElementById('back-to-lobby-btn').addEventListener('click', async () => {
    if (currentGameId) leaveGame(currentGameId);
    currentGameId = null;
    await showLobby();
});

document.getElementById('switch-env-btn').addEventListener('click', () => {
    if (gameSceneInstance) {
        const nextEnv = gameSceneInstance.cycleEnvironment();
        const btn = document.getElementById('switch-env-btn');
        const labels = {
            'zanzibar': '🌍 Environment: Zanzibar Coast',
            'serengeti': '🌍 Environment: Serengeti Plains',
            'kilwa': '🌍 Environment: Kilwa Ruins'
        };
        btn.textContent = labels[nextEnv] || '🌍 Switch Environment';
    }
});

// =========================================================
// GAME: pit click & state update
// =========================================================
function handlePitClick(pitIndex) {
    sendMove(currentGameId, { pitIndex });
}

function onGameStateUpdate(updateData) {
    if (!gameSceneInstance) return;
    if (updateData.moveSequence && updateData.finalState) {
        // Animation (and any game-over toast) is handled inside GameScene
        // via the onAnimationComplete callback set in showGame().
        gameSceneInstance.playMoveAnimation(updateData.moveSequence, updateData.finalState, myProfileId);
    } else {
        gameSceneInstance.renderGameState(updateData, myProfileId);
    }
}

// =========================================================
// LOGOUT
// =========================================================
document.getElementById('logout-btn').addEventListener('click', () => {
    stopLobbyPoll();
    if (currentGameId) leaveGame(currentGameId);
    localStorage.removeItem('bao_token');
    token = null; myProfileId = null; currentGameId = null;
    showScreen('auth-screen');
});

// =========================================================
// INIT
// =========================================================

async function init() {
    // Check for invite code in URL first
    const params = new URLSearchParams(window.location.search);
    const inviteCode = params.get('invite');
    if (inviteCode) {
        pendingInviteCode = inviteCode.toUpperCase();
        // Show invite banner on auth screen
        document.getElementById('invite-banner').style.display = 'block';
        // Try to pre-fetch host name
        try {
            // We don't have auth yet, so we'll resolve it post-login
            // Just store the code for now
        } catch { /* ignore */ }
        // Clear from URL without reload
        window.history.replaceState({}, '', window.location.pathname);
    }

    const savedToken = localStorage.getItem('bao_token');
    if (!savedToken) { showScreen('auth-screen'); return; }

    const payload = parseJwt(savedToken);
    if (!payload || (payload.exp && payload.exp * 1000 < Date.now())) {
        localStorage.removeItem('bao_token');
        showScreen('auth-screen');
        return;
    }

    token = savedToken;
    myProfileId = payload.baoProfileId;
    connectToServer(token, onGameStateUpdate, () => refreshLobbyGames());

    if (pendingInviteCode) {
        await showLobby();
        handlePendingInvite();
    } else {
        await showLobby();
    }
}

// =========================================================
// COPY INVITE LINK
// =========================================================
document.getElementById('copy-invite-btn').addEventListener('click', () => {
    const input = document.getElementById('invite-link-input');
    navigator.clipboard.writeText(input.value).then(() => {
        showToast('Invite link copied!', 'success');
    });
});

// =========================================================
// TOAST UTILITY
// =========================================================
function showToast(msg, type = 'info') {
    const colors = { success: 'rgba(106,176,76,0.9)', error: 'rgba(224,108,117,0.9)', info: 'rgba(97,175,239,0.8)' };
    const toast = document.createElement('div');
    toast.style.cssText = `
        position:fixed; bottom:120px; left:50%; transform:translateX(-50%);
        background:${colors[type]}; color:#fff; padding:11px 22px;
        border-radius:8px; font-family:'Outfit',sans-serif; font-size:0.92rem;
        z-index:9999; pointer-events:none; white-space:nowrap;
        animation: fadeUp 0.3s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

init();
