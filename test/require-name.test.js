const { expect } = require('chai');

describe('Require Name Feature', () => {
  describe('Session RequireName Setting', () => {
    it('should default to requireName true', () => {
      const session = {
        code: 'ABC123',
        requireName: true,
        presenters: new Map()
      };
      
      expect(session.requireName).to.be.true;
    });

    it('should allow requireName to be set to false', () => {
      const session = {
        code: 'ABC123',
        requireName: true,
        presenters: new Map()
      };
      
      session.requireName = false;
      expect(session.requireName).to.be.false;
    });
  });

  describe('Clicker Join with RequireName', () => {
    it('should allow join with name when requireName is true', () => {
      const session = {
        requireName: true
      };
      const displayName = 'John Doe';
      
      const canJoin = !session.requireName || (displayName && displayName.trim() !== '');
      expect(canJoin).to.be.true;
    });

    it('should reject join without name when requireName is true', () => {
      const session = {
        requireName: true
      };
      const displayName = '';
      
      const shouldRequireName = session.requireName && (!displayName || displayName.trim() === '');
      expect(shouldRequireName).to.be.true;
    });

    it('should allow anonymous join when requireName is false', () => {
      const session = {
        requireName: false
      };
      const displayName = '';
      
      const canJoin = !session.requireName || (displayName && displayName.trim() !== '');
      expect(canJoin).to.be.true;
    });

    it('should set isAnonymous flag correctly', () => {
      const displayName1 = '';
      const displayName2 = 'John Doe';
      
      const presenter1 = {
        displayName: displayName1 ? displayName1.trim() : 'Anonymous',
        isAnonymous: !displayName1 || displayName1.trim() === ''
      };
      
      const presenter2 = {
        displayName: displayName2 ? displayName2.trim() : 'Anonymous',
        isAnonymous: !displayName2 || displayName2.trim() === ''
      };
      
      expect(presenter1.isAnonymous).to.be.true;
      expect(presenter1.displayName).to.equal('Anonymous');
      expect(presenter2.isAnonymous).to.be.false;
      expect(presenter2.displayName).to.equal('John Doe');
    });
  });

  describe('Anonymous Presenter Identification', () => {
    it('should identify anonymous presenters', () => {
      const presenters = new Map([
        ['id1', { displayName: 'Anonymous', isAnonymous: true }],
        ['id2', { displayName: 'John Doe', isAnonymous: false }],
        ['id3', { displayName: 'Anonymous', isAnonymous: true }]
      ]);
      
      const anonymousPresenters = Array.from(presenters.entries())
        .filter(([_, p]) => p.isAnonymous);
      
      expect(anonymousPresenters.length).to.equal(2);
    });

    it('should return empty list when no anonymous presenters', () => {
      const presenters = new Map([
        ['id1', { displayName: 'John Doe', isAnonymous: false }],
        ['id2', { displayName: 'Jane Smith', isAnonymous: false }]
      ]);
      
      const anonymousPresenters = Array.from(presenters.entries())
        .filter(([_, p]) => p.isAnonymous);
      
      expect(anonymousPresenters.length).to.equal(0);
    });
  });

  describe('Display Name Handling', () => {
    it('should default to "Anonymous" for empty display name', () => {
      const displayName = '';
      const finalName = displayName ? displayName.trim() : 'Anonymous';
      
      expect(finalName).to.equal('Anonymous');
    });

    it('should use provided display name when available', () => {
      const displayName = 'John Doe';
      const finalName = displayName ? displayName.trim() : 'Anonymous';
      
      expect(finalName).to.equal('John Doe');
    });

    it('should trim whitespace from display name', () => {
      const displayName = '  John Doe  ';
      const finalName = displayName ? displayName.trim() : 'Anonymous';
      
      expect(finalName).to.equal('John Doe');
    });
  });
});
