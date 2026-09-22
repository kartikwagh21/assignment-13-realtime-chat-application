/**
 * sockets/userHandler.js
 * Handles user login, room join/leave, and disconnect cleanup
 */

const {
  connectedUsers,
  escapeHtml,
  addUserToRoom,
  removeUserFromRoom,
  getRoomUsers,
  getHistory
} = require('../utils/messageStore');

/**
 * Registers user identity and room management socket event handlers
 * @param {import('socket.io').Server} io
 * @param {import('socket.io').Socket} socket
 */
function registerUserHandlers(io, socket) {
  // 1. user:login - registers user identity and socket mapping
  socket.on('user:login', (payload) => {
    try {
      if (!payload || typeof payload !== 'object') {
        socket.emit('error:message', { message: 'Invalid login payload.' });
        return;
      }

      let { username, avatar } = payload;
      if (!username || typeof username !== 'string') {
        socket.emit('error:message', { message: 'Username is required.' });
        return;
      }

      const trimmedName = username.trim();
      if (trimmedName.length === 0 || trimmedName.length > 30) {
        socket.emit('error:message', { message: 'Username must be between 1 and 30 characters.' });
        return;
      }

      const safeUsername = escapeHtml(trimmedName);
      const safeAvatar = (avatar && typeof avatar === 'string') ? avatar.trim() : 'avatar1.png';

      // Update or insert into connectedUsers
      const existing = connectedUsers.get(socket.id);
      const currentRoom = existing ? existing.currentRoom : null;

      connectedUsers.set(socket.id, {
        username: safeUsername,
        avatar: safeAvatar,
        currentRoom
      });

      socket.emit('user:login:success', {
        socketId: socket.id,
        username: safeUsername,
        avatar: safeAvatar
      });
    } catch (err) {
      console.error(`Error in user:login for ${socket.id}:`, err);
      socket.emit('error:message', { message: 'An internal error occurred during login.' });
    }
  });

  // 2. room:join - joins a chat channel
  socket.on('room:join', (payload) => {
    try {
      const user = connectedUsers.get(socket.id);
      if (!user || !user.username) {
        socket.emit('error:message', { message: 'You must be logged in before joining a room.' });
        return;
      }

      if (!payload || !payload.room || typeof payload.room !== 'string') {
        socket.emit('error:message', { message: 'Invalid room name.' });
        return;
      }

      // Normalize room name: trim, lowercase, sanitize
      let room = payload.room.trim().toLowerCase().replace(/^#+/, '');
      room = room.replace(/[^a-z0-9_-]/g, '');

      if (!room || room.length > 40) {
        socket.emit('error:message', { message: 'Room name must be 1-40 alphanumeric characters.' });
        return;
      }

      const oldRoom = user.currentRoom;

      // If already in the target room, no-op or re-hydrate
      if (oldRoom === room) {
        socket.emit('room:history', {
          room,
          messages: getHistory(room)
        });
        io.to(room).emit('room:userlist', {
          room,
          users: getRoomUsers(room)
        });
        return;
      }

      // If socket is already in a different room, leave it first
      if (oldRoom) {
        socket.leave(oldRoom);
        removeUserFromRoom(oldRoom, socket.id);

        // Safety clear typing indicator in old room
        socket.to(oldRoom).emit('typing:update', {
          username: user.username,
          isTyping: false
        });

        // Broadcast updated userlist in old room
        io.to(oldRoom).emit('room:userlist', {
          room: oldRoom,
          users: getRoomUsers(oldRoom)
        });
      }

      // Join new room
      socket.join(room);
      addUserToRoom(room, socket.id);

      // 1. Emit message history buffer ONLY to the joining user
      socket.emit('room:history', {
        room,
        messages: getHistory(room)
      });

      // 2. Broadcast updated online-users roster to the entire room (including joiner)
      io.to(room).emit('room:userlist', {
        room,
        users: getRoomUsers(room)
      });
    } catch (err) {
      console.error(`Error in room:join for ${socket.id}:`, err);
      socket.emit('error:message', { message: 'An internal error occurred while joining the room.' });
    }
  });

  // 3. room:leave - leaves a chat channel
  socket.on('room:leave', (payload) => {
    try {
      const user = connectedUsers.get(socket.id);
      if (!user) return;

      const roomToLeave = (payload && typeof payload.room === 'string')
        ? payload.room.trim().toLowerCase().replace(/^#+/, '')
        : user.currentRoom;

      if (!roomToLeave || user.currentRoom !== roomToLeave) {
        return;
      }

      socket.leave(roomToLeave);
      removeUserFromRoom(roomToLeave, socket.id);

      // Safety clear typing in that room
      socket.to(roomToLeave).emit('typing:update', {
        username: user.username,
        isTyping: false
      });

      // Broadcast updated roster to the remaining room members
      io.to(roomToLeave).emit('room:userlist', {
        room: roomToLeave,
        users: getRoomUsers(roomToLeave)
      });
    } catch (err) {
      console.error(`Error in room:leave for ${socket.id}:`, err);
    }
  });

  // 4. disconnect - cleanup room presence and state
  socket.on('disconnect', () => {
    try {
      const user = connectedUsers.get(socket.id);
      if (user) {
        const { currentRoom, username } = user;
        if (currentRoom) {
          removeUserFromRoom(currentRoom, socket.id);

          // Clear any active typing indicator for this user
          socket.to(currentRoom).emit('typing:update', {
            username,
            isTyping: false
          });

          // Broadcast updated userlist to the room
          io.to(currentRoom).emit('room:userlist', {
            room: currentRoom,
            users: getRoomUsers(currentRoom)
          });
        }
        connectedUsers.delete(socket.id);
      }
    } catch (err) {
      console.error(`Error in disconnect for ${socket.id}:`, err);
    }
  });
}

module.exports = { registerUserHandlers };
