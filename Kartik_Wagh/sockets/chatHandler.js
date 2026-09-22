/**
 * sockets/chatHandler.js
 * Handles room messaging, direct messages, and debounced typing indicator events
 */

const {
  connectedUsers,
  escapeHtml,
  getFormattedTimestamp,
  addMessageToHistory
} = require('../utils/messageStore');

/**
 * Registers chat messaging, DM, and typing indicator socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerChatHandlers(io, socket) {
  // 1. chat:send - sends a message to a room
  socket.on('chat:send', (payload) => {
    try {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.username) {
        socket.emit('error:message', { message: 'You must be logged in to send messages.' });
        return;
      }

      if (!payload || typeof payload !== 'object') {
        socket.emit('error:message', { message: 'Invalid message payload.' });
        return;
      }

      const { room, message } = payload;
      if (!room || typeof room !== 'string') {
        socket.emit('error:message', { message: 'Target room is required.' });
        return;
      }

      const normalizedRoom = room.trim().toLowerCase().replace(/^#+/, '');
      if (user.currentRoom !== normalizedRoom) {
        socket.emit('error:message', { message: 'You must join this room before sending a message.' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return; // ignore empty messages
      }

      const trimmedMsg = message.trim();
      if (trimmedMsg.length > 2000) {
        socket.emit('error:message', { message: 'Message exceeds maximum length of 2000 characters.' });
        return;
      }

      const safeMessage = escapeHtml(trimmedMsg);
      const messageObj = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
        sender: user.username,
        avatar: user.avatar || 'avatar1.png',
        room: normalizedRoom,
        message: safeMessage,
        timestamp: getFormattedTimestamp()
      };

      // Store in memory (capped at 50)
      addMessageToHistory(normalizedRoom, messageObj);

      // Broadcast to all members in room (including sender for consistent ordering)
      io.to(normalizedRoom).emit('chat:receive', messageObj);
    } catch (err) {
      console.error(`Error in chat:send for ${socket.id}:`, err);
      socket.emit('error:message', { message: 'Failed to send message.' });
    }
  });

  // 2. typing:start - notifies room members that user is typing
  socket.on('typing:start', (payload) => {
    try {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.username) return;

      const room = (payload && typeof payload.room === 'string')
        ? payload.room.trim().toLowerCase().replace(/^#+/, '')
        : user.currentRoom;

      if (!room || user.currentRoom !== room) return;

      // Broadcast to everyone else in the room (never echo to sender)
      socket.to(room).emit('typing:update', {
        username: user.username,
        room: room,
        isTyping: true
      });
    } catch (err) {
      console.error(`Error in typing:start for ${socket.id}:`, err);
    }
  });

  // 3. typing:stop - notifies room members that user stopped typing
  socket.on('typing:stop', (payload) => {
    try {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.username) return;

      const room = (payload && typeof payload.room === 'string')
        ? payload.room.trim().toLowerCase().replace(/^#+/, '')
        : user.currentRoom;

      if (!room || user.currentRoom !== room) return;

      // Broadcast to everyone else in the room
      socket.to(room).emit('typing:update', {
        username: user.username,
        room: room,
        isTyping: false
      });
    } catch (err) {
      console.error(`Error in typing:stop for ${socket.id}:`, err);
    }
  });

  // 4. direct:send - sends private direct message to specific socket
  socket.on('direct:send', (payload) => {
    try {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.username) {
        socket.emit('error:message', { message: 'You must be logged in to send direct messages.' });
        return;
      }

      if (!payload || typeof payload !== 'object') {
        socket.emit('error:message', { message: 'Invalid direct message payload.' });
        return;
      }

      const { recipientId, message } = payload;
      if (!recipientId || typeof recipientId !== 'string') {
        socket.emit('error:message', { message: 'Recipient socket ID is required.' });
        return;
      }

      const recipient = connectedUsers.get(recipientId);
      if (!recipient) {
        socket.emit('error:message', { message: 'Recipient is no longer online.' });
        return;
      }

      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return;
      }

      const trimmedMsg = message.trim();
      if (trimmedMsg.length > 2000) {
        socket.emit('error:message', { message: 'Message exceeds maximum length of 2000 characters.' });
        return;
      }

      const safeMessage = escapeHtml(trimmedMsg);
      const timestamp = getFormattedTimestamp();

      const dmPayload = {
        id: `dm_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`,
        from: user.username,
        fromSocketId: socket.id,
        fromAvatar: user.avatar || 'avatar1.png',
        to: recipient.username,
        toSocketId: recipientId,
        message: safeMessage,
        timestamp
      };

      // Deliver only to the intended recipient socket
      io.to(recipientId).emit('direct:receive', dmPayload);

      // Optional confirmation back to sender
      socket.emit('direct:sent', dmPayload);
    } catch (err) {
      console.error(`Error in direct:send for ${socket.id}:`, err);
      socket.emit('error:message', { message: 'Failed to send direct message.' });
    }
  });
}

module.exports = { registerChatHandlers };
