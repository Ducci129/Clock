// server.js

const express = require('express');
const http = require('http');
const path = require('path');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3001

const TIMER_DATA_FILE = 'timerData.json';
const TIMER_UPDATE_INTERVAL = 1000;

// Validate timer update interval
if (!Number.isInteger(TIMER_UPDATE_INTERVAL) || TIMER_UPDATE_INTERVAL <= 0) {
  console.error('Invalid timer update interval. Using default value.');
}

let timerValueInSeconds = loadTimerValueFromFile() || 0;
let cursors = {}; // Keep track of cursors

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
}, TIMER_UPDATE_INTERVAL);

// Socket.io connection event
io.on('connection', (socket) => {
  console.log('A user connected');

  // Clear all cursors and send the current timer value to the newly connected client
  cursors = {};
  socket.emit('timerUpdate', timerValueInSeconds);

  Object.entries(cursors).forEach(([socketId, position]) => {
    socket.emit('cursorPosition', { socketId, position });
  });

  // Listen for cursor position updates from clients
  socket.on('cursorPosition', (position) => {
    if (isValidCursorPosition(position)) {
      io.emit('cursorPosition', { socketId: socket.id, position });
      cursors[socket.id] = position;
    } else {
      console.error(`Invalid cursor position received from socket ${socket.id}:`, position);
    }
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected');
    delete cursors[socket.id];
    io.emit('cursorDisconnect', socket.id);
  });
});

// Start the server
server.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

// Function to validate cursor position
function isValidCursorPosition(position) {
  return (
    position &&
    typeof position === 'object' &&
    typeof position.x === 'number' &&
    typeof position.y === 'number'
  );
}

// Function to validate and sanitize file name
function sanitizeFileName(fileName) {
  const fileParts = fileName.split('.');
  const baseName = fileParts[0];
  const extension = fileParts.length > 1 ? `.${fileParts.slice(1).join('.')}` : '';

  // Ensure the base name is safe and adheres to any naming conventions
  const sanitizedBaseName = baseName.replace(/[^a-zA-Z0-9_]/g, '_');

  return `${sanitizedBaseName}${extension}`;
}

// Function to save the timer value to a file
function saveTimerValueToFile(value) {
  const data = JSON.stringify({ timerValue: value });
  const sanitizedFileName = sanitizeFileName(TIMER_DATA_FILE);
  fs.writeFileSync(sanitizedFileName, data);
}

// Function to load the timer value from a file
function loadTimerValueFromFile() {
  try {
    const sanitizedFileName = sanitizeFileName(TIMER_DATA_FILE);
    const data = fs.readFileSync(sanitizedFileName, 'utf8');
    const parsedData = JSON.parse(data);
    return isValidTimerValue(parsedData.timerValue) ? parsedData.timerValue : null;
  } catch (error) {
    console.error(`Error loading timer value from file '${TIMER_DATA_FILE}':`, error);
    return null;
  }
}

// Function to validate timer value
function isValidTimerValue(value) {
  return typeof value === 'number';
}
