/**
 * scripts/socketSmokeTest.js
 * Automated programmatic verification test suite for Assignment 13:
 * Real-Time Group Chat & Messaging Engine (Socket.io)
 */

require('dotenv').config();
const { io } = require('socket.io-client');
const http = require('http');

const PORT = process.env.PORT || 5000;
const SERVER_URL = `http://localhost:${PORT}`;

// Helper to create a connected client
function createClient(username, avatar = 'avatar1.png') {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER_URL, {
      transports: ['websocket'],
      forceNew: true
    });

    socket.on('connect', () => {
      socket.emit('user:login', { username, avatar });
      // wait a tick for user:login processing
      setTimeout(() => {
        resolve(socket);
      }, 50);
    });

    socket.on('connect_error', (err) => {
      reject(err);
    });
  });
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let passedTests = 0;
let totalTests = 0;

function assert(condition, message) {
  totalTests++;
  if (condition) {
    console.log(`  \x1b[32m✔ PASS\x1b[0m: ${message}`);
    passedTests++;
  } else {
    console.error(`  \x1b[31m✘ FAIL\x1b[0m: ${message}`);
  }
}

async function runTests() {
  console.log('===========================================================');
  console.log('🧪 Starting Socket.io Real-Time Smoke Test Suite');
  console.log(`🔗 Target Server: ${SERVER_URL}`);
  console.log('===========================================================\n');

  // Step 0: Check /health endpoint via HTTP
  try {
    const healthRes = await new Promise((resolve, reject) => {
      http.get(`${SERVER_URL}/health`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve(JSON.parse(data)));
      }).on('error', reject);
    });
    assert(healthRes.status === 'ok', `Server /health endpoint responded with status "ok"`);
  } catch (e) {
    console.error(`Could not connect to server at ${SERVER_URL}. Is server running?`, e.message);
    process.exit(1);
  }

  // 1. Connect Aarav, Priya, Rohan
  console.log('\n--- Test 1: User Login & Room Join ---');
  const aarav = await createClient('Aarav', 'avatar1.png');
  const priya = await createClient('Priya', 'avatar2.png');
  const rohan = await createClient('Rohan', 'avatar3.png');

  let aaravInitialHistory = null;
  let priyaInitialHistory = null;
  let aaravUserlist = null;
  let priyaUserlist = null;
  let rohanUserlist = null;

  aarav.on('room:history', (p) => { if (p.room === 'developers') aaravInitialHistory = p.messages; });
  priya.on('room:history', (p) => { if (p.room === 'developers') priyaInitialHistory = p.messages; });

  aarav.on('room:userlist', (p) => { if (p.room === 'developers') aaravUserlist = p.users; });
  priya.on('room:userlist', (p) => { if (p.room === 'developers') priyaUserlist = p.users; });
  rohan.on('room:userlist', (p) => { if (p.room === 'random') rohanUserlist = p.users; });

  aarav.emit('room:join', { room: 'developers' });
  await wait(50);
  priya.emit('room:join', { room: 'developers' });
  rohan.emit('room:join', { room: 'random' });
  await wait(200);

  // Helper to extract usernames from roster objects or strings
  const getUsernames = (list) => (list || []).map(u => (typeof u === 'object' ? u.username : u));

  assert(Array.isArray(aaravInitialHistory), 'Aarav received room:history for developers');
  assert(Array.isArray(priyaInitialHistory), 'Priya received room:history for developers');

  const aaravSeenUsers = getUsernames(aaravUserlist);
  const priyaSeenUsers = getUsernames(priyaUserlist);
  const rohanSeenUsers = getUsernames(rohanUserlist);

  assert(aaravSeenUsers.includes('Aarav') && aaravSeenUsers.includes('Priya'), 'Aarav and Priya appear in developers roster');
  assert(rohanSeenUsers.includes('Rohan') && !rohanSeenUsers.includes('Aarav'), 'Rohan is isolated in #random roster');

  // 2. Typing indicators test
  console.log('\n--- Test 2: Typing Indicators & Room Scoping ---');
  let priyaReceivedTyping = null;
  let rohanReceivedTyping = null;

  priya.on('typing:update', (p) => { priyaReceivedTyping = p; });
  rohan.on('typing:update', (p) => { rohanReceivedTyping = p; });

  aarav.emit('typing:start', { room: 'developers' });
  await wait(150);

  assert(priyaReceivedTyping && priyaReceivedTyping.username === 'Aarav' && priyaReceivedTyping.isTyping === true,
    'Priya received typing:update { username: "Aarav", isTyping: true } in #developers');
  assert(rohanReceivedTyping === null,
    'Rohan in #random received NO typing events for #developers (room isolation verified)');

  // 3. Room chat broadcast
  console.log('\n--- Test 3: Real-Time Group Chat Broadcast ---');
  let aaravReceivedMsg = null;
  let priyaReceivedMsg = null;
  let rohanReceivedMsg = null;

  aarav.on('chat:receive', (m) => { aaravReceivedMsg = m; });
  priya.on('chat:receive', (m) => { priyaReceivedMsg = m; });
  rohan.on('chat:receive', (m) => { rohanReceivedMsg = m; });

  const testMessageText = 'Hey team, Socket.io is awesome!';
  aarav.emit('chat:send', { room: 'developers', message: testMessageText });
  await wait(150);

  assert(aaravReceivedMsg && aaravReceivedMsg.message === testMessageText, 'Aarav (sender) received chat:receive echo for ordering');
  assert(priyaReceivedMsg && priyaReceivedMsg.message === testMessageText, 'Priya received real-time chat:receive in #developers');
  assert(priyaReceivedMsg && priyaReceivedMsg.id && priyaReceivedMsg.timestamp, 'Message has server-generated id and timestamp');
  assert(rohanReceivedMsg === null, 'Rohan in #random did NOT receive message sent to #developers');

  // 4. Message history hydration test with 4th user
  console.log('\n--- Test 4: Message History Hydration for New Joiner ---');
  let vikramHistory = null;
  const vikram = await createClient('Vikram', 'avatar4.png');
  vikram.on('room:history', (p) => {
    if (p.room === 'developers') vikramHistory = p.messages;
  });

  vikram.emit('room:join', { room: 'developers' });
  await wait(150);

  assert(Array.isArray(vikramHistory) && vikramHistory.some(m => m.message === testMessageText),
    'New joiner Vikram received message history containing earlier message');

  // 5. Private Direct Messaging test
  console.log('\n--- Test 5: Direct Messaging (DMs) ---');
  let priyaReceivedDM = null;
  let rohanReceivedDM = null;
  let developersReceivedDMBroadcast = false;

  priya.on('direct:receive', (dm) => { priyaReceivedDM = dm; });
  rohan.on('direct:receive', (dm) => { rohanReceivedDM = dm; });

  const priyaSocketId = priya.id;
  const secretDM = 'Confidential project update';

  aarav.emit('direct:send', { recipientId: priyaSocketId, message: secretDM });
  await wait(150);

  assert(priyaReceivedDM && priyaReceivedDM.from === 'Aarav' && priyaReceivedDM.message === secretDM,
    'Priya received direct:receive private DM from Aarav');
  assert(rohanReceivedDM === null, 'Rohan did NOT receive private DM targeted to Priya');

  // Verify DM is NOT in developers history
  const devHistoryNow = await new Promise((resolve) => {
    const tempHandler = (p) => {
      if (p.room === 'developers') {
        aarav.off('room:history', tempHandler);
        resolve(p.messages);
      }
    };
    aarav.on('room:history', tempHandler);
    aarav.emit('room:join', { room: 'developers' });
  });

  const dmInHistory = devHistoryNow.some(m => m.message === secretDM);
  assert(!dmInHistory, 'Direct message was NOT saved in public room history');

  // 6. Disconnect cleanup and presence update
  console.log('\n--- Test 6: Disconnect Roster Cleanup & Typing Safety Net ---');
  let aaravPostDisconnectRoster = null;
  let priyaClearedTyping = null;

  aarav.on('room:userlist', (p) => {
    if (p.room === 'developers') aaravPostDisconnectRoster = p.users;
  });
  aarav.on('typing:update', (p) => {
    if (p.username === 'Priya') priyaClearedTyping = p;
  });

  // Start typing from Priya, then immediately disconnect
  priya.emit('typing:start', { room: 'developers' });
  await wait(50);
  priya.disconnect();
  await wait(200);

  const remainingUsers = getUsernames(aaravPostDisconnectRoster);
  assert(!remainingUsers.includes('Priya'), 'Priya was removed from developers roster upon disconnect');
  assert(priyaClearedTyping && priyaClearedTyping.isTyping === false,
    'Typing indicator for Priya automatically cleared with isTyping:false on disconnect');

  // Cleanup remaining sockets
  aarav.disconnect();
  rohan.disconnect();
  vikram.disconnect();

  console.log('\n===========================================================');
  console.log(`📊 Smoke Test Summary: ${passedTests} / ${totalTests} Passed`);
  if (passedTests === totalTests) {
    console.log('\x1b[32m🎉 ALL AUTOMATED SOCKET.IO REAL-TIME CHECKS PASSED SUCCESSFULLY!\x1b[0m');
  } else {
    console.log('\x1b[31m⚠️ SOME TESTS FAILED!\x1b[0m');
    process.exit(1);
  }
  console.log('===========================================================\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('Fatal error during smoke test:', err);
  process.exit(1);
});
