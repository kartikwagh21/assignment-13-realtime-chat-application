/**
 * public/app.js
 * Client-Side Real-Time Chat & Direct Messaging Engine
 */

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Socket.io client (same-origin, auto-configured)
  const socket = typeof io !== 'undefined' ? io() : null;

  // Application State
  const state = {
    currentUser: {
      username: '',
      avatar: 'avatar1.png',
      socketId: null
    },
    activeRoom: 'general',
    knownRooms: new Set(['general', 'developers', 'random']),
    roomUsers: [], // Array<{ socketId, username, avatar }>
    activeTypers: new Set(),
    isTyping: false,
    typingTimeout: null,
    dmRecipient: null, // { socketId, username, avatar }
    dmThreads: new Map(), // socketId -> Array<{ id, from, message, timestamp, isSent }>
    totalUnreadDMs: 0
  };

  // Avatar emoji map
  const avatarEmojiMap = {
    'avatar1.png': '⚡',
    'avatar2.png': '🚀',
    'avatar3.png': '💎',
    'avatar4.png': '🔥',
    'avatar5.png': '🐱'
  };

  // DOM Elements
  const el = {
    // Screens & Layout
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username-input'),
    avatarSelector: document.getElementById('avatar-selector'),
    initialRoomSelect: document.getElementById('initial-room-select'),
    chatApp: document.getElementById('chat-app'),
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    toastContainer: document.getElementById('toast-container'),

    // Top Navigation
    navActiveRoomName: document.getElementById('nav-active-room-name'),
    navUserAvatar: document.getElementById('nav-user-avatar'),
    navUsername: document.getElementById('nav-username'),
    connectionStatus: document.getElementById('connection-status'),
    btnOpenDmList: document.getElementById('btn-open-dm-list'),
    unreadDmBadge: document.getElementById('unread-dm-badge'),

    // Sidebar
    channelList: document.getElementById('channel-list'),
    channelCount: document.getElementById('channel-count'),
    createRoomForm: document.getElementById('create-room-form'),
    newRoomInput: document.getElementById('new-room-input'),
    rosterRoomLabel: document.getElementById('roster-room-label'),
    rosterCount: document.getElementById('roster-count'),
    rosterList: document.getElementById('roster-list'),

    // Chat Viewport
    roomHeaderTitle: document.getElementById('room-header-title'),
    roomHeaderDesc: document.getElementById('room-header-desc'),
    headerUserCount: document.getElementById('header-user-count'),
    messagesContainer: document.getElementById('messages-container'),
    typingIndicatorBox: document.getElementById('typing-indicator-box'),
    typingText: document.getElementById('typing-text'),
    chatForm: document.getElementById('chat-form'),
    messageInput: document.getElementById('message-input'),

    // DM Modal
    dmModal: document.getElementById('dm-modal'),
    dmRecipientAvatar: document.getElementById('dm-recipient-avatar'),
    dmRecipientName: document.getElementById('dm-recipient-name'),
    dmRecipientSocket: document.getElementById('dm-recipient-socket'),
    dmMessagesContainer: document.getElementById('dm-messages-container'),
    dmEmptyState: document.getElementById('dm-empty-state'),
    dmForm: document.getElementById('dm-form'),
    dmMessageInput: document.getElementById('dm-message-input'),
    btnCloseDm: document.getElementById('btn-close-dm')
  };

  /* ==========================================================================
     1. HELPER & UI UTILITIES
     ========================================================================== */

  function getAvatarEmoji(avatarKey) {
    return avatarEmojiMap[avatarKey] || '⚡';
  }

  function getRoomDescription(room) {
    switch (room) {
      case 'general':
        return 'General discussion channel for all connected participants.';
      case 'developers':
        return 'Engineering, code snippets, architecture, and real-time sockets.';
      case 'random':
        return 'Casual water-cooler banter, memes, and fun discussions.';
      default:
        return `Custom community channel #${room}.`;
    }
  }

  function scrollToBottom(container) {
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }

  function showToast(message, type = 'info', onClick = null) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;

    if (onClick) {
      toast.classList.add('clickable');
      toast.addEventListener('click', () => {
        onClick();
        toast.remove();
      });
    }

    el.toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(40px)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function updateUnreadDMBadge() {
    let count = 0;
    for (const [, unread] of state.dmThreads) {
      // count incoming unread
    }
    count = state.totalUnreadDMs;
    if (count > 0) {
      el.unreadDmBadge.textContent = count > 9 ? '9+' : count;
      el.unreadDmBadge.classList.remove('hidden');
    } else {
      el.unreadDmBadge.classList.add('hidden');
    }
  }

  /* ==========================================================================
     2. EVENT PROTOCOL LISTENERS (SOCKET.IO)
     ========================================================================== */

  if (socket) {
    // A. Connection Lifecycle
    socket.on('connect', () => {
      state.currentUser.socketId = socket.id;
      setConnectionStatus(true);

      // If already logged in, automatically re-authenticate and re-join room
      if (state.currentUser.username) {
        socket.emit('user:login', {
          username: state.currentUser.username,
          avatar: state.currentUser.avatar
        });
        socket.emit('room:join', { room: state.activeRoom });
      }
    });

    socket.on('disconnect', () => {
      setConnectionStatus(false);
      showToast('Disconnected from server. Reconnecting...', 'error');
    });

    socket.on('user:login:success', (data) => {
      state.currentUser.socketId = data.socketId;
      state.currentUser.username = data.username;
      state.currentUser.avatar = data.avatar;

      // Update Navigation
      el.navUsername.textContent = data.username;
      el.navUserAvatar.textContent = getAvatarEmoji(data.avatar);

      // Transition to Main Chat Screen
      el.loginScreen.classList.remove('active');
      el.chatApp.classList.remove('hidden');

      // Join chosen room
      switchRoom(state.activeRoom);
    });

    // B. Room History Hydration
    socket.on('room:history', (payload) => {
      if (!payload || payload.room !== state.activeRoom) return;

      renderRoomHistory(payload.messages || []);
    });

    // C. Room Userlist & Presence Update
    socket.on('room:userlist', (payload) => {
      if (!payload || payload.room !== state.activeRoom) return;

      state.roomUsers = Array.isArray(payload.users) ? payload.users : [];
      renderRoster(state.roomUsers);
    });

    // D. Room Chat Messaging
    socket.on('chat:receive', (msgObj) => {
      if (!msgObj || msgObj.room !== state.activeRoom) return;

      appendChatMessage(msgObj);
    });

    // E. Typing Indicators
    socket.on('typing:update', (payload) => {
      if (!payload) return;

      const { username, room, isTyping } = payload;
      // Scoped strictly to active room and exclude self
      if (room && room !== state.activeRoom) return;
      if (username === state.currentUser.username) return;

      if (isTyping) {
        state.activeTypers.add(username);
      } else {
        state.activeTypers.delete(username);
      }
      renderTypingIndicator();
    });

    // F. Direct Messaging
    socket.on('direct:receive', (dmPayload) => {
      handleIncomingDM(dmPayload);
    });

    socket.on('direct:sent', (dmPayload) => {
      // Direct message confirmed by server
    });

    // G. Server Error Channel
    socket.on('error:message', (err) => {
      const msg = err && err.message ? err.message : 'An error occurred.';
      showToast(msg, 'error');
    });
  }

  function setConnectionStatus(isOnline) {
    const indicator = el.connectionStatus.querySelector('.status-indicator');
    const label = el.connectionStatus.querySelector('.status-label');
    if (isOnline) {
      indicator.className = 'status-indicator online';
      label.textContent = 'Online';
    } else {
      indicator.className = 'status-indicator disconnected';
      label.textContent = 'Offline';
    }
  }

  /* ==========================================================================
     3. USER ACTIONS & ROOM MANAGEMENT
     ========================================================================== */

  // Avatar Selection
  el.avatarSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('.avatar-option');
    if (!btn) return;
    el.avatarSelector.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    state.currentUser.avatar = btn.dataset.avatar || 'avatar1.png';
  });

  // Login Form Submission
  el.loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawUsername = el.usernameInput.value.trim();
    if (!rawUsername) return;

    state.currentUser.username = rawUsername;
    state.activeRoom = el.initialRoomSelect.value || 'general';

    if (socket) {
      socket.emit('user:login', {
        username: state.currentUser.username,
        avatar: state.currentUser.avatar
      });
    }
  });

  // Switch Room Action
  function switchRoom(targetRoom) {
    const cleanRoom = targetRoom.trim().toLowerCase().replace(/^#+/, '');
    if (!cleanRoom) return;

    // Clear typing state in old room
    if (state.isTyping) {
      stopTyping();
    }
    state.activeTypers.clear();
    renderTypingIndicator();

    // Leave old room if different
    if (state.activeRoom && state.activeRoom !== cleanRoom && socket) {
      socket.emit('room:leave', { room: state.activeRoom });
    }

    state.activeRoom = cleanRoom;
    state.knownRooms.add(cleanRoom);

    // Update Header & Nav
    el.navActiveRoomName.textContent = cleanRoom;
    el.roomHeaderTitle.textContent = cleanRoom;
    el.roomHeaderDesc.textContent = getRoomDescription(cleanRoom);
    el.rosterRoomLabel.textContent = `(#${cleanRoom})`;
    el.messageInput.placeholder = `Message #${cleanRoom}... (Press Enter to send)`;

    // Update Channels UI
    renderChannels();

    // Reset Messages View with loading state
    el.messagesContainer.innerHTML = `
      <div class="history-banner">
        <div class="history-line"></div>
        <span class="history-text">Beginning of #${cleanRoom} history</span>
        <div class="history-line"></div>
      </div>
    `;

    // Join new room
    if (socket) {
      socket.emit('room:join', { room: cleanRoom });
    }
  }

  // Create / Join Custom Room Form
  el.createRoomForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const newRoom = el.newRoomInput.value.trim().toLowerCase().replace(/^#+/, '');
    if (newRoom) {
      el.newRoomInput.value = '';
      switchRoom(newRoom);
    }
  });

  // Channel Item Click
  el.channelList.addEventListener('click', (e) => {
    const btn = e.target.closest('.channel-item');
    if (!btn) return;
    const room = btn.dataset.room;
    if (room && room !== state.activeRoom) {
      switchRoom(room);
    }
  });

  function renderChannels() {
    el.channelCount.textContent = state.knownRooms.size;
    let html = '';
    state.knownRooms.forEach((room) => {
      const isActive = room === state.activeRoom ? 'active' : '';
      let tag = 'Custom';
      if (room === 'general') tag = 'All-chat';
      if (room === 'developers') tag = 'Dev';
      if (room === 'random') tag = 'Fun';

      html += `
        <button class="channel-item ${isActive}" data-room="${room}">
          <span class="hash">#</span>
          <span class="channel-name">${room}</span>
          <span class="channel-tag">${tag}</span>
        </button>
      `;
    });
    el.channelList.innerHTML = html;
  }

  // Render Roster
  function renderRoster(users) {
    el.rosterCount.textContent = users.length;
    el.headerUserCount.textContent = `${users.length} online`;

    if (users.length === 0) {
      el.rosterList.innerHTML = '<div class="empty-roster-msg">No other users in this room</div>';
      return;
    }

    let html = '';
    users.forEach((u) => {
      const isMe = u.username === state.currentUser.username && (u.socketId === socket.id || !u.socketId);
      const avatarEmoji = getAvatarEmoji(u.avatar);

      html += `
        <div class="roster-item ${isMe ? 'is-me' : ''}" data-socket="${u.socketId || ''}" data-username="${u.username}" data-avatar="${u.avatar || 'avatar1.png'}">
          <div class="roster-avatar-wrap">
            <div class="roster-avatar">${avatarEmoji}</div>
            <span class="roster-status-dot"></span>
          </div>
          <div class="roster-info">
            <span class="roster-name">${u.username}</span>
            <span class="roster-tag">${isMe ? '(You)' : 'Member'}</span>
          </div>
          ${!isMe ? '<button class="roster-dm-btn" title="Send Direct Message">DM</button>' : ''}
        </div>
      `;
    });
    el.rosterList.innerHTML = html;
  }

  // Roster item click to trigger DM
  el.rosterList.addEventListener('click', (e) => {
    const item = e.target.closest('.roster-item');
    if (!item || item.classList.contains('is-me')) return;

    const socketId = item.dataset.socket;
    const username = item.dataset.username;
    const avatar = item.dataset.avatar;

    if (socketId && username) {
      openDMModal({ socketId, username, avatar });
    }
  });

  /* ==========================================================================
     4. MESSAGING & CHAT RENDERING
     ========================================================================== */

  function renderRoomHistory(messages) {
    // Preserve history banner
    el.messagesContainer.innerHTML = `
      <div class="history-banner">
        <div class="history-line"></div>
        <span class="history-text">Beginning of #${state.activeRoom} history</span>
        <div class="history-line"></div>
      </div>
    `;

    messages.forEach((msg) => {
      appendChatMessage(msg, false);
    });
    scrollToBottom(el.messagesContainer);
  }

  function appendChatMessage(msgObj, shouldScroll = true) {
    const isSelf = msgObj.sender === state.currentUser.username;
    const avatarEmoji = getAvatarEmoji(msgObj.avatar);

    const row = document.createElement('div');
    row.className = `message-row ${isSelf ? 'self' : 'others'}`;
    row.dataset.msgId = msgObj.id || '';

    row.innerHTML = `
      <div class="msg-avatar" title="${msgObj.sender}">${avatarEmoji}</div>
      <div class="msg-content-block">
        <div class="msg-meta">
          <span class="msg-sender">${isSelf ? 'You' : msgObj.sender}</span>
          <span class="msg-timestamp">${msgObj.timestamp || ''}</span>
        </div>
        <div class="msg-bubble">${msgObj.message}</div>
      </div>
    `;

    el.messagesContainer.appendChild(row);
    if (shouldScroll) {
      scrollToBottom(el.messagesContainer);
    }
  }

  // Chat Form Send Message
  el.chatForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const rawMsg = el.messageInput.value.trim();
    if (!rawMsg) return;

    // Send message to current room
    if (socket) {
      socket.emit('chat:send', {
        room: state.activeRoom,
        message: rawMsg
      });
    }

    // Stop typing indicator immediately on message send
    stopTyping();
    el.messageInput.value = '';
    el.messageInput.focus();
  });

  // Quick Emoji Click
  document.querySelectorAll('.btn-emoji').forEach((btn) => {
    btn.addEventListener('click', () => {
      const emoji = btn.dataset.emoji;
      if (emoji) {
        el.messageInput.value += emoji;
        el.messageInput.focus();
        handleTypingKeypress();
      }
    });
  });

  /* ==========================================================================
     5. DEBOUNCED TYPING INDICATOR LOGIC
     ========================================================================== */

  function handleTypingKeypress() {
    if (!state.isTyping) {
      state.isTyping = true;
      if (socket) {
        socket.emit('typing:start', { room: state.activeRoom });
      }
    }

    // Reset 2.5 second debounce timer on every keystroke
    if (state.typingTimeout) {
      clearTimeout(state.typingTimeout);
    }

    state.typingTimeout = setTimeout(() => {
      stopTyping();
    }, 2500);
  }

  function stopTyping() {
    if (state.typingTimeout) {
      clearTimeout(state.typingTimeout);
      state.typingTimeout = null;
    }
    if (state.isTyping) {
      state.isTyping = false;
      if (socket) {
        socket.emit('typing:stop', { room: state.activeRoom });
      }
    }
  }

  el.messageInput.addEventListener('input', handleTypingKeypress);
  el.messageInput.addEventListener('blur', stopTyping);

  function renderTypingIndicator() {
    const typers = Array.from(state.activeTypers);
    if (typers.length === 0) {
      el.typingIndicatorBox.classList.add('hidden');
      return;
    }

    el.typingIndicatorBox.classList.remove('hidden');
    if (typers.length === 1) {
      el.typingText.textContent = `${typers[0]} is typing...`;
    } else if (typers.length === 2) {
      el.typingText.textContent = `${typers[0]} and ${typers[1]} are typing...`;
    } else {
      el.typingText.textContent = `${typers[0]}, ${typers[1]} and ${typers.length - 2} others are typing...`;
    }
  }

  /* ==========================================================================
     6. DIRECT MESSAGING (DM) SYSTEM
     ========================================================================== */

  function openDMModal(recipient) {
    state.dmRecipient = recipient;

    el.dmRecipientName.textContent = recipient.username;
    el.dmRecipientAvatar.textContent = getAvatarEmoji(recipient.avatar);
    el.dmRecipientSocket.textContent = `Socket ID: ${recipient.socketId}`;

    renderDMThread(recipient.socketId);
    el.dmModal.classList.remove('hidden');
    el.dmMessageInput.focus();

    // Clear unread count for this user
    state.totalUnreadDMs = Math.max(0, state.totalUnreadDMs - 1);
    updateUnreadDMBadge();
  }

  function closeDMModal() {
    el.dmModal.classList.add('hidden');
    state.dmRecipient = null;
  }

  el.btnCloseDm.addEventListener('click', closeDMModal);
  el.dmModal.addEventListener('click', (e) => {
    if (e.target === el.dmModal) closeDMModal();
  });

  el.btnOpenDmList.addEventListener('click', () => {
    // If we have online users, open DM with the first non-self user
    const firstOther = state.roomUsers.find(u => u.username !== state.currentUser.username);
    if (firstOther) {
      openDMModal(firstOther);
    } else {
      showToast('No other active users in this room to message.', 'info');
    }
  });

  function renderDMThread(socketId) {
    const messages = state.dmThreads.get(socketId) || [];
    el.dmMessagesContainer.innerHTML = '';

    if (messages.length === 0) {
      el.dmMessagesContainer.appendChild(el.dmEmptyState);
      el.dmEmptyState.classList.remove('hidden');
      return;
    }

    el.dmEmptyState.classList.add('hidden');
    messages.forEach((dm) => {
      appendDMBubble(dm);
    });
    scrollToBottom(el.dmMessagesContainer);
  }

  function appendDMBubble(dm) {
    const row = document.createElement('div');
    row.className = `dm-bubble-row ${dm.isSent ? 'sent' : 'received'}`;
    row.innerHTML = `
      <div class="dm-bubble">${dm.message}</div>
      <span class="dm-meta">${dm.timestamp || ''}</span>
    `;
    el.dmMessagesContainer.appendChild(row);
    scrollToBottom(el.dmMessagesContainer);
  }

  // DM Form Send
  el.dmForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.dmRecipient || !state.dmRecipient.socketId) return;

    const rawMsg = el.dmMessageInput.value.trim();
    if (!rawMsg) return;

    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dmItem = {
      id: `dm_${Date.now()}`,
      from: state.currentUser.username,
      message: rawMsg,
      timestamp,
      isSent: true
    };

    // 1. Emit direct:send to recipient socket ID
    if (socket) {
      socket.emit('direct:send', {
        recipientId: state.dmRecipient.socketId,
        message: rawMsg
      });
    }

    // 2. Append locally to thread
    if (!state.dmThreads.has(state.dmRecipient.socketId)) {
      state.dmThreads.set(state.dmRecipient.socketId, []);
    }
    state.dmThreads.get(state.dmRecipient.socketId).push(dmItem);

    if (el.dmEmptyState) el.dmEmptyState.classList.add('hidden');
    appendDMBubble(dmItem);

    el.dmMessageInput.value = '';
    el.dmMessageInput.focus();
  });

  // Handle Incoming Direct Message
  function handleIncomingDM(dmPayload) {
    const { from, fromSocketId, fromAvatar, message, timestamp } = dmPayload;

    const dmItem = {
      id: dmPayload.id || `dm_${Date.now()}`,
      from,
      message,
      timestamp: timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      isSent: false
    };

    if (!state.dmThreads.has(fromSocketId)) {
      state.dmThreads.set(fromSocketId, []);
    }
    state.dmThreads.get(fromSocketId).push(dmItem);

    // If DM modal is currently open with this user, render live
    if (state.dmRecipient && state.dmRecipient.socketId === fromSocketId && !el.dmModal.classList.contains('hidden')) {
      if (el.dmEmptyState) el.dmEmptyState.classList.add('hidden');
      appendDMBubble(dmItem);
    } else {
      // Show notification badge and toast
      state.totalUnreadDMs += 1;
      updateUnreadDMBadge();
      showToast(`🔒 DM from ${from}: "${message}"`, 'toast-dm', () => {
        openDMModal({
          socketId: fromSocketId,
          username: from,
          avatar: fromAvatar || 'avatar1.png'
        });
      });
    }
  }

  // Sidebar toggle for mobile view
  if (el.sidebarToggle) {
    el.sidebarToggle.addEventListener('click', () => {
      el.sidebar.classList.toggle('open');
    });
  }
});
