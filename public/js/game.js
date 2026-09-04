const app = document.getElementById('app');
app.innerHTML = [
  '<header class="topbar"><a class="brand" href="/"><span class="brand-mark">✦</span><span>TERRITORY <b>WARS</b></span></a><div id="connection-status" class="connection"><span class="status-dot"></span> CONNECTING</div></header>',
  '<main>',
    '<section id="main-menu" class="screen menu-screen"><div class="hero-copy"><p class="eyebrow">REAL-TIME CONQUEST / SEASON 01</p><h1>Claim ground.<br><em>Hold the line.</em></h1><p class="lede">Build your territory from a single cell, outmaneuver rival commanders, and own the map before it owns you.</p></div><div class="menu-grid"><form id="create-form" class="panel create-panel"><div class="panel-kicker">01 / DEPLOY</div><h2>Start a new battle</h2><label>YOUR CALLSIGN<input id="username" maxlength="24" value="Commander" autocomplete="nickname" required></label><label>YOUR FLAG<input id="flag" maxlength="4" value="🇸🇻"></label><label>BATTLE NAME<input id="lobby-name" maxlength="32" value="Frontier One"></label><button class="button primary" type="submit">CREATE BATTLE <span>↗</span></button></form><div class="panel lobby-panel"><div class="panel-kicker">02 / JOIN</div><div class="panel-heading"><h2>Open battles</h2><span id="lobby-count" class="count">0 ACTIVE</span></div><div id="lobbies-list" class="lobbies-list"><div class="empty-state">Scanning the frontier<span class="loading-dots">...</span></div></div><div class="tip"><span>⌁</span> Battles reset when the last commander leaves.</div></div></div><div class="rules-row"><span><b>01</b> Expand from your border</span><span><b>02</b> Watch the score</span><span><b>03</b> First to 45% wins</span></div></section>',
    '<section id="lobby-screen" class="screen lobby-screen hidden"><div class="lobby-header"><div><p class="eyebrow">BATTLE ROOM</p><h1 id="lobby-title">Frontier One</h1></div><button id="leave-lobby" class="button ghost">← LEAVE</button></div><div class="lobby-layout"><div class="panel lobby-waiting-panel"><div class="panel-kicker">COMMANDERS <span id="commander-count">1 / 8</span></div><div id="commander-list" class="commander-list"></div><div class="waiting-note"><span class="pulse"></span><span id="waiting-text">Waiting for the host to deploy the battle.</span></div><button id="start-game" class="button primary full hidden">DEPLOY BATTLE <span>↗</span></button></div><div class="panel briefing-panel"><div class="panel-kicker">FIELD BRIEFING</div><h2>One map.<br>No safe edges.</h2><p>Every commander begins with one cell. Expand only from your border, block opponents, and race to control 45% of the frontier.</p><div class="briefing-stat"><strong>30 × 18</strong><span>MAP CELLS</span></div><div class="briefing-stat"><strong>8</strong><span>COMMANDERS MAX</span></div></div></div></section>',
    '<section id="game-screen" class="screen game-screen hidden"><div class="game-header"><div><p class="eyebrow">LIVE FRONTIER / <span id="game-lobby-name">FRONTIER ONE</span></p><h1>Conquest in progress</h1></div><div class="game-actions"><span id="game-score" class="score-badge">0 CELLS</span><button id="game-leave" class="button ghost">← EXIT</button></div></div><div class="game-layout"><div class="map-panel panel"><div class="map-wrap"><canvas id="game-canvas" width="960" height="576" aria-label="Territory map"></canvas><div id="map-toast" class="map-toast hidden"></div></div><div class="map-footer"><span><i class="legend-swatch own"></i> YOUR TERRITORY</span><span><i class="legend-swatch rival"></i> RIVAL TERRITORY</span><span class="map-hint">CLICK AN OPEN CELL NEXT TO YOUR BORDER TO EXPAND</span></div></div><aside class="side-column"><div class="panel leaderboard"><div class="panel-heading"><h2>Commanders</h2><span class="live-label"><i></i> LIVE</span></div><div id="players-list"></div></div><div class="panel chat-panel"><div class="panel-heading"><h2>Comms</h2><span class="count">ROOM</span></div><div id="chat-messages" class="chat-messages"><div class="chat-system">Secure channel established.</div></div><form id="chat-form" class="chat-form"><input id="chat-input" maxlength="180" placeholder="Send a message..." autocomplete="off"><button aria-label="Send message" type="submit">↗</button></form></div></aside></div></section>',
  '</main><div id="alert" class="alert hidden" role="status"></div>'
].join('');
const socket = io({ transports: ['websocket', 'polling'] });

