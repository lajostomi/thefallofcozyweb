const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

// 1. Allow the server to access external files (CSS, Images)
app.use(express.static(__dirname));

// 2. Serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

// --- STATE TRACKING ---
let players = { 1: null, 2: null };
let lobbyReady = { 1: false, 2: false };
let storyFinished = { 1: false, 2: false };
let currentPassword = "WAITING"; 
let loginAttempts = 3; 

// --- HELPER: GENERATE RANDOM PASSWORD ---
function generatePassword() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- A. ROLE ASSIGNMENT ---
  let assignedRole = 0;
  if (players[1] === null) {
      assignedRole = 1;
      players[1] = socket.id;
  } else if (players[2] === null) {
      assignedRole = 2;
      players[2] = socket.id;
  }
  
  socket.emit('assign_role', assignedRole);

  // --- B. LOBBY PHASE ---
  socket.on('player_ready', (role) => {
      if(role === 0) return;
      lobbyReady[role] = true;

      if (lobbyReady[1] && lobbyReady[2]) {
          // Reset Game State
          currentPassword = generatePassword();
          loginAttempts = 3;
          
          console.log("Game Started. Password:", currentPassword);
          
          io.emit('start_story');
          // Send password only to P1
          io.to(players[1]).emit('set_game_password', currentPassword);
      }
  });

  // --- C. STORY PHASE ---
  socket.on('story_finished', (role) => {
      if(role === 0) return;
      storyFinished[role] = true;
      socket.emit('wait_for_partner');

      if (storyFinished[1] && storyFinished[2]) {
          io.emit('start_task_phase');
          storyFinished = { 1: false, 2: false };
          lobbyReady = { 1: false, 2: false };
      }
  });

  // --- D. CHAT PHASE ---
  socket.on('chat_message', (data) => {
      io.emit('chat_message', data);
  });

  // --- E. LOGIN ATTEMPT ---
  socket.on('attempt_login', (data) => {
      const u = data.username.trim().toUpperCase();
      const p = data.password.trim().toUpperCase();

      if (u === 'JOHNDOE123' && p === currentPassword) {
          console.log("Password Correct.");
          socket.emit('login_success');
      } else {
          loginAttempts--;
          console.log(`Login Failed. Attempts left: ${loginAttempts}`);
          
          if (loginAttempts <= 0) {
              io.emit('game_over', { reason: 'Too many failed attempts. System Locked.' });
          } else {
              socket.emit('login_error', { attemptsLeft: loginAttempts });
          }
      }
  });

  // --- F. RED BUTTON (WIN) ---
  socket.on('trigger_shutdown', () => {
      io.emit('game_won');
  });

  // --- G. LOSE CONDITIONS ---
  socket.on('surrender', (role) => {
      io.emit('game_over', { reason: `Player ${role} surrendered.` }); 
  });

  socket.on('time_expired', () => {
      io.emit('game_over', { reason: 'Time ran out.' });
  });

  // --- H. DISCONNECT ---
  socket.on('disconnect', () => {
    if (players[1] === socket.id) players[1] = null;
    if (players[2] === socket.id) players[2] = null;
    lobbyReady = { 1: false, 2: false };
    storyFinished = { 1: false, 2: false };
  });
});

// --- START SERVER (CLOUD READY) ---
// Uses the port assigned by the cloud provider, or 3000 if running locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});