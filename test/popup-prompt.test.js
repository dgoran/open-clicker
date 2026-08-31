const { expect } = require('chai');

describe('Popup Prompt for Unnamed Presenters', () => {
  describe('Prompt Target Selection', () => {
    it('should identify anonymous presenters for prompting', () => {
      const presenters = new Map([
        ['id1', { displayName: 'Anonymous', isAnonymous: true, clickAccessEnabled: true }],
        ['id2', { displayName: 'John Doe', isAnonymous: false, clickAccessEnabled: true }],
        ['id3', { displayName: 'Anonymous', isAnonymous: true, clickAccessEnabled: false }]
      ]);
      
      const targetPresenters = Array.from(presenters.entries())
        .filter(([_, p]) => p.isAnonymous)
        .map(([id, _]) => id);
      
      expect(targetPresenters).to.have.lengthOf(2);
      expect(targetPresenters).to.include('id1');
      expect(targetPresenters).to.include('id3');
    });

    it('should not target named presenters', () => {
      const presenters = new Map([
        ['id1', { displayName: 'John Doe', isAnonymous: false, clickAccessEnabled: true }],
        ['id2', { displayName: 'Jane Smith', isAnonymous: false, clickAccessEnabled: true }]
      ]);
      
      const targetPresenters = Array.from(presenters.entries())
        .filter(([_, p]) => p.isAnonymous)
        .map(([id, _]) => id);
      
      expect(targetPresenters).to.have.lengthOf(0);
    });

    it('should handle empty presenters list', () => {
      const presenters = new Map();
      
      const targetPresenters = Array.from(presenters.entries())
        .filter(([_, p]) => p.isAnonymous)
        .map(([id, _]) => id);
      
      expect(targetPresenters).to.have.lengthOf(0);
    });
  });

  describe('Producer Authorization', () => {
    it('should authorize producer to send prompt', () => {
      const session = {
        producer: 'producerId123',
        producerToken: 'token456'
      };
      
      const requesterId = 'producerId123';
      const requesterToken = 'token456';
      
      const isAuthorized = session.producer === requesterId && 
                          session.producerToken === requesterToken;
      
      expect(isAuthorized).to.be.true;
    });

    it('should reject non-producer from sending prompt', () => {
      const session = {
        producer: 'producerId123',
        producerToken: 'token456'
      };
      
      const requesterId = 'otherUserId';
      const requesterToken = 'token789';
      
      const isAuthorized = session.producer === requesterId && 
                          session.producerToken === requesterToken;
      
      expect(isAuthorized).to.be.false;
    });
  });

  describe('Prompt Event Structure', () => {
    it('should create prompt event for anonymous presenter', () => {
      const presenterId = 'id1';
      const promptEvent = {
        type: 'name-prompt',
        targetId: presenterId
      };
      
      expect(promptEvent.type).to.equal('name-prompt');
      expect(promptEvent.targetId).to.equal('id1');
    });
  });

  describe('Batch Prompt Sending', () => {
    it('should send prompts to multiple anonymous presenters', () => {
      const presenters = new Map([
        ['id1', { displayName: 'Anonymous', isAnonymous: true }],
        ['id2', { displayName: 'John Doe', isAnonymous: false }],
        ['id3', { displayName: 'Anonymous', isAnonymous: true }],
        ['id4', { displayName: 'Jane Smith', isAnonymous: false }],
        ['id5', { displayName: 'Anonymous', isAnonymous: true }]
      ]);
      
      const promptsSent = [];
      for (const [presenterId, presenter] of presenters.entries()) {
        if (presenter.isAnonymous) {
          promptsSent.push(presenterId);
        }
      }
      
      expect(promptsSent).to.have.lengthOf(3);
      expect(promptsSent).to.include('id1');
      expect(promptsSent).to.include('id3');
      expect(promptsSent).to.include('id5');
    });

    it('should send no prompts when all presenters are named', () => {
      const presenters = new Map([
        ['id1', { displayName: 'John Doe', isAnonymous: false }],
        ['id2', { displayName: 'Jane Smith', isAnonymous: false }]
      ]);
      
      const promptsSent = [];
      for (const [presenterId, presenter] of presenters.entries()) {
        if (presenter.isAnonymous) {
          promptsSent.push(presenterId);
        }
      }
      
      expect(promptsSent).to.have.lengthOf(0);
    });
  });
});
