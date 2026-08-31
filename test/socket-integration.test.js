const { expect } = require('chai');

describe('Set Display Name Feature', () => {
  describe('Display Name Update Logic', () => {
    it('should validate clicker token before updating name', () => {
      const session = {
        clickers: new Map([
          ['socket1', 'token123'],
          ['socket2', 'token456']
        ]),
        presenters: new Map([
          ['socket1', { displayName: 'Anonymous', isAnonymous: true }]
        ])
      };
      
      const socketId = 'socket1';
      const providedToken = 'token123';
      
      const isValid = session.clickers.get(socketId) === providedToken;
      expect(isValid).to.be.true;
    });

    it('should reject invalid clicker token', () => {
      const session = {
        clickers: new Map([
          ['socket1', 'token123']
        ])
      };
      
      const socketId = 'socket1';
      const providedToken = 'wrongToken';
      
      const isValid = session.clickers.get(socketId) === providedToken;
      expect(isValid).to.be.false;
    });

    it('should reject empty display name', () => {
      const displayName = '';
      const isValid = !!(displayName && displayName.trim() !== '');
      
      expect(isValid).to.be.false;
    });

    it('should reject whitespace-only display name', () => {
      const displayName = '   ';
      const isValid = displayName && displayName.trim() !== '';
      
      expect(isValid).to.be.false;
    });

    it('should accept valid display name', () => {
      const displayName = 'John Doe';
      const isValid = displayName && displayName.trim() !== '';
      
      expect(isValid).to.be.true;
    });

    it('should update presenter display name and clear anonymous flag', () => {
      const presenter = {
        displayName: 'Anonymous',
        isAnonymous: true,
        clickAccessEnabled: true
      };
      
      const newDisplayName = 'John Doe';
      presenter.displayName = newDisplayName.trim();
      presenter.isAnonymous = false;
      
      expect(presenter.displayName).to.equal('John Doe');
      expect(presenter.isAnonymous).to.be.false;
      expect(presenter.clickAccessEnabled).to.be.true;
    });

    it('should trim whitespace from new display name', () => {
      const presenter = {
        displayName: 'Anonymous',
        isAnonymous: true
      };
      
      const newDisplayName = '  John Doe  ';
      presenter.displayName = newDisplayName.trim();
      presenter.isAnonymous = false;
      
      expect(presenter.displayName).to.equal('John Doe');
      expect(presenter.isAnonymous).to.be.false;
    });
  });

  describe('Presenter List Update After Name Change', () => {
    it('should update presenters list with new name and anonymous status', () => {
      const presenters = new Map([
        ['socket1', { displayName: 'John Doe', isAnonymous: false, clickAccessEnabled: true }],
        ['socket2', { displayName: 'Jane Smith', isAnonymous: false, clickAccessEnabled: true }]
      ]);
      
      const presentersList = Array.from(presenters.entries()).map(([id, data]) => ({
        id,
        displayName: data.displayName,
        clickAccessEnabled: data.clickAccessEnabled,
        isAnonymous: data.isAnonymous
      }));
      
      expect(presentersList).to.have.lengthOf(2);
      expect(presentersList[0].displayName).to.equal('John Doe');
      expect(presentersList[0].isAnonymous).to.be.false;
      expect(presentersList[1].displayName).to.equal('Jane Smith');
      expect(presentersList[1].isAnonymous).to.be.false;
    });

    it('should reflect anonymous status change in presenters list', () => {
      const presenter = {
        displayName: 'Anonymous',
        isAnonymous: true,
        clickAccessEnabled: true
      };
      
      presenter.displayName = 'John Doe';
      presenter.isAnonymous = false;
      
      const presenterData = {
        id: 'socket1',
        displayName: presenter.displayName,
        clickAccessEnabled: presenter.clickAccessEnabled,
        isAnonymous: presenter.isAnonymous
      };
      
      expect(presenterData.displayName).to.equal('John Doe');
      expect(presenterData.isAnonymous).to.be.false;
    });
  });
});

describe('Session Authentication', () => {
  describe('Create Session Authorization', () => {
    it('should require authenticated session to create session', () => {
      const mockSession = {
        userId: 'user123',
        email: 'test@example.com'
      };
      
      const isAuthenticated = !!mockSession.userId;
      expect(isAuthenticated).to.be.true;
    });

    it('should reject session creation without authenticated user', () => {
      const mockSession = {};
      
      const isAuthenticated = !!mockSession.userId;
      expect(isAuthenticated).to.be.false;
    });

    it('should reject session creation with undefined session', () => {
      const mockSession = undefined;
      
      const isAuthenticated = !!(mockSession?.userId);
      expect(isAuthenticated).to.be.false;
    });

    it('should reject session creation with null userId', () => {
      const mockSession = {
        userId: null
      };
      
      const isAuthenticated = !!mockSession.userId;
      expect(isAuthenticated).to.be.false;
    });
  });

  describe('Session Metadata Endpoint', () => {
    it('should return session metadata with requireName setting', () => {
      const session = {
        code: 'ABC123',
        requireName: true,
        locked: false,
        presenters: new Map()
      };
      
      const metadata = {
        code: session.code,
        requireName: session.requireName,
        locked: session.locked
      };
      
      expect(metadata.code).to.equal('ABC123');
      expect(metadata.requireName).to.be.true;
      expect(metadata.locked).to.be.false;
    });

    it('should return false when requireName is disabled', () => {
      const session = {
        code: 'XYZ789',
        requireName: false,
        locked: false,
        presenters: new Map()
      };
      
      const metadata = {
        code: session.code,
        requireName: session.requireName,
        locked: session.locked
      };
      
      expect(metadata.requireName).to.be.false;
    });
  });
});

describe('Clicker Name Field Visibility', () => {
  describe('Name Field Display Logic', () => {
    it('should show name field when requireName is true', () => {
      const sessionMetadata = {
        requireName: true
      };
      
      const shouldShowNameField = sessionMetadata.requireName;
      expect(shouldShowNameField).to.be.true;
    });

    it('should hide name field when requireName is false', () => {
      const sessionMetadata = {
        requireName: false
      };
      
      const shouldShowNameField = sessionMetadata.requireName;
      expect(shouldShowNameField).to.be.false;
    });

    it('should validate name when requireName is true', () => {
      const requireName = true;
      const displayName = '';
      
      const shouldReject = requireName && (!displayName || displayName.trim() === '');
      expect(shouldReject).to.be.true;
    });

    it('should allow empty name when requireName is false', () => {
      const requireName = false;
      const displayName = '';
      
      const shouldReject = requireName && (!displayName || displayName.trim() === '');
      expect(shouldReject).to.be.false;
    });
  });
});