const state = {
  username: 'Commander', flag: '🇸🇻', lobbyId: null, isHost: false, active: false,
  world: { cols: 30, rows: 18 }, players: new Map(), playerId: null
};

const $ = (id) => document.getElementById(id);
const screens = { menu: $('main-menu'), lobby: $('lobby-screen'), game: $('game-screen') };
const canvas = $('game-canvas');
const ctx = canvas.getContext('2d');

function showScreen(name) {
  Object.values(screens).forEach((screen) => screen.classList.add('hidden'));
  screens[name].classList.remove('hidden');
}

function showAlert(message) {
  const alert = $('alert');
  alert.textContent = message;
  alert.classList.remove('hidden');
  clearTimeout(showAlert.timer);
  showAlert.timer = setTimeout(() => alert.classList.add('hidden'), 3500);
}

function setConnection(ready, label) {
  const el = $('connection-status');
  el.classList.toggle('ready', ready);
  el.lastChild.textContent = ' ' + label;
}

function applyState(payload) {
  if (!payload) return;
  state.lobbyId = payload.id;
  state.isHost = payload.hostId === state.playerId;
  state.world = payload.world || state.world;
  state.players = new Map((payload.players || []).map((player) => [player.id, { ...player, territory: new Set(player.territory || []) }]));
  renderCommanders(payload);
  renderPlayers();
  renderMap();
  const me = state.players.get(state.playerId);
  $('game-score').textContent = (me ? me.score : 0) + ' CELLS';
}

function renderLobbies(lobbies) {
  const list = $('lobbies-list');
  $('lobby-count').textContent = lobbies.length + ' ACTIVE';
  if (!lobbies.length) {
    list.innerHTML = '<div class="empty-state">No active battles yet.<br />Create one and sound the horn.</div>';
    return;
  }
  list.textContent = '';
  lobbies.forEach((lobby) => {
    const row = document.createElement('div'); row.className = 'lobby-entry';
    const info = document.createElement('div');
    const title = document.createElement('h3'); title.textContent = lobby.name;
    const meta = document.createElement('div'); meta.className = 'lobby-meta'; meta.textContent = lobby.playerCount + ' / ' + lobby.maxPlayers + ' COMMANDERS · ' + lobby.status.toUpperCase();
    info.append(title, meta);
    const button = document.createElement('button'); button.className = 'button join-button'; button.textContent = 'JOIN ↗'; button.disabled = lobby.status !== 'waiting' || lobby.playerCount >= lobby.maxPlayers;
    button.addEventListener('click', () => joinLobby(lobby.id));
    row.append(info, button); list.append(row);
  });
}

function joinLobby(lobbyId) {
  state.username = $('username').value.trim() || 'Commander';
  state.flag = $('flag').value.trim() || '🇸🇻';
  socket.emit('join-lobby', { lobbyId, username: state.username, flag: state.flag });
}

function renderCommanders(payload) {
  $('lobby-title').textContent = payload.name;
  $('commander-count').textContent = (payload.players || []).length + ' / 8';
  const list = $('commander-list'); list.textContent = '';
  (payload.players || []).forEach((player) => {
    const row = document.createElement('div'); row.className = 'commander';
    const avatar = document.createElement('div'); avatar.className = 'commander-avatar'; avatar.textContent = player.flag;
    const text = document.createElement('div'); const name = document.createElement('strong'); name.textContent = player.username; const role = document.createElement('small'); role.textContent = player.id === payload.hostId ? 'BATTLE HOST' : 'READY'; text.append(name, role);
    row.append(avatar, text);
    if (player.id === payload.hostId) { const host = document.createElement('span'); host.className = 'host-label'; host.textContent = 'HOST'; row.append(host); }
    list.append(row);
  });
  $('start-game').classList.toggle('hidden', !state.isHost || payload.status !== 'waiting');
  $('waiting-text').textContent = state.isHost ? 'You are the host. Deploy when your squad is ready.' : 'Waiting for the host to deploy the battle.';
}

function renderPlayers() {
  const list = $('players-list'); list.textContent = '';
  Array.from(state.players.values()).sort((a, b) => b.score - a.score).forEach((player) => {
    const row = document.createElement('div'); row.className = 'player-row';
    const color = document.createElement('i'); color.className = 'player-color'; color.style.background = player.color;
    const name = document.createElement('span'); name.className = 'player-name'; name.textContent = (player.flag || '') + ' ' + player.username + (player.id === state.playerId ? '  YOU' : '');
    const score = document.createElement('span'); score.className = 'player-score'; score.textContent = player.score + ' CELLS';
    row.append(color, name, score); list.append(row);
  });
}

