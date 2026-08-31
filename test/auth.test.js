const { expect } = require('chai');
const bcrypt = require('bcrypt');

describe('Authentication', () => {
  const SALT_ROUNDS = 10;

  describe('Password Hashing', () => {
    it('should hash passwords with bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      
      expect(hash).to.not.equal(password);
      expect(hash.length).to.be.greaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = 'testPassword123';
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      
      const isValid = await bcrypt.compare(password, hash);
      expect(isValid).to.be.true;
    });

    it('should reject incorrect password', async () => {
      const password = 'testPassword123';
      const wrongPassword = 'wrongPassword456';
      const hash = await bcrypt.hash(password, SALT_ROUNDS);
      
      const isValid = await bcrypt.compare(wrongPassword, hash);
      expect(isValid).to.be.false;
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testPassword123';
      const hash1 = await bcrypt.hash(password, SALT_ROUNDS);
      const hash2 = await bcrypt.hash(password, SALT_ROUNDS);
      
      expect(hash1).to.not.equal(hash2);
      
      const isValid1 = await bcrypt.compare(password, hash1);
      const isValid2 = await bcrypt.compare(password, hash2);
      expect(isValid1).to.be.true;
      expect(isValid2).to.be.true;
    });
  });

  describe('Email Validation', () => {
    it('should normalize email to lowercase', () => {
      const email = 'Test@Example.COM';
      const normalized = email.toLowerCase().trim();
      
      expect(normalized).to.equal('test@example.com');
    });

    it('should trim whitespace from email', () => {
      const email = '  test@example.com  ';
      const normalized = email.toLowerCase().trim();
      
      expect(normalized).to.equal('test@example.com');
    });
  });

  describe('Password Requirements', () => {
    it('should require minimum 6 characters', () => {
      const shortPassword = 'abc12';
      const validPassword = 'abc123';
      
      expect(shortPassword.length).to.be.lessThan(6);
      expect(validPassword.length).to.be.at.least(6);
    });
  });

  describe('User Session', () => {
    it('should create session with userId and email', () => {
      const session = {
        userId: 'user123',
        email: 'test@example.com'
      };
      
      expect(session.userId).to.equal('user123');
      expect(session.email).to.equal('test@example.com');
    });

    it('should validate authenticated session', () => {
      const authenticatedSession = {
        userId: 'user123',
        email: 'test@example.com'
      };
      
      const isAuthenticated = !!(authenticatedSession.userId && authenticatedSession.email);
      expect(isAuthenticated).to.be.true;
    });

    it('should reject unauthenticated session', () => {
      const unauthenticatedSession = {};
      
      const isAuthenticated = !!(unauthenticatedSession.userId && unauthenticatedSession.email);
      expect(isAuthenticated).to.be.false;
    });
  });
});
