// End-to-end tests of the socket.io protocol against the real server:
// real HTTP auth session, real sockets, real handlers.
const { expect } = require('chai');
const http = require('http');
const path = require('path');
const fs = require('fs');
const ioClient = require('socket.io-client');

describe('Socket Protocol (end-to-end)', function () {
  this.timeout(10000);

  let serverModule;
  let port;
  let baseURL;
  let testDbPath;
  let authCookie;
  const openSockets = [];

  // X-Forwarded-Proto keeps auth working when another test file has loaded the
  // server with NODE_ENV=production (secure cookies + trust proxy).
  function connect(opts = {}) {
    const socket = ioClient(baseURL, {
      forceNew: true,
      ...opts,
      extraHeaders: { 'X-Forwarded-Proto': 'https', ...(opts.extraHeaders || {}) }
    });
    openSockets.push(socket);
    return socket;
  }

  function connectAuthed() {
    return connect({ extraHeaders: { Cookie: authCookie } });
  }

  function once(socket, event) {
    return new Promise((resolve) => socket.once(event, resolve));
  }

  function request(options, body = null) {
    return new Promise((resolve, reject) => {
      const req = http.request({ hostname: 'localhost', port, ...options }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => resolve({
          statusCode: res.statusCode,
          body: data ? JSON.parse(data) : null,
          cookies: res.headers['set-cookie'] || []
        }));
      });
      req.on('error', reject);
      if (body) req.write(JSON.stringify(body));
      req.end();
    });
  }

  // Requests as the signed-in producer. Content-Type is harmless on GET.
  function authHeaders() {
    return { Cookie: authCookie, 'X-Forwarded-Proto': 'https', 'Content-Type': 'application/json' };
  }

  async function createSession() {
    const producer = connectAuthed();
    await once(producer, 'connect');
    producer.emit('create-session');
    const created = await once(producer, 'session-created');
    return { producer, code: created.code, token: created.token, created };
  }

  async function joinClicker(code, displayName = 'Test Presenter') {
    const clicker = connect();
    await once(clicker, 'connect');
    clicker.emit('join-session', { code, role: 'clicker', displayName });
    const joined = await once(clicker, 'session-joined');
    return { clicker, token: joined.token, joined };
  }

  before(async () => {
    testDbPath = path.join(__dirname, '..', 'test-socket-protocol.sqlite');
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

    process.env.USERS_DB = testDbPath;
    process.env.SESSION_SECRET = 'test-secret-sockets';

    serverModule = require('../server.js');
    await new Promise((resolve) => serverModule.server.listen(0, resolve));
    port = serverModule.server.address().port;
    baseURL = `http://localhost:${port}`;

    const signup = await request(
      { path: '/api/signup', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' } },
      { email: 'producer@example.com', password: 'password123' }
    );
    expect(signup.statusCode).to.equal(200);
    authCookie = signup.cookies.map((c) => c.split(';')[0]).join('; ');
  });

  after((done) => {
    try {
      serverModule.getAllUsers().forEach((u) => serverModule.deleteUser(u.userId));
      serverModule.closeDatabase();
    } catch (e) { /* ignore */ }
    if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
    serverModule.server.close(() => done());
  });

  afterEach(() => {
    while (openSockets.length) {
      const s = openSockets.pop();
      if (s.connected) s.disconnect();
    }
    serverModule.sessions.clear();
  });

  describe('create-session', () => {
    it('rejects unauthenticated sockets', async () => {
      const socket = connect();
      await once(socket, 'connect');
      socket.emit('create-session');
      const err = await once(socket, 'error');
      expect(err.message).to.equal('Authentication required to create session');
    });

    it('creates a session with a 6-char code and features disabled', async () => {
      const { created } = await createSession();
      expect(created.code).to.match(/^[A-Z0-9]{6}$/);
      expect(created.token).to.have.lengthOf(64);
      expect(created.requireName).to.equal(true);
      expect(created.features).to.deep.equal({
        screenshotEnabled: false,
        messagesEnabled: false,
        speakerNotesEnabled: false,
        laserPointerEnabled: false,
        voiceControlEnabled: false,
        cueBeepsEnabled: false
      });
    });
  });

  describe('join-session', () => {
    it('rejects an unknown session code', async () => {
      const socket = connect();
      await once(socket, 'connect');
      socket.emit('join-session', { code: 'NOPE99', role: 'clicker', displayName: 'X' });
      const err = await once(socket, 'error');
      expect(err.message).to.equal('Session not found');
    });

    it('requires a display name when requireName is on', async () => {
      const { code } = await createSession();
      const socket = connect();
      await once(socket, 'connect');
      socket.emit('join-session', { code, role: 'clicker', displayName: '   ' });
      const err = await once(socket, 'error');
      expect(err.message).to.equal('Display name is required');
    });

    it('joins a clicker and notifies the producer of the presenter list', async () => {
      const { producer, code } = await createSession();
      const updated = once(producer, 'presenters-updated');
      const { joined } = await joinClicker(code, 'Alice');
      expect(joined.token).to.have.lengthOf(64);
      expect(joined.clickAccessEnabled).to.equal(true);
      const { presenters } = await updated;
      expect(presenters).to.have.lengthOf(1);
      expect(presenters[0].displayName).to.equal('Alice');
      expect(presenters[0].isAnonymous).to.equal(false);
    });

    it('joins a show client without a name', async () => {
      const { code } = await createSession();
      const socket = connect();
      await once(socket, 'connect');
      socket.emit('join-session', { code, role: 'show-client' });
      const joined = await once(socket, 'session-joined');
      expect(joined.code).to.equal(code);
      expect(joined.token).to.have.lengthOf(64);
    });
  });

  describe('next / prev', () => {
    it('broadcasts advance to the session', async () => {
      const { producer, code } = await createSession();
      const { clicker, token } = await joinClicker(code);
      const advance = once(producer, 'advance');
      clicker.emit('next', { code, token });
      expect((await advance).direction).to.equal('next');

      const back = once(producer, 'advance');
      clicker.emit('prev', { code, token });
      expect((await back).direction).to.equal('prev');
    });

    it('rejects an invalid token', async () => {
      const { code } = await createSession();
      const { clicker } = await joinClicker(code);
      clicker.emit('next', { code, token: 'bogus' });
      const err = await once(clicker, 'error');
      expect(err.message).to.equal('Unauthorized: Invalid clicker token');
    });

    it('rejects clicks while the session is locked', async () => {
      const { producer, code, token: producerToken } = await createSession();
      const { clicker, token } = await joinClicker(code);
      producer.emit('set-lock', { code, token: producerToken, locked: true });
      await once(clicker, 'lock-changed');
      clicker.emit('next', { code, token });
      const err = await once(clicker, 'error');
      expect(err.message).to.equal('Session is locked');
    });

    it('rejects clicks from a suspended presenter', async () => {
      const { producer, code, token: producerToken } = await createSession();
      const { clicker, token } = await joinClicker(code);
      producer.emit('toggle-presenter-access', {
        code, token: producerToken, presenterId: clicker.id, enabled: false
      });
      await once(clicker, 'click-access-changed');
      clicker.emit('next', { code, token });
      const err = await once(clicker, 'error');
      expect(err.message).to.equal('Your click access is suspended');
    });
  });

  describe('producer controls', () => {
    it('rejects producer actions with a wrong token', async () => {
      const { producer, code } = await createSession();
      producer.emit('set-lock', { code, token: 'wrong', locked: true });
      const err = await once(producer, 'error');
      expect(err.message).to.equal('Unauthorized: Invalid producer token');
    });

    it('broadcasts notes and timer changes', async () => {
      const { producer, code, token } = await createSession();
      const { clicker } = await joinClicker(code);

      const notes = once(clicker, 'notes-changed');
      producer.emit('set-notes', { code, token, notes: 'Slide 4 has a demo' });
      expect((await notes).notes).to.equal('Slide 4 has a demo');

      const timer = once(clicker, 'timer-changed');
      producer.emit('set-timer', { code, token, minutes: 5 });
      expect((await timer).timer).to.equal(300);
    });

    it('toggles requireName', async () => {
      const { producer, code, token } = await createSession();
      producer.emit('set-require-name', { code, token, requireName: false });
      const res = await once(producer, 'require-name-updated');
      expect(res.requireName).to.equal(false);

      // anonymous join is now allowed
      const socket = connect();
      await once(socket, 'connect');
      socket.emit('join-session', { code, role: 'clicker' });
      const joined = await once(socket, 'session-joined');
      expect(joined.token).to.have.lengthOf(64);
    });
  });

  describe('display names', () => {
    it('lets a clicker set a display name and clears the anonymous flag', async () => {
      const { producer, code, token: producerToken } = await createSession();
      producer.emit('set-require-name', { code, token: producerToken, requireName: false });
      await once(producer, 'require-name-updated');

      const socket = connect();
      await once(socket, 'connect');
      const joinUpdate = once(producer, 'presenters-updated');
      socket.emit('join-session', { code, role: 'clicker' });
      const joined = await once(socket, 'session-joined');
      await joinUpdate;

      const updated = once(producer, 'presenters-updated');
      socket.emit('set-display-name', { code, token: joined.token, displayName: '  Bob  ' });
      const res = await once(socket, 'display-name-updated');
      expect(res.displayName).to.equal('Bob');
      const { presenters } = await updated;
      expect(presenters[0].displayName).to.equal('Bob');
      expect(presenters[0].isAnonymous).to.equal(false);
    });

    it('prompt-name reaches only anonymous presenters', async () => {
      const { producer, code, token: producerToken } = await createSession();
      producer.emit('set-require-name', { code, token: producerToken, requireName: false });
      await once(producer, 'require-name-updated');

      const anon = connect();
      await once(anon, 'connect');
      anon.emit('join-session', { code, role: 'clicker' });
      await once(anon, 'session-joined');

      const { clicker: named } = await joinClicker(code, 'Named');

      let namedPrompted = false;
      named.on('name-prompt', () => (namedPrompted = true));
      const prompted = once(anon, 'name-prompt');
      producer.emit('prompt-name', { code, token: producerToken });
      await prompted;
      expect(namedPrompted).to.equal(false);
    });
  });

  describe('features', () => {
    it('merges feature toggles and broadcasts them', async () => {
      const { producer, code, token } = await createSession();
      const { clicker } = await joinClicker(code);
      const changed = once(clicker, 'features-changed');
      producer.emit('set-features', { code, token, features: { messagesEnabled: true } });
      const { features } = await changed;
      expect(features.messagesEnabled).to.equal(true);
      expect(features.screenshotEnabled).to.equal(false);
    });

    it('blocks messages until the feature is enabled', async () => {
      const { producer, code, token } = await createSession();
      const { clicker } = await joinClicker(code);

      producer.emit('send-message', { code, token, targetId: 'all', message: 'hi' });
      const err = await once(producer, 'error');
      expect(err.message).to.equal('Messaging feature is disabled');

      producer.emit('set-features', { code, token, features: { messagesEnabled: true } });
      await once(producer, 'features-changed');

      const received = once(clicker, 'message-received');
      producer.emit('send-message', { code, token, targetId: 'all', message: 'Hello presenters!' });
      const msg = await received;
      expect(msg.message).to.equal('Hello presenters!');
      expect(msg.from).to.equal('Producer');
    });

    it('pushes speaker notes from the show client to presenters when enabled', async () => {
      const { producer, code, token } = await createSession();
      const { clicker } = await joinClicker(code);

      const show = connect();
      await once(show, 'connect');
      show.emit('join-session', { code, role: 'show-client' });
      const showJoined = await once(show, 'session-joined');

      // blocked until the producer turns the feature on
      let leaked = false;
      clicker.once('notes-changed', () => (leaked = true));
      show.emit('set-show-notes', { code, token: showJoined.token, notes: 'too early' });
      await new Promise((r) => setTimeout(r, 100));
      expect(leaked).to.equal(false);

      producer.emit('set-features', { code, token, features: { speakerNotesEnabled: true } });
      await once(producer, 'features-changed');

      const changed = once(clicker, 'notes-changed');
      show.emit('set-show-notes', { code, token: showJoined.token, notes: 'Slide 3: mention the roadmap' });
      expect((await changed).notes).to.equal('Slide 3: mention the roadmap');
      expect(serverModule.sessions.get(code).notes).to.equal('Slide 3: mention the roadmap');
    });

    it('rejects speaker notes from a client without the show token', async () => {
      const { producer, code, token } = await createSession();
      producer.emit('set-features', { code, token, features: { speakerNotesEnabled: true } });
      await once(producer, 'features-changed');

      const { clicker, token: clickerToken } = await joinClicker(code);
      clicker.emit('set-show-notes', { code, token: clickerToken, notes: 'spoofed' });
      const err = await once(clicker, 'error');
      expect(err.message).to.equal('Unauthorized: Invalid show client token');
    });

    it('forwards screenshots from show client to clickers when enabled', async () => {
      const { producer, code, token } = await createSession();
      const { clicker } = await joinClicker(code);

      const show = connect();
      await once(show, 'connect');
      show.emit('join-session', { code, role: 'show-client' });
      const showJoined = await once(show, 'session-joined');

      producer.emit('set-features', { code, token, features: { screenshotEnabled: true } });
      await once(producer, 'features-changed');

      const shot = once(clicker, 'screenshot-updated');
      show.emit('screenshot-upload', { code, token: showJoined.token, screenshot: 'data:image/png;base64,abc' });
      expect((await shot).screenshot).to.equal('data:image/png;base64,abc');
    });
  });

  describe('producer reclaim', () => {
    it('keeps the session alive after producer disconnect and lets the owner reclaim it', async () => {
      const { producer, code } = await createSession();
      const { clicker, token } = await joinClicker(code);

      producer.disconnect();
      await new Promise((r) => setTimeout(r, 100));
      expect(serverModule.sessions.has(code)).to.equal(true);
      expect(serverModule.sessions.get(code).producer).to.equal(null);

      const reclaimer = connectAuthed();
      await once(reclaimer, 'connect');
      reclaimer.emit('reclaim-producer', { code });
      const reclaimed = await once(reclaimer, 'producer-reclaimed');
      expect(reclaimed.code).to.equal(code);
      expect(reclaimed.presenters).to.have.lengthOf(1);

      // reclaimer is now the producer and clicks still work
      const advance = once(reclaimer, 'advance');
      clicker.emit('next', { code, token });
      expect((await advance).direction).to.equal('next');
    });

    it('rejects reclaim by a different user', async () => {
      const { code } = await createSession();

      const signup = await request(
        { path: '/api/signup', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' } },
        { email: 'other@example.com', password: 'password123' }
      );
      const otherCookie = signup.cookies.map((c) => c.split(';')[0]).join('; ');

      const intruder = connect({ extraHeaders: { Cookie: otherCookie } });
      await once(intruder, 'connect');
      intruder.emit('reclaim-producer', { code });
      const err = await once(intruder, 'error');
      expect(err.message).to.equal('Unauthorized: You did not create this session');
    });

    it('rejects reclaim by an unauthenticated socket', async () => {
      const { code } = await createSession();
      const socket = connect();
      await once(socket, 'connect');
      socket.emit('reclaim-producer', { code });
      const err = await once(socket, 'error');
      expect(err.message).to.equal('Authentication required to reclaim session');
    });
  });

  describe('durable sessions', () => {
    it('survives a server restart via the database', async () => {
      const { producer, code, token } = await createSession();
      producer.emit('set-notes', { code, token, notes: 'persisted note' });
      await once(producer, 'notes-changed');

      // Simulate a restart: drop all in-memory state, then restore from SQLite
      serverModule.sessions.clear();
      serverModule.loadPersistedSessions();

      const restored = serverModule.sessions.get(code);
      expect(restored).to.exist;
      expect(restored.notes).to.equal('persisted note');
      expect(restored.producer).to.equal(null);

      // owner can reclaim the restored session and clickers can join it
      const reclaimer = connectAuthed();
      await once(reclaimer, 'connect');
      reclaimer.emit('reclaim-producer', { code });
      const reclaimed = await once(reclaimer, 'producer-reclaimed');
      expect(reclaimed.notes).to.equal('persisted note');

      const { clicker, token: clickerToken } = await joinClicker(code);
      const advance = once(reclaimer, 'advance');
      clicker.emit('next', { code, token: clickerToken });
      expect((await advance).direction).to.equal('next');
    });

    it('lists the owner\'s active sessions via /api/my-sessions', async () => {
      const { code } = await createSession();
      await joinClicker(code);

      const res = await request({
        path: '/api/my-sessions', method: 'GET',
        headers: authHeaders()
      });
      expect(res.statusCode).to.equal(200);
      const mine = res.body.sessions.find((s) => s.code === code);
      expect(mine).to.exist;
      expect(mine.presenterCount).to.equal(1);
      expect(mine.producerConnected).to.equal(true);
    });

    it('requires auth for /api/my-sessions', async () => {
      const res = await request({ path: '/api/my-sessions', method: 'GET' });
      expect(res.statusCode).to.equal(401);
    });

    it('lets the owner end a session via DELETE, notifying participants', async () => {
      const { code } = await createSession();
      const { clicker } = await joinClicker(code);

      const ended = once(clicker, 'session-ended');
      const res = await request({
        path: `/api/sessions/${code}`, method: 'DELETE',
        headers: authHeaders()
      });
      expect(res.statusCode).to.equal(200);
      await ended;
      expect(serverModule.sessions.has(code)).to.equal(false);
    });

    it('rejects DELETE from a non-owner', async () => {
      const { code } = await createSession();
      const res = await request({ path: `/api/sessions/${code}`, method: 'DELETE' });
      expect(res.statusCode).to.equal(401);
    });
  });

  describe('session HTTP API', () => {
    it('creates a session owned by the caller, usable over sockets', async () => {
      const res = await request({ path: '/api/sessions', method: 'POST', headers: authHeaders() });
      expect(res.statusCode).to.equal(201);
      expect(res.body.code).to.match(/^[A-Z0-9]{6}$/);
      expect(res.body.producerToken).to.have.lengthOf(64);
      expect(res.body.presenterUrl).to.contain(`/clicker.html?code=${res.body.code}`);
      expect(res.body.cueUrl).to.contain(`/show.html?code=${res.body.code}`);
      expect(res.body.producerConnected).to.equal(false);

      // the API-created session is a first-class session: owner can reclaim it
      // and presenters can join and click
      const code = res.body.code;
      const reclaimer = connectAuthed();
      await once(reclaimer, 'connect');
      reclaimer.emit('reclaim-producer', { code });
      const reclaimed = await once(reclaimer, 'producer-reclaimed');
      expect(reclaimed.token).to.equal(res.body.producerToken);

      const { clicker, token } = await joinClicker(code);
      const advance = once(reclaimer, 'advance');
      clicker.emit('next', { code, token });
      expect((await advance).direction).to.equal('next');
    });

    it('persists an API-created session across a restart', async () => {
      const res = await request({ path: '/api/sessions', method: 'POST', headers: authHeaders() });
      const code = res.body.code;

      serverModule.sessions.clear();
      serverModule.loadPersistedSessions();

      const restored = serverModule.sessions.get(code);
      expect(restored).to.exist;
      expect(restored.producerToken).to.equal(res.body.producerToken);
    });

    it('rejects unauthenticated session creation', async () => {
      const res = await request({ path: '/api/sessions', method: 'POST' });
      expect(res.statusCode).to.equal(401);
      expect(res.body.error).to.equal('Authentication required');
    });

    it('reports session status to the owner', async () => {
      const { code } = await createSession();
      await joinClicker(code);

      const res = await request({ path: `/api/sessions/${code.toLowerCase()}`, method: 'GET', headers: authHeaders() });
      expect(res.statusCode).to.equal(200);
      expect(res.body.code).to.equal(code);
      expect(res.body.presenterCount).to.equal(1);
      expect(res.body.producerConnected).to.equal(true);
      expect(res.body).to.not.have.property('producerToken');
    });

    it('hides another user\'s session behind 403', async () => {
      const { code } = await createSession();

      const signup = await request(
        { path: '/api/signup', method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-Proto': 'https' } },
        { email: 'apisnoop@example.com', password: 'password123' }
      );
      const otherCookie = signup.cookies.map((c) => c.split(';')[0]).join('; ');

      const res = await request({
        path: `/api/sessions/${code}`, method: 'GET',
        headers: { Cookie: otherCookie, 'X-Forwarded-Proto': 'https' }
      });
      expect(res.statusCode).to.equal(403);
    });

    it('404s an unknown code', async () => {
      const res = await request({ path: '/api/sessions/ZZZZZZ', method: 'GET', headers: authHeaders() });
      expect(res.statusCode).to.equal(404);
    });
  });

  describe('session control API', () => {
    it('drives lock, notes, timer and features, and clients see each change', async () => {
      const { code } = await createSession();
      const { clicker } = await joinClicker(code);

      const locked = once(clicker, 'lock-changed');
      const notes = once(clicker, 'notes-changed');
      const timer = once(clicker, 'timer-changed');
      const features = once(clicker, 'features-changed');

      const res = await request(
        { path: `/api/sessions/${code}`, method: 'PATCH', headers: authHeaders() },
        { locked: true, notes: 'from the api', timerMinutes: 3, features: { messagesEnabled: true } }
      );

      expect(res.statusCode).to.equal(200);
      expect(res.body.locked).to.equal(true);
      expect(res.body.notes).to.equal('from the api');
      expect(res.body.timer).to.equal(180);
      expect(res.body.features.messagesEnabled).to.equal(true);

      expect((await locked).locked).to.equal(true);
      expect((await notes).notes).to.equal('from the api');
      expect((await timer).timer).to.equal(180);
      expect((await features).features.messagesEnabled).to.equal(true);
    });

    it('advances the deck', async () => {
      const { code } = await createSession();
      const { clicker } = await joinClicker(code);

      const advance = once(clicker, 'advance');
      const res = await request(
        { path: `/api/sessions/${code}/advance`, method: 'POST', headers: authHeaders() },
        { direction: 'prev' }
      );
      expect(res.statusCode).to.equal(200);
      expect((await advance).direction).to.equal('prev');
    });

    it('rejects an unknown advance direction', async () => {
      const { code } = await createSession();
      const res = await request(
        { path: `/api/sessions/${code}/advance`, method: 'POST', headers: authHeaders() },
        { direction: 'sideways' }
      );
      expect(res.statusCode).to.equal(400);
    });

    it('lists presenters and suspends one', async () => {
      const { code } = await createSession();
      const { clicker } = await joinClicker(code, 'Suspend Me');

      const list = await request({ path: `/api/sessions/${code}/presenters`, method: 'GET', headers: authHeaders() });
      expect(list.body.presenters).to.have.lengthOf(1);
      const presenterId = list.body.presenters[0].id;

      const changed = once(clicker, 'click-access-changed');
      const res = await request(
        { path: `/api/sessions/${code}/presenters/${presenterId}`, method: 'PATCH', headers: authHeaders() },
        { clickAccessEnabled: false }
      );
      expect(res.statusCode).to.equal(200);
      expect((await changed).clickAccessEnabled).to.equal(false);
    });

    it('404s an unknown presenter', async () => {
      const { code } = await createSession();
      const res = await request(
        { path: `/api/sessions/${code}/presenters/nobody`, method: 'PATCH', headers: authHeaders() },
        { clickAccessEnabled: true }
      );
      expect(res.statusCode).to.equal(404);
    });

    it('sends Speaker Chat only when the feature is on', async () => {
      const { code } = await createSession();
      const { clicker } = await joinClicker(code);

      const blocked = await request(
        { path: `/api/sessions/${code}/message`, method: 'POST', headers: authHeaders() },
        { message: 'too early' }
      );
      expect(blocked.statusCode).to.equal(409);

      await request(
        { path: `/api/sessions/${code}`, method: 'PATCH', headers: authHeaders() },
        { features: { messagesEnabled: true } }
      );

      const received = once(clicker, 'message-received');
      const res = await request(
        { path: `/api/sessions/${code}/message`, method: 'POST', headers: authHeaders() },
        { message: 'hello over http' }
      );
      expect(res.body.delivered).to.equal(1);
      expect((await received).message).to.equal('hello over http');
    });

    it('prompts anonymous presenters for a name', async () => {
      const { producer, code, token } = await createSession();
      producer.emit('set-require-name', { code, token, requireName: false });
      await once(producer, 'require-name-updated');

      const anon = connect();
      await once(anon, 'connect');
      anon.emit('join-session', { code, role: 'clicker' });
      await once(anon, 'session-joined');

      const prompted = once(anon, 'name-prompt');
      const res = await request({ path: `/api/sessions/${code}/prompt-name`, method: 'POST', headers: authHeaders() });
      expect(res.body.prompted).to.equal(1);
      await prompted;
    });

    it('reports full detail for the owner', async () => {
      const { code } = await createSession();
      await joinClicker(code, 'Detail Tester');

      const res = await request({ path: `/api/sessions/${code}/detail`, method: 'GET', headers: authHeaders() });
      expect(res.statusCode).to.equal(200);
      expect(res.body.presenters[0].displayName).to.equal('Detail Tester');
      expect(res.body.features).to.have.property('screenshotEnabled');
      expect(res.body).to.have.property('notes');
    });

    it('requires authentication', async () => {
      const { code } = await createSession();
      const res = await request(
        { path: `/api/sessions/${code}`, method: 'PATCH', headers: { 'Content-Type': 'application/json' } },
        { locked: true }
      );
      expect(res.statusCode).to.equal(401);
    });
  });

  describe('HTTP session lookup', () => {
    it('exposes public session info via /api/session/:code', async () => {
      const { code } = await createSession();
      const res = await request({ path: `/api/session/${code.toLowerCase()}`, method: 'GET' });
      expect(res.statusCode).to.equal(200);
      expect(res.body).to.deep.equal({ code, requireName: true, locked: false });
    });

    it('404s for unknown codes', async () => {
      const res = await request({ path: '/api/session/ZZZZZZ', method: 'GET' });
      expect(res.statusCode).to.equal(404);
    });
  });
});
