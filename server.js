const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const { Server } = require('socket.io');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: true } });
const PORT = process.env.PORT || 3000;
const WORLD = { cols: 30, rows: 18 };
const COLORS = ['#8b5cf6', '#06b6d4', '#f97316', '#ec4899', '#22c55e', '#eab308', '#ef4444', '#3b82f6'];
const lobbies = new Map();

const lt = String.fromCharCode(60);
const gt = String.fromCharCode(62);
app.get('/', (_req, res) => res.send(lt + 'html' + gt + lt + 'head' + gt + lt + 'meta charset="UTF-8"' + gt + lt + 'meta name="viewport" content="width=device-width,initial-scale=1"' + gt + lt + 'title' + gt + 'FrontsWars' + lt + '/title' + gt + lt + 'link rel="stylesheet" href="/css/styles.css"' + gt + lt + '/head' + gt + lt + 'body' + gt + lt + 'div id="app"' + gt + lt + '/div' + gt + lt + 'script src="/socket.io/socket.io.js"' + gt + lt + '/script' + gt + lt + 'script src="/js/game.js"' + gt + lt + '/script' + gt + lt + '/body' + gt + lt + '/html' + gt));
app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (_req, res) => res.json({ ok: true, lobbies: lobbies.size }));

function clean(value, fallback, max = 24) {
  const text = typeof value === 'string' ? value.trim().replace(/[<>]/g, '') : '';
  return (text || fallback).slice(0, max);
}

function newId() {
  return crypto.randomUUID().slice(0, 8);
}

function lobbySummary(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    status: lobby.status,
    hostId: lobby.hostId,
    playerCount: lobby.players.size,
    maxPlayers: lobby.maxPlayers
  };
}

function publicState(lobby) {
  return {
    id: lobby.id,
    name: lobby.name,
    status: lobby.status,
    hostId: lobby.hostId,
    world: WORLD,
    players: Array.from(lobby.players.values()).map((player) => ({
      id: player.id,
      username: player.username,
      flag: player.flag,
      color: player.color,
      score: player.score,
      territory: Array.from(player.territory)
    }))
  };
}

function broadcastLobbies() {
  io.emit('lobbies-list', Array.from(lobbies.values()).map(lobbySummary));
}

function broadcastState(lobby) {
  io.to(lobby.id).emit('lobby-state', publicState(lobby));
  if (lobby.status === 'playing') io.to(lobby.id).emit('game-state', publicState(lobby));
}

function leaveLobby(socket) {
  const lobbyId = socket.data.lobbyId;
  if (!lobbyId) return;
  const lobby = lobbies.get(lobbyId);
  socket.leave(lobbyId);
  socket.data.lobbyId = null;
  if (!lobby) return;
  lobby.players.delete(socket.id);
  if (lobby.players.size === 0) {
    lobbies.delete(lobbyId);
  } else {
    if (lobby.hostId === socket.id) lobby.hostId = lobby.players.keys().next().value;
    broadcastState(lobby);
  }
  broadcastLobbies();
}

function isInside(cellX, cellY) {
  return Number.isInteger(cellX) && Number.isInteger(cellY) && cellX >= 0 && cellY >= 0 && cellX < WORLD.cols && cellY < WORLD.rows;
}

function cellKey(x, y) {
  return x + ':' + y;
}

function hasAdjacent(territory, x, y) {
  return territory.has(cellKey(x - 1, y)) || territory.has(cellKey(x + 1, y)) || territory.has(cellKey(x, y - 1)) || territory.has(cellKey(x, y + 1));
}

io.on('connection', (socket) => {
  socket.emit('lobbies-list', Array.from(lobbies.values()).map(lobbySummary));

  socket.on('create-lobby', (payload = {}) => {
    leaveLobby(socket);
    const lobby = {
      id: newId(),
      name: clean(payload.name, 'Frontier One', 32),
      status: 'waiting',
      hostId: socket.id,
      maxPlayers: 8,
      players: new Map()
    };
    lobby.players.set(socket.id, {
      id: socket.id,
      username: clean(payload.username, 'Commander'),
      flag: clean(payload.flag, '🇺🇸', 8),
      color: COLORS[0],
      score: 0,
      territory: new Set()
    });
    lobbies.set(lobby.id, lobby);
    socket.data.lobbyId = lobby.id;
    socket.join(lobby.id);
    broadcastState(lobby);
    broadcastLobbies();
  });

  socket.on('join-lobby', (payload = {}) => {
    const lobby = lobbies.get(payload.lobbyId);
    if (!lobby) return socket.emit('app-error', 'That lobby no longer exists.');
    if (lobby.status !== 'waiting') return socket.emit('app-error', 'That battle has already started.');
    if (lobby.players.size >= lobby.maxPlayers) return socket.emit('app-error', 'That lobby is full.');
    leaveLobby(socket);
    const color = COLORS[lobby.players.size % COLORS.length];
    lobby.players.set(socket.id, {
      id: socket.id,
      username: clean(payload.username, 'Commander'),
      flag: clean(payload.flag, '🇺🇸', 8),
      color,
      score: 0,
      territory: new Set()
    });
    socket.data.lobbyId = lobby.id;
    socket.join(lobby.id);
    io.to(lobby.id).emit('player-joined', { username: lobby.players.get(socket.id).username });
    broadcastState(lobby);
    broadcastLobbies();
  });

  socket.on('start-game', () => {
    const lobby = lobbies.get(socket.data.lobbyId);
    if (!lobby || lobby.hostId !== socket.id || lobby.status !== 'waiting') return;
    lobby.status = 'playing';
    Array.from(lobby.players.values()).forEach((player, index) => {
      const x = 2 + ((index * 5) % (WORLD.cols - 4));
      const y = 2 + ((index * 7) % (WORLD.rows - 4));
      player.territory.add(cellKey(x, y));
      player.score = 1;
    });
    io.to(lobby.id).emit('game-starting', publicState(lobby));
    broadcastLobbies();
  });

  socket.on('expand-territory', (payload = {}) => {
    const lobby = lobbies.get(socket.data.lobbyId);
    const player = lobby && lobby.players.get(socket.id);
    if (!lobby || !player || lobby.status !== 'playing') return;
    const x = Number(payload.x);
    const y = Number(payload.y);
    if (!isInside(x, y)) return;
    const key = cellKey(x, y);
    const occupied = Array.from(lobby.players.values()).some((candidate) => candidate.territory.has(key));
    if (occupied || (!hasAdjacent(player.territory, x, y) && player.territory.size > 0)) return;
    player.territory.add(key);
    player.score = player.territory.size;
    io.to(lobby.id).emit('territory-expanded', { playerId: player.id, x, y, score: player.score });
    if (player.territory.size >= Math.floor(WORLD.cols * WORLD.rows * 0.45)) {
      lobby.status = 'finished';
      io.to(lobby.id).emit('game-over', { winner: player.username, color: player.color });
    }
  });

  socket.on('chat-message', (payload = {}) => {
    const lobby = lobbies.get(socket.data.lobbyId);
    const player = lobby && lobby.players.get(socket.id);
    if (!lobby || !player) return;
    const message = clean(payload.message, '', 180);
    if (!message) return;
    io.to(lobby.id).emit('chat-message', { username: player.username, flag: player.flag, message });
  });

  socket.on('leave-lobby', () => leaveLobby(socket));
  socket.on('disconnect', () => leaveLobby(socket));
});

httpServer.listen(PORT, '0.0.0.0', () => console.log('FrontsWars listening on port ' + PORT));
