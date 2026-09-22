/**
 * server.js
 * Express & Socket.io Server Bootstrap
 * Assignment 13: Real-Time Group Chat & Messaging Engine
 */

require('dotenv').config();
const http = require('http');
const path = require('path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const { registerUserHandlers } = require('./sockets/userHandler');
const { registerChatHandlers } = require('./sockets/chatHandler');
const {
  connectedUsers,
  getAllRooms,
  getRoomStats
} = require('./utils/messageStore');

const app = express();
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

// Middlewares
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint (used by Render & monitoring)
app.get('/health', (req, res) => {
  const rooms = getAllRooms();
  res.status(200).json({
    status: 'ok',
    uptime: Math.floor(process.uptime()),
    connectedUsers: connectedUsers.size,
    rooms: rooms.length,
    activeRooms: rooms
  });
});

// Room inspection stats endpoint
app.get('/api/rooms/:room/stats', (req, res) => {
  const room = (req.params.room || '').toLowerCase().trim().replace(/^#+/, '');
  const stats = getRoomStats(room);
  res.status(200).json(stats);
});

// Fallback to index.html for SPA-style client routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Create raw HTTP server
const httpServer = http.createServer(app);

// Attach Socket.io to raw HTTP server
const io = new Server(httpServer, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST']
  },
  pingTimeout: 20000,
  pingInterval: 10000
});

// Socket connection lifecycle
io.on('connection', (socket) => {
  // Register modular handlers
  registerUserHandlers(io, socket);
  registerChatHandlers(io, socket);
});

// Start listening on 0.0.0.0
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 Chat & Messaging Server running on port ${PORT}`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`⚡ Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`====================================================`);
});
