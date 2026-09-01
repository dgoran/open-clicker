const { expect } = require('chai');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

describe('Superadmin with SQLite', () => {
  let serverModule;
  let testDbPath;
  
  before(() => {
    testDbPath = path.join(__dirname, '..', 'test-users.sqlite');
    
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    process.env.USERS_DB = testDbPath;
    process.env.SESSION_SECRET = 'test-secret';
    process.env.SUPERADMIN_USER = 'admin';
    process.env.SUPERADMIN_PASSWORD = 'testpassword123';
    
    serverModule = require('../server.js');
  });

  after(() => {
    try {
      serverModule.closeDatabase();
    } catch (e) {
      // Ignore close errors
    }
    
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    try {
      const users = serverModule.getAllUsers();
      users.forEach(user => {
        serverModule.deleteUser(user.userId);
      });
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('SQLite Database Functions', () => {
    it('should create and retrieve a user', async () => {
      const email = 'test@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);
      
      const user = serverModule.createUser(email, passwordHash);
      
      expect(user).to.have.property('userId');
      expect(user).to.have.property('email', email);
      expect(user).to.have.property('createdAt');
      
      const retrieved = serverModule.getUser(email);
      expect(retrieved).to.not.be.undefined;
      expect(retrieved.email).to.equal(email);
      expect(retrieved.userId).to.equal(user.userId);
    });

    it('should store bcrypt hash, not plaintext password', async () => {
      const email = 'hash-test@example.com';
      const password = 'mySecretPassword123';
      const passwordHash = await bcrypt.hash(password, 10);
      
      serverModule.createUser(email, passwordHash);
      
      const retrieved = serverModule.getUser(email);
      expect(retrieved.passwordHash).to.not.equal(password);
      expect(retrieved.passwordHash).to.include('$2b$');
      expect(retrieved.passwordHash.length).to.be.greaterThan(password.length);
      
      const isValid = await bcrypt.compare(password, retrieved.passwordHash);
      expect(isValid).to.be.true;
    });

    it('should list all users without password hashes', () => {
      serverModule.createUser('user1@example.com', 'hash1');
      serverModule.createUser('user2@example.com', 'hash2');
      
      const users = serverModule.getAllUsers();
      
      expect(users).to.be.an('array');
      expect(users.length).to.be.at.least(2);
      
      const user = users.find(u => u.email === 'user1@example.com');
      expect(user).to.have.property('email');
      expect(user).to.have.property('userId');
      expect(user).to.have.property('createdAt');
      expect(user).to.not.have.property('passwordHash');
    });

    it('should delete a user by userId', async () => {
      const email = 'delete-test@example.com';
      const passwordHash = await bcrypt.hash('password', 10);
      const user = serverModule.createUser(email, passwordHash);
      
      const countBefore = serverModule.getUserCount();
      
      const deleted = serverModule.deleteUser(user.userId);
      expect(deleted).to.be.true;
      
      const countAfter = serverModule.getUserCount();
      expect(countAfter).to.equal(countBefore - 1);
      
      const retrieved = serverModule.getUser(email);
      expect(retrieved).to.be.undefined;
    });

    it('should return false when deleting non-existent user', () => {
      const deleted = serverModule.deleteUser('nonexistent-id');
      expect(deleted).to.be.false;
    });

    it('should handle empty or near-empty database', () => {
      const count = serverModule.getUserCount();
      expect(count).to.be.at.least(0);
      
      const users = serverModule.getAllUsers();
      expect(users).to.be.an('array');
    });

    it('should normalize email to lowercase', async () => {
      const email = 'Test@Example.COM';
      const passwordHash = await bcrypt.hash('password', 10);
      
      const user = serverModule.createUser(email, passwordHash);
      expect(user.email).to.equal('test@example.com');
      
      const retrieved = serverModule.getUser('TEST@EXAMPLE.COM');
      expect(retrieved).to.not.be.undefined;
      expect(retrieved.email).to.equal('test@example.com');
    });
  });

  describe('HTTP Superadmin Authentication', () => {
    let cookies = '';
    let serverStarted = false;
    let port = null;

    before((done) => {
      if (!serverModule.server.listening) {
        serverModule.server.listen(0, () => {
          serverStarted = true;
          port = serverModule.server.address().port;
          done();
        });
      } else {
        port = serverModule.server.address().port;
        done();
      }
    });

    after((done) => {
      if (serverStarted) {
        serverModule.server.close(() => done());
      } else {
        done();
      }
    });

    function makeRequest(options, postData = null) {
      return new Promise((resolve, reject) => {
        const reqOptions = {
          hostname: 'localhost',
          port,
          ...options,
          headers: {
            ...options.headers,
            'Cookie': cookies
          }
        };

        const req = http.request(reqOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            if (res.headers['set-cookie']) {
              cookies = res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ');
            }
            resolve({ statusCode: res.statusCode, data, headers: res.headers });
          });
        });

        req.on('error', reject);
        
        if (postData) {
          req.write(postData);
        }
        
        req.end();
      });
    }

    it('should reject superadmin login without SUPERADMIN_PASSWORD', async () => {
      const oldPassword = process.env.SUPERADMIN_PASSWORD;
      delete process.env.SUPERADMIN_PASSWORD;

      const postData = JSON.stringify({
        username: 'admin',
        password: 'testpassword123'
      });

      const response = await makeRequest({
        path: '/api/superadmin/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, postData);

      expect(response.statusCode).to.equal(500);
      const body = JSON.parse(response.data);
      expect(body.error).to.include('not configured');

      process.env.SUPERADMIN_PASSWORD = oldPassword;
    });

    it('should reject invalid superadmin credentials', async () => {
      const postData = JSON.stringify({
        username: 'admin',
        password: 'wrongpassword'
      });

      const response = await makeRequest({
        path: '/api/superadmin/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, postData);

      expect(response.statusCode).to.equal(401);
      const body = JSON.parse(response.data);
      expect(body.error).to.include('Invalid');
    });

    it('should accept valid superadmin credentials', async () => {
      const postData = JSON.stringify({
        username: 'admin',
        password: 'testpassword123'
      });

      const response = await makeRequest({
        path: '/api/superadmin/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      }, postData);

      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.data);
      expect(body.success).to.be.true;
    });
  });

  describe('Database Persistence', () => {
    it('should persist user data to database file on disk', async () => {
      const email = 'persist@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);
      
      serverModule.createUser(email, passwordHash);

      expect(fs.existsSync(testDbPath)).to.be.true;
      
      const stats = fs.statSync(testDbPath);
      expect(stats.size).to.be.greaterThan(0);
    });
  });
});
