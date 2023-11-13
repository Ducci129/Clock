const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const fs = require('fs');
const uuid = require('uuid');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

let timerValueInSeconds = loadTimerValueFromFile() || 0;
let users = {}; // Keep track of users, their unique identifiers, and names

// Serve static files (like index.html) from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Define a route for the root URL
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Add a route to get the current timer value
app.get('/timer', (req, res) => {
  res.json({ timerValue: timerValueInSeconds });
});

// Start the timer - increase the value every second
setInterval(() => {
  timerValueInSeconds += 1;
  io.emit('timerUpdate', timerValueInSeconds); // Send timer updates to all connected clients
  saveTimerValueToFile(timerValueInSeconds);
}, 1000);

// Socket.io connection event
io.on('connection', (socket) => {
  console.log('A user connected');

  // Generate a unique identifier for the user (you can replace this with IP if needed)
  const userId = generateUserId();

  // Set a default name for the user
  let userName = `User${Object.keys(users).length + 1}`;

  // Send the current timer value, user name, and user id to the newly connected client
  socket.emit('timerUpdate', timerValueInSeconds);
  socket.emit('setUserData', { userId, userName });

  // Associate the user's unique identifier, name, and socket ID
  users[socket.id] = { userId, userName, ip: socket.handshake.address };

  // Listen for cursor position updates from clients
  socket.on('cursorPosition', (position) => {
    // Broadcast the cursor position to all connected clients
    io.emit('cursorPosition', { userId, position });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    // Remove the user from the users object
    delete users[socket.id];
    io.emit('cursorDisconnect', userId);
    io.emit('chatMessage', { userId: 'System', message: `${userName} has left the chat.` });
  });

  // Send existing cursors and user data to a newly connected client
  io.to(socket.id).emit('currentCursors', getUsersCursors());
  io.to(socket.id).emit('currentUsers', getUsersData());
});

// Send existing cursors to a newly connected client
function getUsersCursors() {
  const cursors = [];
  for (const [socketId, { userId, position }] of Object.entries(users)) {
    if (position) {
      cursors.push({ userId, position });
    }
  }
  return cursors;
}

// Send existing user data to a newly connected client
function getUsersData() {
  const userData = [];
  for (const { userId, userName, ip } of Object.values(users)) {
    userData.push({ userId, userName, ip });
  }
  return userData;
}

// Function to generate a unique user identifier (you can replace this with IP if needed)
function generateUserId() {
  return uuid.v4();
}

// Function to save the timer value to a file
function saveTimerValueToFile(value) {
  const data = JSON.stringify({ timerValue: value });
  fs.writeFileSync('timerData.json', data);
}

// Function to load the timer value from a file
function loadTimerValueFromFile() {
  try {
    const data = fs.readFileSync('timerData.json', 'utf8');
    const parsedData = JSON.parse(data);
    return parsedData.timerValue;
  } catch (error) {
    console.error('Error loading timer value from file:', error);
    return null;
  }
}

// Listen for chat messages
io.on('connection', (socket) => {
  socket.on('chatMessage', (message) => {
    io.emit('chatMessage', { userId: users[socket.id].userId, message });
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});