function renderMap() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0b1230'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cellW = canvas.width / state.world.cols; const cellH = canvas.height / state.world.rows;
  state.players.forEach((player) => {
    player.territory.forEach((key) => {
      const parts = key.split(':'); const x = Number(parts[0]); const y = Number(parts[1]);
      ctx.fillStyle = player.color; ctx.globalAlpha = player.id === state.playerId ? .9 : .72;
      ctx.fillRect(x * cellW + 1, y * cellH + 1, cellW - 2, cellH - 2);
      if (player.id === state.playerId) { ctx.strokeStyle = '#d8fff7'; ctx.globalAlpha = .35; ctx.strokeRect(x * cellW + 2, y * cellH + 2, cellW - 4, cellH - 4); }
    });
  });
  ctx.globalAlpha = 1; ctx.strokeStyle = 'rgba(157, 169, 214, .14)'; ctx.lineWidth = 1;
  for (let x = 0; x <= state.world.cols; x++) { ctx.beginPath(); ctx.moveTo(x * cellW, 0); ctx.lineTo(x * cellW, canvas.height); ctx.stroke(); }
  for (let y = 0; y <= state.world.rows; y++) { ctx.beginPath(); ctx.moveTo(0, y * cellH); ctx.lineTo(canvas.width, y * cellH); ctx.stroke(); }
}

function addChat(data) {
  const messages = $('chat-messages'); const row = document.createElement('div'); row.className = 'chat-message';
  const strong = document.createElement('strong'); strong.textContent = (data.flag || '') + ' ' + data.username + ': ';
  row.append(strong, document.createTextNode(data.message)); messages.append(row); messages.scrollTop = messages.scrollHeight;
}

$('create-form').addEventListener('submit', (event) => {
  event.preventDefault(); state.username = $('username').value.trim() || 'Commander'; state.flag = $('flag').value.trim() || '🇸🇻';
  socket.emit('create-lobby', { name: $('lobby-name').value.trim() || 'Frontier One', username: state.username, flag: state.flag });
});
$('start-game').addEventListener('click', () => socket.emit('start-game'));
$('leave-lobby').addEventListener('click', () => { socket.emit('leave-lobby'); state.active = false; showScreen('menu'); });
$('game-leave').addEventListener('click', () => { socket.emit('leave-lobby'); state.active = false; showScreen('menu'); });
$('chat-form').addEventListener('submit', (event) => { event.preventDefault(); const message = $('chat-input').value.trim(); if (message) { socket.emit('chat-message', { message }); $('chat-input').value = ''; } });

canvas.addEventListener('click', (event) => {
  if (!state.active) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor(((event.clientX - rect.left) / rect.width) * state.world.cols);
  const y = Math.floor(((event.clientY - rect.top) / rect.height) * state.world.rows);
  socket.emit('expand-territory', { x, y });
});

socket.on('connect', () => { state.playerId = socket.id; setConnection(true, 'CONNECTED'); });
socket.on('disconnect', () => setConnection(false, 'DISCONNECTED'));
socket.on('connect_error', () => setConnection(false, 'CONNECTION ERROR'));
socket.on('lobbies-list', renderLobbies);
socket.on('lobby-state', (payload) => { applyState(payload); if (!state.active) showScreen('lobby'); });
socket.on('game-starting', (payload) => { state.active = true; applyState(payload); $('game-lobby-name').textContent = payload.name.toUpperCase(); showScreen('game'); });
socket.on('game-state', applyState);
socket.on('territory-expanded', (data) => { const player = state.players.get(data.playerId); if (!player) return; player.territory.add(data.x + ':' + data.y); player.score = data.score; renderPlayers(); renderMap(); const me = state.players.get(state.playerId); $('game-score').textContent = (me ? me.score : 0) + ' CELLS'; });
socket.on('player-joined', (data) => { addChat({ username: 'SYSTEM', flag: '✦', message: data.username + ' joined the battle.' }); });
socket.on('chat-message', addChat);
socket.on('game-over', (data) => { const toast = $('map-toast'); toast.textContent = data.winner + ' controls the frontier.'; toast.classList.remove('hidden'); state.active = false; });
socket.on('app-error', showAlert);

setConnection(false, 'CONNECTING');
