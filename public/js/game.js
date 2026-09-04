// Game client - Connection Handler
const socket = io({
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5,
  transports: ['websocket', 'polling']
});

// Game state
const gameState = {
  playerId: null,
  username: '',
  flag: '🇺🇸',
  score: 0,
  territory: [],
  players: new Map(),
  canvas: null,
  ctx: null,
  gameActive: false,
  isConnected: false,
  camera: { x: 0, y: 0, zoom: 1 }
};

// Connection handlers
socket.on('connect', () => {
  console.log('✅ Connected to server');
  gameState.playerId = socket.id;
  gameState.isConnected = true;
  updateConnectionStatus('Connected ✅', 'green');
  socket.emit('get-lobbies');
});

socket.on('disconnect', (reason) => {
  console.log('❌ Disconnected:', reason);
  gameState.isConnected = false;
  updateConnectionStatus('Disconnected ❌', 'red');
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  updateConnectionStatus('Connection Error ⚠️', 'orange');
});

socket.on('error', (error) => {
  console.error('Socket error:', error);
});

// Update connection status in UI
function updateConnectionStatus(status, color) {
  let statusEl = document.getElementById('connection-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.id = 'connection-status';
    statusEl.style.cssText = `
      position: fixed;
      top: 10px;
      left: 10px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: bold;
      z-index: 9999;
      background-color: #1e293b;
      border: 1px solid;
    `;
    document.body.appendChild(statusEl);
  }
  
  statusEl.textContent = status;
  statusEl.style.borderColor = color;
  statusEl.style.color = color;
}

// Initialize canvas
function initCanvas() {
  gameState.canvas = document.getElementById('game-canvas');
  if (!gameState.canvas) return;
  
  gameState.ctx = gameState.canvas.getContext('2d');
  gameState.canvas.width = Math.min(1000, window.innerWidth - 40);
  gameState.canvas.height = 600;
  
  // Mouse events
  gameState.canvas.addEventListener('click', handleCanvasClick);
  gameState.canvas.addEventListener('mousemove', handleCanvasMouseMove);
  
  // Start game loop
  gameLoop();
}

// Game loop
function gameLoop() {
  if (gameState.gameActive) {
    clearCanvas();
    renderTerritories();
    renderPlayers();
    renderUI();
  }
  requestAnimationFrame(gameLoop);
}

// Clear canvas
function clearCanvas() {
  gameState.ctx.fillStyle = '#001a33';
  gameState.ctx.fillRect(0, 0, gameState.canvas.width, gameState.canvas.height);
  
  // Draw grid
  drawGrid();
}

// Draw grid
function drawGrid() {
  gameState.ctx.strokeStyle = '#1a3a52';
  gameState.ctx.lineWidth = 0.5;
  const gridSize = 50;
  
  for (let x = 0; x < gameState.canvas.width; x += gridSize) {
    gameState.ctx.beginPath();
    gameState.ctx.moveTo(x, 0);
    gameState.ctx.lineTo(x, gameState.canvas.height);
    gameState.ctx.stroke();
  }
  
  for (let y = 0; y < gameState.canvas.height; y += gridSize) {
    gameState.ctx.beginPath();
    gameState.ctx.moveTo(0, y);
    gameState.ctx.lineTo(gameState.canvas.width, y);
    gameState.ctx.stroke();
  }
}

// Render territories
function renderTerritories() {
  gameState.territory.forEach(territory => {
    gameState.ctx.fillStyle = 'rgba(168, 85, 247, 0.3)';
    gameState.ctx.fillRect(territory.x, territory.y, territory.size, territory.size);
    gameState.ctx.strokeStyle = '#a855f7';
    gameState.ctx.lineWidth = 2;
    gameState.ctx.strokeRect(territory.x, territory.y, territory.size, territory.size);
  });
  
  // Draw other players' territories
  gameState.players.forEach((player, playerId) => {
    if (playerId !== gameState.playerId && player.territory) {
      player.territory.forEach(territory => {
        gameState.ctx.fillStyle = player.color + '50';
        gameState.ctx.fillRect(territory.x, territory.y, territory.size, territory.size);
        gameState.ctx.strokeStyle = player.color;
        gameState.ctx.lineWidth = 1;
        gameState.ctx.strokeRect(territory.x, territory.y, territory.size, territory.size);
      });
    }
  });
}

