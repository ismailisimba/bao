import GameScene from './GameScene.js';
import { connectToServer, joinGame, sendMove } from './socket-client.js';

// --- State Management ---
let token = null;
let currentGameId = null;
let myProfileId = null;
let gameSceneClass = null; // This will hold our single scene instance

// --- DOM Elements ---
const loginContainer = document.getElementById('login-container');
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const toggleAuthBtn = document.getElementById('toggle-auth-btn');
const createGameBtn = document.getElementById('create-game-btn');
const createPrivateGameBtn = document.getElementById('create-private-game-btn');
const inviteeEmailInput = document.getElementById('invitee-email');
const openGamesList = document.getElementById('open-games-list');
const playerNameSpan = document.getElementById('player-name');
const gameResultsList = document.getElementById('game-results-list');
const loginErrorP = document.getElementById('login-error');
const registerErrorP = document.getElementById('register-error');
const loginTitle = document.getElementById('login-title');

// --- UI Flow Functions ---
function showScreen(screen) {
    loginContainer.style.display = 'none';
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'none';
    screen.style.display = 'flex';
}

async function showLobby() {
    playerNameSpan.textContent = parseJwt(token).displayName;
    // Fetch open games
    const res = await fetch('/api/games', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const games = await res.json();
    openGamesList.innerHTML = '';
    if (games.length === 0) {
        openGamesList.innerHTML = '<li>No open games. Create one!</li>';
    } else {
        games.forEach(game => {
            const li = document.createElement('li');
            li.textContent = `Game by ${game.player1_name}` + (game.is_private ? ' (Private)' : '');
            li.dataset.gameId = game.id;
            li.addEventListener('click', () => handleJoinGame(game.id));
            openGamesList.appendChild(li);
        });
    }
    // Fetch and display recent game results
    try {
        const resultsRes = await fetch('/api/games/results', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const results = await resultsRes.json();
        gameResultsList.innerHTML = '';
        if (results.length === 0) {
            gameResultsList.innerHTML = '<li>No recent results.</li>';
        } else {
            results.forEach(result => {
                const li = document.createElement('li');
                li.textContent = `${result.winner_name} beat ${result.loser_name} (${new Date(result.created_at).toLocaleString()})`;
                gameResultsList.appendChild(li);
            });
        }
    } catch (e) {
        gameResultsList.innerHTML = '<li>Could not load results.</li>';
    }
    showScreen(lobbyContainer);
}

async function showGame() {
    if (!gameSceneClass) {
        const canvas = document.getElementById('game-canvas');
        gameSceneClass = new GameScene(canvas, handlePitClick);
        await gameSceneClass.init();
    }
    showScreen(gameContainer);
}

// --- Event Handlers & Logic ---
async function handleLogin(event) {
    event.preventDefault();
    loginErrorP.textContent = '';
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
        loginErrorP.textContent = 'Login failed. Please check your credentials.';
        return;
    }

    const data = await res.json();
    token = data.token;
    myProfileId = parseJwt(token).baoProfileId;
    localStorage.setItem('bao_token', token);
    
    connectToServer(token, onGameStateUpdate);
    showLobby();
}

async function handleCreateGame(isPrivate = false) {
    let inviteeEmail = null;
    if (isPrivate) {
        inviteeEmail = inviteeEmailInput.value.trim();
        if (!inviteeEmail) {
            alert('Please enter an email to invite for a private game.');
            return;
        }
    }
    const res = await fetch('/api/games', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isPrivate, inviteeEmail })
    });
    const game = await res.json();
    currentGameId = game.id;
    joinGame(currentGameId);
    await showGame();
}

async function handleJoinGame(gameId) {
    const res = await fetch(`/api/games/${gameId}/join`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!res.ok) {
        alert('Failed to join game. It may already be full.');
        showLobby();
        return;
    }

    currentGameId = gameId;
    joinGame(currentGameId);
    await showGame();
}

function handlePitClick(pitIndex) {
    console.log(`Sending move for pit ${pitIndex} in game ${currentGameId}`);
    sendMove(currentGameId, { pitIndex });
}


/**
 * UPDATED: Handles incoming data from the server.
 * If it has an animation sequence, it plays the animation.
 * Otherwise, it just renders the state directly (e.g., on first join).
 */
function onGameStateUpdate(updateData) {
    console.log('Game update received in main.js:', updateData);
    if (gameSceneClass) {
        // If it's an object with a move sequence, it's an animated move
        if (updateData.moveSequence && updateData.finalState) {
            gameSceneClass.playMoveAnimation(updateData.moveSequence, updateData.finalState, myProfileId);
        } else {
            // Otherwise, it's just a state refresh (e.g., on joining)
            gameSceneClass.renderGameState(updateData, myProfileId);
        }
    }
}


// --- Initialization ---
async function checkForExistingSession() {
    const savedToken = localStorage.getItem('bao_token');
    if (!savedToken) {
        showScreen(loginContainer);
        return;
    }

    token = savedToken;
    myProfileId = parseJwt(token).baoProfileId;

    connectToServer(token, onGameStateUpdate);

    try {
        const res = await fetch('/api/games/active', { // This endpoint is not in the provided files but we assume it works
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (res.ok) {
            const game = await res.json();
            currentGameId = game.id;
            joinGame(currentGameId);
            await showGame();
        } else if (res.status === 404) {
            showLobby();
        } else {
            throw new Error('Invalid session');
        }
    } catch (error) {
        console.error('Session resume failed:', error);
        localStorage.removeItem('bao_token');
        token = null;
        myProfileId = null;
        showScreen(loginContainer);
    }
}



// Toggle between login and register forms
let showingLogin = true;
toggleAuthBtn.addEventListener('click', () => {
    showingLogin = !showingLogin;
    if (showingLogin) {
        loginForm.style.display = 'flex';
        registerForm.style.display = 'none';
        loginTitle.textContent = 'Login to Play Bao';
        toggleAuthBtn.textContent = 'Create an account';
    } else {
        loginForm.style.display = 'none';
        registerForm.style.display = 'flex';
        loginTitle.textContent = 'Register for Bao';
        toggleAuthBtn.textContent = 'Back to Login';
    }
    loginErrorP.textContent = '';
    registerErrorP.textContent = '';
});

loginForm.addEventListener('submit', handleLogin);
registerForm.addEventListener('submit', handleRegister);
createGameBtn.addEventListener('click', () => handleCreateGame(false));
createPrivateGameBtn.addEventListener('click', () => handleCreateGame(true));
createPrivateGameBtn.addEventListener('mouseenter', () => { inviteeEmailInput.style.display = 'block'; });
createPrivateGameBtn.addEventListener('mouseleave', () => { if (!inviteeEmailInput.value) inviteeEmailInput.style.display = 'none'; });
checkForExistingSession();

async function handleRegister(event) {
    event.preventDefault();
    registerErrorP.textContent = '';
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-password').value;
    const displayName = document.getElementById('reg-displayName').value;
    const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, displayName })
    });
    if (!res.ok) {
        const data = await res.json();
        registerErrorP.textContent = data.message || 'Registration failed.';
        return;
    }
    const data = await res.json();
    token = data.token;
    myProfileId = parseJwt(token).baoProfileId;
    localStorage.setItem('bao_token', token);
    connectToServer(token, onGameStateUpdate);
    showLobby();
}


// --- Helper ---
function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}
