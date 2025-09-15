import GameScene from './GameScene.js'; // <-- Import the new class
import { interactivePits } from './gameObjects.js';
import { connectToServer, joinGame, sendMove } from './socket-client.js';

// --- State Management ---
let token = null;
let currentGameId = null;
let myProfileId = null;
let gameSceneClass = null; // <-- This will hold our single scene instance

// --- DOM Elements ---
const loginContainer = document.getElementById('login-container');
const lobbyContainer = document.getElementById('lobby-container');
const gameContainer = document.getElementById('game-container');
const loginForm = document.getElementById('login-form');
const createGameBtn = document.getElementById('create-game-btn');
const openGamesList = document.getElementById('open-games-list');
const playerNameSpan = document.getElementById('player-name');
const loginErrorP = document.getElementById('login-error');

// --- UI Flow Functions ---
function showScreen(screen) {
    loginContainer.style.display = 'none';
    lobbyContainer.style.display = 'none';
    gameContainer.style.display = 'none';
    screen.style.display = 'flex';
}

async function showLobby() {
    playerNameSpan.textContent = parseJwt(token).displayName;
    
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
            li.textContent = `Game by ${game.player1_name}`;
            li.dataset.gameId = game.id;
            li.addEventListener('click', () => handleJoinGame(game.id));
            openGamesList.appendChild(li);
        });
    }
    
    showScreen(lobbyContainer);
}

async function showGame() {
    // --- Initialize the scene ONLY if it hasn't been already ---
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

async function handleCreateGame() {
    const res = await fetch('/api/games', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
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

function onGameStateUpdate(gameState) {
    // --- Always call the render method on our single gameScene instance ---
    console.log('Game state update received in main.js:', gameState,gameSceneClass);
    if (gameSceneClass) {
        gameSceneClass.renderGameState(gameState, interactivePits, myProfileId);
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
        const res = await fetch('/api/games/active', {
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


loginForm.addEventListener('submit', handleLogin);
createGameBtn.addEventListener('click', handleCreateGame);
checkForExistingSession();


// --- Helper ---
function parseJwt(token) {
    try {
        return JSON.parse(atob(token.split('.')[1]));
    } catch (e) {
        return null;
    }
}