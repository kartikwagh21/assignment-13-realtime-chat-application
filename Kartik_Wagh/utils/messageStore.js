/**
 * utils/messageStore.js
 * In-memory Chat State Management for Real-Time Group Chat & Messaging Engine
 */

// In-Memory Chat State
const connectedUsers = new Map(); // socketId -> { username, avatar, currentRoom }

const roomHistories = {
  "general": [],
  "developers": [],
  "random": []
};

const roomRosters = {
  "general": new Set(),
  "developers": new Set(),
  "random": new Set()
};

const MAX_HISTORY = 50;

/**
 * Escapes HTML characters to prevent XSS attacks
 * @param {string} text 
 * @returns {string}
 */
function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Formats current server time as HH:MM
 * @returns {string}
 */
function getFormattedTimestamp() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Appends a message object to a room's history, maintaining MAX_HISTORY cap
 * @param {string} room 
 * @param {object} messageObj 
 */
function addMessageToHistory(room, messageObj) {
  if (!roomHistories[room]) {
    roomHistories[room] = [];
  }
  roomHistories[room].push(messageObj);
  if (roomHistories[room].length > MAX_HISTORY) {
    roomHistories[room].shift();
  }
}

/**
 * Retrieves the message history for a given room
 * @param {string} room 
 * @returns {Array}
 */
function getHistory(room) {
  return roomHistories[room] ? [...roomHistories[room]] : [];
}

/**
 * Retrieves or initializes the socket ID roster Set for a room
 * @param {string} room 
 * @returns {Set<string>}
 */
function getOrCreateRoomRoster(room) {
  if (!roomRosters[room]) {
    roomRosters[room] = new Set();
  }
  if (!roomHistories[room]) {
    roomHistories[room] = [];
  }
  return roomRosters[room];
}

/**
 * Adds a socket to a room's roster
 * @param {string} room 
 * @param {string} socketId 
 */
function addUserToRoom(room, socketId) {
  const roster = getOrCreateRoomRoster(room);
  roster.add(socketId);
  const user = connectedUsers.get(socketId);
  if (user) {
    user.currentRoom = room;
  }
}

/**
 * Removes a socket from a room's roster
 * @param {string} room 
 * @param {string} socketId 
 */
function removeUserFromRoom(room, socketId) {
  if (room && roomRosters[room]) {
    roomRosters[room].delete(socketId);
  }
  const user = connectedUsers.get(socketId);
  if (user && user.currentRoom === room) {
    user.currentRoom = null;
  }
}

/**
 * Returns array of usernames currently in a room
 * @param {string} room 
 * @returns {string[]}
 */
function getRoomUsernames(room) {
  if (!roomRosters[room]) return [];
  const usernames = [];
  for (const socketId of roomRosters[room]) {
    const user = connectedUsers.get(socketId);
    if (user && user.username) {
      usernames.push(user.username);
    }
  }
  return usernames;
}

/**
 * Returns array of user objects { socketId, username, avatar } currently in a room
 * @param {string} room 
 * @returns {Array<{ socketId: string, username: string, avatar: string }>}
 */
function getRoomUsers(room) {
  if (!roomRosters[room]) return [];
  const users = [];
  for (const socketId of roomRosters[room]) {
    const user = connectedUsers.get(socketId);
    if (user && user.username) {
      users.push({
        socketId,
        username: user.username,
        avatar: user.avatar || 'avatar1.png'
      });
    }
  }
  return users;
}

/**
 * Gets list of all known rooms (pre-seeded + dynamically created)
 * @returns {string[]}
 */
function getAllRooms() {
  const set = new Set([...Object.keys(roomHistories), ...Object.keys(roomRosters)]);
  return Array.from(set);
}

/**
 * Returns stats for a given room
 * @param {string} room 
 * @returns {{ room: string, userCount: number, messageCount: number }}
 */
function getRoomStats(room) {
  const userCount = roomRosters[room] ? roomRosters[room].size : 0;
  const messageCount = roomHistories[room] ? roomHistories[room].length : 0;
  return { room, userCount, messageCount };
}

module.exports = {
  connectedUsers,
  roomHistories,
  roomRosters,
  MAX_HISTORY,
  escapeHtml,
  getFormattedTimestamp,
  addMessageToHistory,
  getHistory,
  getOrCreateRoomRoster,
  addUserToRoom,
  removeUserFromRoom,
  getRoomUsernames,
  getRoomUsers,
  getAllRooms,
  getRoomStats
};
