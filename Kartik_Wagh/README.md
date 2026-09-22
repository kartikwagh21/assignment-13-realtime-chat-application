# 💬 PulseChat — Real-Time Group Chat & Messaging Engine (Socket.io)

> **Assignment 13:** Advanced Real-Time Web Application  
> **Author:** Kartik Wagh  
> **Repository:** `itm-assignment-13-chat-socket`  
> **Live Demo Video:** _[Paste your 1-minute Loom / Drive video link here]_

---

## 🌟 Overview & Features

**PulseChat** is an ultra-responsive, scalable Real-Time Group Chat and Direct Messaging Engine engineered with **Node.js**, **Express.js**, and **Socket.io**. It features multi-channel chat rooms, debounced live typing indicators, active participant presence tracking, instant message history hydration, and private direct messaging delivered exclusively to targeted socket IDs.

### 🚀 Key Capabilities:
- **Dynamic Multi-Channel Rooms:** Seamlessly switch between channels (`#general`, `#developers`, `#random`) or dynamically create new rooms (`#gaming`, `#tech`) with `socket.join(room)` and `socket.leave(room)`.
- **In-Memory History Hydration:** Caches up to **50 recent messages per room** (`MAX_HISTORY = 50`) and replays them immediately upon connection to hydrate new joiners.
- **Debounced Typing Indicators:** Real-time feedback with client-side 2.5-second debounce timers and server-side safety nets to clear typing states on disconnects or room transfers.
- **Active Presence & Rosters:** Real-time room rosters updating instantly on joins, leaves, and socket disconnects.
- **Private Direct Messaging (DMs):** One-to-one encrypted-feel messaging delivered strictly to the target socket ID (`io.to(recipientSocketId)`) without leaking into room broadcasts or history buffers.
- **XSS Sanitization & Security:** Server-side HTML escaping of all usernames and message payloads to prevent stored and reflected XSS.
- **Modern Glassmorphic Dark UI:** Polished interface featuring avatar customization, message bubbles styled differently for self vs others, unread DM badges, and responsive sidebar navigation.

---

## 🛠️ Tech Stack & Architecture

- **Runtime:** Node.js (>=18)
- **Framework:** Express.js v4
- **Real-Time Engine:** Socket.io v4 (WebSockets with polling fallback)
- **Security & Utilities:** CORS, Dotenv, HTML Entity Escaping
- **Frontend:** Semantic HTML5, Vanilla JavaScript (ES6+), Modern Glassmorphism CSS Design System
- **Testing:** Automated Socket.io Client Test Suite (`scripts/socketSmokeTest.js`)

---

## 📂 Project Structure

```text
Kartik_Wagh/
├── public/
│   ├── index.html              # Multi-room chat UI with dark theme
│   ├── app.js                  # Client socket event listeners & UI updates
│   └── style.css               # Modern glassmorphism styling & chat bubbles
├── sockets/
│   ├── chatHandler.js          # Room messaging, DM & typing event handlers
│   └── userHandler.js          # User login, room join/leave & disconnects
├── utils/
│   └── messageStore.js         # In-memory history, roster state & helpers
├── scripts/
│   └── socketSmokeTest.js      # Programmatic multi-client automated test suite
├── .env.example                # Example environment configuration
├── .gitignore                  # Git ignore rules
├── package.json                # Project manifest, scripts & dependencies
├── render.yaml                 # Render Blueprint deployment config
├── server.js                   # Express & Socket.io server bootstrap
└── README.md                   # Complete documentation & test guide
```

---

## 📡 Real-Time Socket Event Protocol

### 🔄 Session & Room Management

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `user:login` | `Client -> Server` | `{ "username": "Aarav", "avatar": "avatar1.png" }` | Registers user identity and maps socket ID |
| `user:login:success` | `Server -> Client` | `{ "socketId": "xyz", "username": "Aarav", "avatar": "avatar1.png" }` | Confirms registration and emits session info |
| `room:join` | `Client -> Server` | `{ "room": "developers" }` | Joins a chat channel, leaving any previous room |
| `room:history` | `Server -> Client` | `{ "room": "developers", "messages": [...] }` | Emits last 50 cached messages to the joining socket |
| `room:userlist` | `Server -> Room` | `{ "room": "developers", "users": [{ "socketId": "...", "username": "Aarav", "avatar": "avatar1.png" }] }` | Broadcasts updated online participant roster to room |
| `room:leave` | `Client -> Server` | `{ "room": "developers" }` | Leaves the room and updates the room's roster |

