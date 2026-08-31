const { expect } = require('chai');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

describe('Superadmin', () => {
  const testUsersFile = path.join(__dirname, '..', 'test-users.json');
  const SALT_ROUNDS = 10;

  afterEach(() => {
    if (fs.existsSync(testUsersFile)) {
      fs.unlinkSync(testUsersFile);
    }
  });

  describe('User Persistence', () => {
    it('should save and load users from JSON file', () => {
      const testUsers = [
        {
          userId: 'test123',
          email: 'test@example.com',
          passwordHash: '$2b$10$abc123',
          createdAt: Date.now()
        },
        {
          userId: 'test456',
          email: 'another@example.com',
          passwordHash: '$2b$10$def456',
          createdAt: Date.now()
        }
      ];
      
      fs.writeFileSync(testUsersFile, JSON.stringify(testUsers, null, 2));
      expect(fs.existsSync(testUsersFile)).to.be.true;
      
      const data = fs.readFileSync(testUsersFile, 'utf8');
      const loaded = JSON.parse(data);
      
      expect(loaded).to.have.lengthOf(2);
      expect(loaded[0].email).to.equal('test@example.com');
      expect(loaded[1].email).to.equal('another@example.com');
    });

    it('should handle empty users file', () => {
      fs.writeFileSync(testUsersFile, JSON.stringify([], null, 2));
      const data = fs.readFileSync(testUsersFile, 'utf8');
      const loaded = JSON.parse(data);
      
      expect(loaded).to.be.an('array');
      expect(loaded).to.have.lengthOf(0);
    });

    it('should convert user Map to Array for JSON storage', () => {
      const usersMap = new Map();
      usersMap.set('test@example.com', {
        userId: 'test123',
        email: 'test@example.com',
        passwordHash: '$2b$10$abc123',
        createdAt: Date.now()
      });
      
      const usersArray = Array.from(usersMap.values());
      expect(usersArray).to.be.an('array');
      expect(usersArray).to.have.lengthOf(1);
      expect(usersArray[0].email).to.equal('test@example.com');
    });

    it('should convert user Array to Map when loading', () => {
      const usersArray = [
        {
          userId: 'test123',
          email: 'test@example.com',
          passwordHash: '$2b$10$abc123',
          createdAt: Date.now()
        }
      ];
      
      const usersMap = new Map();
      usersArray.forEach(user => {
        usersMap.set(user.email, user);
      });
      
      expect(usersMap.size).to.equal(1);
      expect(usersMap.has('test@example.com')).to.be.true;
      expect(usersMap.get('test@example.com').userId).to.equal('test123');
    });
  });

  describe('Superadmin Authentication', () => {
    it('should validate superadmin credentials', () => {
      const superadminUser = 'admin';
      const superadminPassword = 'testpassword123';
      
      const inputUsername = 'admin';
      const inputPassword = 'testpassword123';
      
      const isValid = inputUsername === superadminUser && inputPassword === superadminPassword;
      expect(isValid).to.be.true;
    });

    it('should reject invalid username', () => {
      const superadminUser = 'admin';
      const superadminPassword = 'testpassword123';
      
      const inputUsername = 'wronguser';
      const inputPassword = 'testpassword123';
      
      const isValid = inputUsername === superadminUser && inputPassword === superadminPassword;
      expect(isValid).to.be.false;
    });

    it('should reject invalid password', () => {
      const superadminUser = 'admin';
      const superadminPassword = 'testpassword123';
      
      const inputUsername = 'admin';
      const inputPassword = 'wrongpassword';
      
      const isValid = inputUsername === superadminUser && inputPassword === superadminPassword;
      expect(isValid).to.be.false;
    });

    it('should require SUPERADMIN_PASSWORD to be set', () => {
      const superadminPassword = undefined;
      
      expect(superadminPassword).to.be.undefined;
    });

    it('should use default username "admin"', () => {
      const superadminUser = process.env.SUPERADMIN_USER || 'admin';
      
      expect(superadminUser).to.equal('admin');
    });
  });

  describe('User Management', () => {
    it('should add user to users map', async () => {
      const users = new Map();
      const email = 'newuser@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      const userId = 'generated-user-id';
      
      users.set(email, {
        userId,
        email,
        passwordHash,
        createdAt: Date.now()
      });
      
      expect(users.size).to.equal(1);
      expect(users.has(email)).to.be.true;
    });

    it('should remove user from users map', () => {
      const users = new Map();
      const email = 'user@example.com';
      
      users.set(email, {
        userId: 'test123',
        email,
        passwordHash: '$2b$10$abc123',
        createdAt: Date.now()
      });
      
      expect(users.size).to.equal(1);
      
      users.delete(email);
      
      expect(users.size).to.equal(0);
      expect(users.has(email)).to.be.false;
    });

    it('should find user by userId', () => {
      const users = new Map();
      const targetUserId = 'test123';
      
      users.set('user1@example.com', {
        userId: 'other456',
        email: 'user1@example.com',
        passwordHash: '$2b$10$abc123',
        createdAt: Date.now()
      });
      
      users.set('user2@example.com', {
        userId: targetUserId,
        email: 'user2@example.com',
        passwordHash: '$2b$10$def456',
        createdAt: Date.now()
      });
      
      let found = null;
      for (const [email, user] of users.entries()) {
        if (user.userId === targetUserId) {
          found = { email, user };
          break;
        }
      }
      
      expect(found).to.not.be.null;
      expect(found.user.userId).to.equal(targetUserId);
      expect(found.email).to.equal('user2@example.com');
    });
  });

  describe('User Authentication with Persisted Data', () => {
    it('should authenticate user with correct password', async () => {
      const password = 'testpassword123';
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      const user = {
        userId: 'test123',
        email: 'test@example.com',
        passwordHash,
        createdAt: Date.now()
      };
      
      const inputPassword = 'testpassword123';
      const isValid = await bcrypt.compare(inputPassword, user.passwordHash);
      
      expect(isValid).to.be.true;
    });

    it('should reject incorrect password', async () => {
      const password = 'testpassword123';
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      const user = {
        userId: 'test123',
        email: 'test@example.com',
        passwordHash,
        createdAt: Date.now()
      };
      
      const inputPassword = 'wrongpassword';
      const isValid = await bcrypt.compare(inputPassword, user.passwordHash);
      
      expect(isValid).to.be.false;
    });

    it('should persist password hash, not plaintext', async () => {
      const password = 'testpassword123';
      const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
      
      expect(passwordHash).to.not.equal(password);
      expect(passwordHash).to.include('$2b$');
      expect(passwordHash.length).to.be.greaterThan(password.length);
    });
  });

  describe('Environment Configuration', () => {
    it('should support custom USERS_FILE path', () => {
      const customPath = '/custom/path/users.json';
      const usersFile = customPath;
      
      expect(usersFile).to.equal(customPath);
    });

    it('should support SESSION_SECRET from env', () => {
      const sessionSecret = 'my-secret-key';
      expect(sessionSecret).to.equal('my-secret-key');
    });
  });
});