// Render players
function renderPlayers() {
  gameState.ctx.fillStyle = '#fff';
  gameState.ctx.font = 'bold 12px Arial';
  gameState.ctx.textAlign = 'center';
  
  gameState.players.forEach((player, playerId) => {
    if (player.territory && player.territory.length > 0) {
      const lastTerritory = player.territory[player.territory.length - 1];
      const x = lastTerritory.x + lastTerritory.size / 2;
      const y = lastTerritory.y + lastTerritory.size / 2;
      
      // Draw player marker
      gameState.ctx.fillStyle = player.color || '#a855f7';
      gameState.ctx.beginPath();
      gameState.ctx.arc(x, y, 8, 0, Math.PI * 2);
      gameState.ctx.fill();
      
      // Draw flag and name
      gameState.ctx.fillStyle = '#fff';
      gameState.ctx.font = 'bold 10px Arial';
      gameState.ctx.fillText(player.flag + ' ' + player.username, x, y - 15);
    }
  });
}

// Render UI
function renderUI() {
  const playerInfo = document.getElementById('player-info');
  if (playerInfo) {
    playerInfo.innerHTML = `
      <span>${gameState.flag} ${gameState.username}</span> | 
      Score: <span style="color: #a855f7; font-weight: bold;">${gameState.score}</span> | 
      Territory: <span>${gameState.territory.length}</span>
    `;
  }
}

// Handle canvas click (expand territory)
function handleCanvasClick(e) {
  if (!gameState.gameActive) return;
  
  const rect = gameState.canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left);
  const y = (e.clientY - rect.top);
  const size = 40;
  
  // Check if clicking on own territory
  const clickingOwnTerritory = gameState.territory.some(t => 
    x >= t.x && x <= t.x + t.size &&
    y >= t.y && y <= t.y + t.size
  );
  
  if (clickingOwnTerritory || gameState.territory.length === 0) {
    if (gameState.isConnected) {
      socket.emit('expand-territory', { x, y, size });
    } else {
      alert('Not connected to server');
    }
  }
}

// Handle canvas mouse move
function handleCanvasMouseMove(e) {
  // Can be used for hover effects or targeting
}

// Socket events
socket.on('territory-expanded', (data) => {
  if (data.playerId === gameState.playerId) {
    gameState.territory.push({ x: data.x, y: data.y, size: data.size });
    gameState.score = data.playerScore;
  } else {
    const player = gameState.players.get(data.playerId);
    if (player) {
      player.territory.push({ x: data.x, y: data.y, size: data.size });
      player.score = data.playerScore;
    }
  }
});

socket.on('player-joined', (player) => {
  const colors = ['#a855f7', '#ec4899', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444'];
  const color = colors[gameState.players.size % colors.length];
  
  gameState.players.set(player.id, {
    ...player,
    color,
    territory: []
  });
  
  addChatMessage({
    username: 'System',
    message: `${player.flag} ${player.username} joined the game`,
    isSystem: true
  });
});

socket.on('player-left', (data) => {
  const player = gameState.players.get(data.playerId);
  if (player) {
    addChatMessage({
      username: 'System',
      message: `${player.flag} ${player.username} left the game`,
      isSystem: true
    });
  }
  gameState.players.delete(data.playerId);
});

socket.on('player-died', (data) => {
  addChatMessage({
    username: 'System',
    message: `💀 ${data.username} was eliminated by ${data.winner}`,
    isSystem: true
  });
});

socket.on('chat-message', (data) => {
  addChatMessage(data);
});

socket.on('game-starting', (data) => {
  gameState.gameActive = true;
  document.getElementById('main-menu').classList.add('hidden');
  document.getElementById('game-area').classList.remove('hidden');
  initCanvas();
});

socket.on('lobbies-list', (lobbies) => {
  updateLobbiesList(lobbies);
});

// Chat function
function addChatMessage(data) {
  const chatMessages = document.getElementById('chat-messages');
  const messageEl = document.createElement('div');
  messageEl.className = 'chat-message';
  messageEl.style.marginBottom = '0.25rem';
  messageEl.style.fontSize = '0.75rem';
  
  if (data.isSystem) {
    messageEl.innerHTML = `<span style="color: #10b981; font-style: italic;">${data.message}</span>`;
  } else {
    messageEl.innerHTML = `<span style="color: #d8b4fe;"><strong>${data.flag} ${data.username}:</strong> ${data.message}</span>`;
  }
  
  chatMessages.appendChild(messageEl);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Export for UI
window.gameState = gameState;