### 💬 Messaging & Indicators

| Event Name | Direction | Payload Schema | Description |
|---|:---:|---|---|
| `chat:send` | `Client -> Server` | `{ "room": "developers", "message": "Hey everyone!" }` | Sends sanitized message to the active room |
| `chat:receive` | `Server -> Room` | `{ "id": "msg_123", "sender": "Aarav", "avatar": "avatar1.png", "room": "developers", "message": "Hey everyone!", "timestamp": "14:32" }` | Broadcasts message to all members in room (including sender) |
| `typing:start` | `Client -> Server` | `{ "room": "developers" }` | Signals user started typing in the room |
| `typing:stop` | `Client -> Server` | `{ "room": "developers" }` | Signals user stopped typing or sent message |
| `typing:update` | `Server -> Room (broadcast.to)` | `{ "username": "Aarav", "room": "developers", "isTyping": true }` | Broadcasts typing status to other room members |
| `direct:send` | `Client -> Server` | `{ "recipientId": "socket_id_xyz", "message": "Secret DM" }` | Sends private direct message to specific socket ID |
| `direct:receive`| `Server -> Client` | `{ "id": "dm_123", "from": "Aarav", "fromSocketId": "...", "fromAvatar": "avatar1.png", "message": "Secret DM", "timestamp": "14:35" }` | Delivered exclusively to the target recipient socket |
| `error:message` | `Server -> Client` | `{ "message": "Reason for error" }` | Emits human-readable error notification |

---

## 🧠 Architectural Design Decisions

1. **In-Memory Store (`utils/messageStore.js`):**
   - `connectedUsers`: `Map<socketId, { username, avatar, currentRoom }>` maintains active socket sessions in $O(1)$ lookup time.
   - `roomHistories`: Object storing array of message objects per channel, capped strictly at `MAX_HISTORY = 50` with FIFO eviction (`shift()`).
   - `roomRosters`: Object mapping room names to `Set<socketId>` for instant presence additions and deletions.

2. **Single Active Room per Tab:**
   - Consistent with industry standards and real-time best practices, each socket connection belongs to at most one public room channel at a time. Switching channels automatically triggers `socket.leave(oldRoom)`, broadcasts an updated roster to the previous room, clears typing indicators, and joins the new room with instant history replay.

3. **Debounced Typing Indicator Engine:**
   - **Client-Side:** Typing events are debounced on the client. `typing:start` fires only on the initial keystroke, while a 2.5-second timer is refreshed on subsequent typing. When idle or when sending a message, `typing:stop` is fired.
   - **Server-Side Safety Net:** If a user navigates away, switches rooms, or abruptly disconnects while typing, the server automatically broadcasts `typing:update` with `isTyping: false` to ensure typing banners never get stuck.

4. **Private Direct Messages (DMs):**
   - Direct messages are targeted exclusively via `io.to(recipientSocketId).emit('direct:receive', ...)`.
   - DMs completely bypass room channels and in-memory room histories, ensuring private communication cannot be viewed by other channel participants or new joiners.

5. **Horizontal Scaling & Single-Process Considerations:**
   - This application uses fast in-memory data structures optimal for a single Node.js process (e.g. Render Free Tier).
   - **Scaling to Multiple Instances:** To scale horizontally across multiple instances or containers, the in-memory maps would be replaced with **Redis** (storing user sessions and channel history) and the **`@socket.io/redis-adapter`** (or Redis Streams / PubSub) to broadcast socket events across worker clusters.

---

## ⚡ Setup & Local Execution

### 1. Clone & Navigate to Project Root
```bash
cd Kartik_Wagh
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
```bash
cp .env.example .env
```
*(Default `PORT=5001` or `PORT=5000`)*

### 4. Start the Server
```bash
# Production mode
npm start

# Development mode (with live reload)
npm run dev
```

### 5. Open in Browser
Navigate to: **[http://localhost:5001](http://localhost:5001)** (or `http://localhost:5000`)

---

## 🧪 Automated Testing & Verification

The project includes an automated multi-client test suite using `socket.io-client` that validates all 7 core specifications programmatically:

```bash
npm test
```

