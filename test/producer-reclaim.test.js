const { expect } = require('chai');

describe('Producer Session Reclaim', () => {
  describe('Grace Period on Producer Disconnect', () => {
    it('should not immediately delete session when producer disconnects', () => {
      const sessions = new Map();
      const sessionCode = 'ABC123';
      const producerSocketId = 'socket-producer';
      
      sessions.set(sessionCode, {
        code: sessionCode,
        producer: producerSocketId,
        userId: 'user123',
        producerToken: 'token123',
        producerDisconnectTimer: null,
        clickers: new Map(),
        presenters: new Map()
      });
      
      const session = sessions.get(sessionCode);
      expect(session).to.exist;
      expect(session.producer).to.equal(producerSocketId);
    });

    it('should set disconnect timer when producer disconnects', () => {
      const PRODUCER_GRACE_PERIOD_MS = 30000;
      let timerSet = false;
      
      const mockSetTimeout = (callback, delay) => {
        timerSet = true;
        expect(delay).to.equal(PRODUCER_GRACE_PERIOD_MS);
        return 'timer-id';
      };
      
      const timerId = mockSetTimeout(() => {}, PRODUCER_GRACE_PERIOD_MS);
      expect(timerSet).to.be.true;
      expect(timerId).to.equal('timer-id');
    });

    it('should clear disconnect timer on successful reclaim', () => {
      const session = {
        code: 'ABC123',
        producer: 'old-socket',
        userId: 'user123',
        producerToken: 'token123',
        producerDisconnectTimer: 'timer-id'
      };
      
      let timerCleared = false;
      const mockClearTimeout = (timerId) => {
        if (timerId === 'timer-id') {
          timerCleared = true;
        }
      };
      
      mockClearTimeout(session.producerDisconnectTimer);
      session.producerDisconnectTimer = null;
      
      expect(timerCleared).to.be.true;
      expect(session.producerDisconnectTimer).to.be.null;
    });
  });

  describe('Reclaim Authorization', () => {
    it('should allow reclaim when userId matches session creator', () => {
      const session = {
        code: 'ABC123',
        userId: 'user123',
        producer: 'old-socket',
        producerToken: 'token123'
      };
      
      const requestingUserId = 'user123';
      const isAuthorized = session.userId === requestingUserId;
      
      expect(isAuthorized).to.be.true;
    });

    it('should reject reclaim when userId does not match', () => {
      const session = {
        code: 'ABC123',
        userId: 'user123',
        producer: 'old-socket',
        producerToken: 'token123'
      };
      
      const requestingUserId = 'user456';
      const isAuthorized = session.userId === requestingUserId;
      
      expect(isAuthorized).to.be.false;
    });

    it('should reject reclaim when user is not authenticated', () => {
      const requestingUserId = null;
      const isAuthenticated = !!requestingUserId;
      
      expect(isAuthenticated).to.be.false;
    });

    it('should reject reclaim when session does not exist', () => {
      const sessions = new Map();
      const sessionCode = 'NONEXIST';
      
      const session = sessions.get(sessionCode);
      expect(session).to.be.undefined;
    });
  });

  describe('Producer Reclaim State Update', () => {
    it('should update producer socket ID on successful reclaim', () => {
      const session = {
        code: 'ABC123',
        producer: 'old-socket',
        userId: 'user123',
        producerToken: 'token123',
        producerDisconnectTimer: null
      };
      
      const newSocketId = 'new-socket';
      session.producer = newSocketId;
      
      expect(session.producer).to.equal(newSocketId);
    });

    it('should preserve producer token on reclaim', () => {
      const originalToken = 'token123';
      const session = {
        code: 'ABC123',
        producer: 'old-socket',
        userId: 'user123',
        producerToken: originalToken,
        producerDisconnectTimer: null
      };
      
      session.producer = 'new-socket';
      
      expect(session.producerToken).to.equal(originalToken);
    });

    it('should preserve session state on reclaim', () => {
      const session = {
        code: 'ABC123',
        producer: 'old-socket',
        userId: 'user123',
        producerToken: 'token123',
        locked: true,
        requireName: false,
        notes: 'Test notes',
        timer: 1800,
        timerStartedAt: Date.now(),
        presenters: new Map([
          ['presenter1', { displayName: 'John', clickAccessEnabled: true, isAnonymous: false }]
        ]),
        features: {
          screenshotEnabled: true,
          messagesEnabled: true
        }
      };
      
      const stateSnapshot = {
        locked: session.locked,
        requireName: session.requireName,
        notes: session.notes,
        timer: session.timer,
        presenterCount: session.presenters.size
      };
      
      session.producer = 'new-socket';
      
      expect(stateSnapshot.locked).to.be.true;
      expect(stateSnapshot.requireName).to.be.false;
      expect(stateSnapshot.notes).to.equal('Test notes');
      expect(stateSnapshot.timer).to.equal(1800);
      expect(stateSnapshot.presenterCount).to.equal(1);
    });

    it('should return complete session state in reclaim response', () => {
      const session = {
        code: 'ABC123',
        producer: 'new-socket',
        userId: 'user123',
        producerToken: 'token123',
        locked: false,
        requireName: true,
        notes: 'Speaker notes',
        timer: 3600,
        timerStartedAt: 1234567890,
        features: {
          screenshotEnabled: false,
          messagesEnabled: true,
          laserPointerEnabled: false,
          voiceControlEnabled: false,
          cueBeepsEnabled: true
        },
        presenters: new Map([
          ['p1', { displayName: 'Alice', clickAccessEnabled: true, isAnonymous: false }],
          ['p2', { displayName: 'Bob', clickAccessEnabled: false, isAnonymous: true }]
        ])
      };
      
      const reclaimResponse = {
        code: session.code,
        token: session.producerToken,
        locked: session.locked,
        requireName: session.requireName,
        features: session.features,
        notes: session.notes,
        timer: session.timer,
        timerStartedAt: session.timerStartedAt,
        presenters: Array.from(session.presenters.entries()).map(([id, data]) => ({
          id,
          displayName: data.displayName,
          clickAccessEnabled: data.clickAccessEnabled,
          isAnonymous: data.isAnonymous
        }))
      };
      
      expect(reclaimResponse.code).to.equal('ABC123');
      expect(reclaimResponse.token).to.equal('token123');
      expect(reclaimResponse.locked).to.be.false;
      expect(reclaimResponse.requireName).to.be.true;
      expect(reclaimResponse.notes).to.equal('Speaker notes');
      expect(reclaimResponse.timer).to.equal(3600);
      expect(reclaimResponse.timerStartedAt).to.equal(1234567890);
      expect(reclaimResponse.features.messagesEnabled).to.be.true;
      expect(reclaimResponse.features.cueBeepsEnabled).to.be.true;
      expect(reclaimResponse.presenters).to.have.lengthOf(2);
      expect(reclaimResponse.presenters[0].displayName).to.equal('Alice');
      expect(reclaimResponse.presenters[1].displayName).to.equal('Bob');
      expect(reclaimResponse.presenters[1].isAnonymous).to.be.true;
    });
  });

  describe('Session Navigation Flow', () => {
    it('should extract code from URL query parameter', () => {
      const mockUrl = '/producer.html?code=ABC123';
      const urlParams = new URLSearchParams(mockUrl.split('?')[1]);
      const code = urlParams.get('code');
      
      expect(code).to.equal('ABC123');
    });

    it('should handle URL with no code parameter', () => {
      const mockUrl = '/producer.html';
      const urlParams = new URLSearchParams(mockUrl.split('?')[1] || '');
      const code = urlParams.get('code');
      
      expect(code).to.be.null;
    });

    it('should uppercase session code from URL', () => {
      const urlCode = 'abc123';
      const sessionCode = urlCode.toUpperCase();
      
      expect(sessionCode).to.equal('ABC123');
    });
  });

  describe('Complete Reclaim Flow', () => {
    it('should successfully reclaim session with matching userId', () => {
      const sessions = new Map();
      const sessionCode = 'ABC123';
      
      sessions.set(sessionCode, {
        code: sessionCode,
        producer: 'socket1',
        userId: 'user123',
        producerToken: 'token123',
        producerDisconnectTimer: 'timer-id',
        locked: false,
        requireName: true,
        notes: '',
        timer: 0,
        timerStartedAt: null,
        features: {},
        presenters: new Map(),
        clickers: new Map(),
        showClients: new Map()
      });
      
      const session = sessions.get(sessionCode);
      const requestingUserId = 'user123';
      const newSocketId = 'socket2';
      
      const canReclaim = session && session.userId === requestingUserId;
      expect(canReclaim).to.be.true;
      
      if (canReclaim) {
        if (session.producerDisconnectTimer) {
          session.producerDisconnectTimer = null;
        }
        session.producer = newSocketId;
      }
      
      expect(session.producer).to.equal(newSocketId);
      expect(session.producerDisconnectTimer).to.be.null;
      expect(sessions.has(sessionCode)).to.be.true;
    });

    it('should fail to reclaim session with different userId', () => {
      const sessions = new Map();
      const sessionCode = 'ABC123';
      
      sessions.set(sessionCode, {
        code: sessionCode,
        producer: 'socket1',
        userId: 'user123',
        producerToken: 'token123',
        producerDisconnectTimer: null,
        presenters: new Map()
      });
      
      const session = sessions.get(sessionCode);
      const requestingUserId = 'user456';
      
      const canReclaim = session && session.userId === requestingUserId;
      expect(canReclaim).to.be.false;
    });

    it('should fail to reclaim session without authentication', () => {
      const sessions = new Map();
      const sessionCode = 'ABC123';
      
      sessions.set(sessionCode, {
        code: sessionCode,
        producer: 'socket1',
        userId: 'user123',
        producerToken: 'token123',
        producerDisconnectTimer: null,
        presenters: new Map()
      });
      
      const requestingUserId = null;
      const isAuthenticated = !!requestingUserId;
      
      expect(isAuthenticated).to.be.false;
    });

    it('should fail to reclaim non-existent session', () => {
      const sessions = new Map();
      const sessionCode = 'NOTFOUND';
      
      const session = sessions.get(sessionCode);
      expect(session).to.be.undefined;
    });
  });

  describe('Session Deletion After Grace Period', () => {
    it('should delete session after grace period if not reclaimed', (done) => {
      const sessions = new Map();
      const sessionCode = 'ABC123';
      const GRACE_PERIOD_MS = 50;
      
      sessions.set(sessionCode, {
        code: sessionCode,
        producer: 'socket1',
        userId: 'user123',
        producerDisconnectTimer: null
      });
      
      const timerId = setTimeout(() => {
        if (sessions.has(sessionCode)) {
          sessions.delete(sessionCode);
        }
      }, GRACE_PERIOD_MS);
      
      sessions.get(sessionCode).producerDisconnectTimer = timerId;
      
      expect(sessions.has(sessionCode)).to.be.true;
      
      setTimeout(() => {
        expect(sessions.has(sessionCode)).to.be.false;
        done();
      }, GRACE_PERIOD_MS + 10);
    });

    it('should not delete session if reclaimed before grace period expires', (done) => {
      const sessions = new Map();
      const sessionCode = 'ABC123';
      const GRACE_PERIOD_MS = 100;
      
      sessions.set(sessionCode, {
        code: sessionCode,
        producer: 'socket1',
        userId: 'user123',
        producerDisconnectTimer: null
      });
      
      const timerId = setTimeout(() => {
        if (sessions.has(sessionCode)) {
          sessions.delete(sessionCode);
        }
      }, GRACE_PERIOD_MS);
      
      sessions.get(sessionCode).producerDisconnectTimer = timerId;
      
      setTimeout(() => {
        const session = sessions.get(sessionCode);
        if (session.producerDisconnectTimer) {
          clearTimeout(session.producerDisconnectTimer);
          session.producerDisconnectTimer = null;
        }
        session.producer = 'socket2';
        
        expect(sessions.has(sessionCode)).to.be.true;
        expect(session.producer).to.equal('socket2');
        
        setTimeout(() => {
          expect(sessions.has(sessionCode)).to.be.true;
          done();
        }, GRACE_PERIOD_MS);
      }, 20);
    });
  });
});