### Test Suite Execution Output:
```text
===========================================================
🧪 Starting Socket.io Real-Time Smoke Test Suite
🔗 Target Server: http://localhost:5001
===========================================================

  ✔ PASS: Server /health endpoint responded with status "ok"

--- Test 1: User Login & Room Join ---
  ✔ PASS: Aarav received room:history for developers
  ✔ PASS: Priya received room:history for developers
  ✔ PASS: Aarav and Priya appear in developers roster
  ✔ PASS: Rohan is isolated in #random roster

--- Test 2: Typing Indicators & Room Scoping ---
  ✔ PASS: Priya received typing:update { username: "Aarav", isTyping: true } in #developers
  ✔ PASS: Rohan in #random received NO typing events for #developers (room isolation verified)

--- Test 3: Real-Time Group Chat Broadcast ---
  ✔ PASS: Aarav (sender) received chat:receive echo for ordering
  ✔ PASS: Priya received real-time chat:receive in #developers
  ✔ PASS: Message has server-generated id and timestamp
  ✔ PASS: Rohan in #random did NOT receive message sent to #developers

--- Test 4: Message History Hydration for New Joiner ---
  ✔ PASS: New joiner Vikram received message history containing earlier message

--- Test 5: Direct Messaging (DMs) ---
  ✔ PASS: Priya received direct:receive private DM from Aarav
  ✔ PASS: Rohan did NOT receive private DM targeted to Priya
  ✔ PASS: Direct message was NOT saved in public room history

--- Test 6: Disconnect Roster Cleanup & Typing Safety Net ---
  ✔ PASS: Priya was removed from developers roster upon disconnect
  ✔ PASS: Typing indicator for Priya automatically cleared with isTyping:false on disconnect

===========================================================
📊 Smoke Test Summary: 17 / 17 Passed
🎉 ALL AUTOMATED SOCKET.IO REAL-TIME CHECKS PASSED SUCCESSFULLY!
===========================================================
```

---

## 🖥️ Manual Browser Verification Steps

To visually verify all real-time interactions across tabs:

1. **Step 1:** Open three browser windows/tabs side by side at `http://localhost:5001`:
   - **Tab 1:** Login as **Aarav** and join `#developers`.
   - **Tab 2:** Login as **Priya** and join `#developers`.
   - **Tab 3:** Login as **Rohan** and join `#random`.
2. **Step 2 (Typing Indicator):** In Tab 1 (Aarav), type in the message input box.
   - Verify **Tab 2 (Priya)** displays *"Aarav is typing..."*.
   - Verify **Tab 3 (Rohan)** in `#random` sees **no typing indicator**.
3. **Step 3 (Group Broadcast):** In Tab 1, send a message `"Hello developers!"`.
   - Verify Priya receives the message in real time.
   - Verify Rohan in `#random` does not receive it.
4. **Step 4 (History Hydration):** Open a fourth tab (Tab 4), log in as **Vikram**, and join `#developers`.
   - Verify Vikram immediately sees all previous messages from history.
5. **Step 5 (Private Direct Message):** In Tab 1 (Aarav), click on **Priya** in the "Active In Room" roster on the sidebar to open the DM modal. Send `"Secret message"`.
   - Verify only Priya receives the DM with a badge notification / toast.
   - Verify Rohan and the public `#developers` channel receive nothing.
6. **Step 6 (Dynamic Channels):** In Tab 3 (Rohan), enter `#gaming` into the channel creator and join.
   - Verify custom channel `#gaming` is dynamically created and isolated.

---

## ☁️ Deployment on Render

This project is built and optimized for seamless deployment on [Render](https://render.com) as a Web Service.

### Deployment Instructions:
1. **GitHub Repository:** Push `Kartik_Wagh` as the root of `itm-assignment-13-chat-socket`.
2. **Create Web Service:**
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Health Check Path:** `/health`
   - **Environment Variables:**
     - `NODE_ENV`: `production`
     - `CORS_ORIGIN`: `*`
3. **WebSocket Support:** Socket.io WebSocket upgrade works natively out-of-the-box on Render.
4. **Cold Starts:** On Render's Free tier, instances idle after 15 minutes of inactivity. The first visitor will wake the container (30–50s cold start).

---

## 📹 Video Demonstration
- **Video Submission URL:** _[Insert link to your 1-minute video demonstration here]_
- **Demonstration Highlights:** Multi-tab room chatting, debounced typing indicators, instant history replay, and private direct messaging.
