const { expect } = require('chai');
const http = require('http');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');

describe('Session Cookie with Proxy', () => {
  let serverModule;
  let testDbPath;
  const baseURL = 'http://localhost:3001';
  
  before(() => {
    testDbPath = path.join(__dirname, '..', 'test-session-cookie.sqlite');
    
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    process.env.USERS_DB = testDbPath;
    process.env.SESSION_SECRET = 'test-secret-session';
    process.env.NODE_ENV = 'production';
    
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
    
    delete process.env.NODE_ENV;
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

  describe('Session Cookie Behavior Behind Proxy', () => {
    let serverStarted = false;

    before((done) => {
      if (!serverModule.server.listening) {
        serverModule.server.listen(3001, () => {
          serverStarted = true;
          done();
        });
      } else {
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
          port: 3001,
          ...options,
          headers: {
            ...options.headers
          }
        };

        const req = http.request(reqOptions, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({ 
              statusCode: res.statusCode, 
              data, 
              headers: res.headers,
              cookies: res.headers['set-cookie'] || []
            });
          });
        });

        req.on('error', reject);
        
        if (postData) {
          req.write(postData);
        }
        
        req.end();
      });
    }

    it('should set session cookie on signup with X-Forwarded-Proto header', async () => {
      const postData = JSON.stringify({
        email: 'newuser@example.com',
        password: 'password123'
      });

      const response = await makeRequest({
        path: '/api/signup',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Forwarded-Proto': 'https'
        }
      }, postData);

      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.data);
      expect(body.success).to.be.true;
      
      expect(response.cookies.length).to.be.greaterThan(0);
      const sessionCookie = response.cookies.find(c => c.startsWith('connect.sid='));
      expect(sessionCookie).to.exist;
      expect(sessionCookie).to.include('Secure');
      expect(sessionCookie).to.include('HttpOnly');
    });

    it('should set session cookie on login with X-Forwarded-Proto header', async () => {
      const email = 'loginuser@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);
      serverModule.createUser(email, passwordHash);

      const postData = JSON.stringify({
        email,
        password
      });

      const response = await makeRequest({
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Forwarded-Proto': 'https'
        }
      }, postData);

      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.data);
      expect(body.success).to.be.true;
      
      expect(response.cookies.length).to.be.greaterThan(0);
      const sessionCookie = response.cookies.find(c => c.startsWith('connect.sid='));
      expect(sessionCookie).to.exist;
      expect(sessionCookie).to.include('Secure');
      expect(sessionCookie).to.include('HttpOnly');
    });

    it('should return authenticated user on GET /api/me after login with session cookie', async () => {
      const email = 'authcheck@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);
      serverModule.createUser(email, passwordHash);

      const loginData = JSON.stringify({
        email,
        password
      });

      const loginResponse = await makeRequest({
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginData),
          'X-Forwarded-Proto': 'https'
        }
      }, loginData);

      expect(loginResponse.statusCode).to.equal(200);
      expect(loginResponse.cookies.length).to.be.greaterThan(0);
      
      const sessionCookie = loginResponse.cookies
        .find(c => c.startsWith('connect.sid='))
        .split(';')[0];

      const meResponse = await makeRequest({
        path: '/api/me',
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
          'X-Forwarded-Proto': 'https'
        }
      });

      expect(meResponse.statusCode).to.equal(200);
      const meBody = JSON.parse(meResponse.data);
      expect(meBody.authenticated).to.be.true;
      expect(meBody.email).to.equal(email);
      expect(meBody.userId).to.exist;
    });

    it('should set superadmin session cookie on superadmin login with X-Forwarded-Proto header', async () => {
      process.env.SUPERADMIN_USER = 'admin';
      process.env.SUPERADMIN_PASSWORD = 'testadminpass';

      const postData = JSON.stringify({
        username: 'admin',
        password: 'testadminpass'
      });

      const response = await makeRequest({
        path: '/api/superadmin/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'X-Forwarded-Proto': 'https'
        }
      }, postData);

      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.data);
      expect(body.success).to.be.true;
      
      expect(response.cookies.length).to.be.greaterThan(0);
      const sessionCookie = response.cookies.find(c => c.startsWith('connect.sid='));
      expect(sessionCookie).to.exist;
      expect(sessionCookie).to.include('Secure');
      expect(sessionCookie).to.include('HttpOnly');

      delete process.env.SUPERADMIN_USER;
      delete process.env.SUPERADMIN_PASSWORD;
    });

    it('should maintain session across multiple requests', async () => {
      const email = 'multipleauth@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);
      serverModule.createUser(email, passwordHash);

      const loginData = JSON.stringify({
        email,
        password
      });

      const loginResponse = await makeRequest({
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginData),
          'X-Forwarded-Proto': 'https'
        }
      }, loginData);

      expect(loginResponse.statusCode).to.equal(200);
      const sessionCookie = loginResponse.cookies
        .find(c => c.startsWith('connect.sid='))
        .split(';')[0];

      const firstCheck = await makeRequest({
        path: '/api/me',
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
          'X-Forwarded-Proto': 'https'
        }
      });

      expect(firstCheck.statusCode).to.equal(200);
      const firstBody = JSON.parse(firstCheck.data);
      expect(firstBody.authenticated).to.be.true;

      const secondCheck = await makeRequest({
        path: '/api/me',
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
          'X-Forwarded-Proto': 'https'
        }
      });

      expect(secondCheck.statusCode).to.equal(200);
      const secondBody = JSON.parse(secondCheck.data);
      expect(secondBody.authenticated).to.be.true;
      expect(secondBody.email).to.equal(email);
    });

    it('should return unauthenticated when no session cookie is present', async () => {
      const response = await makeRequest({
        path: '/api/me',
        method: 'GET',
        headers: {
          'X-Forwarded-Proto': 'https'
        }
      });

      expect(response.statusCode).to.equal(200);
      const body = JSON.parse(response.data);
      expect(body.authenticated).to.be.false;
    });

    it('should clear session on logout', async () => {
      const email = 'logoutuser@example.com';
      const password = 'password123';
      const passwordHash = await bcrypt.hash(password, 10);
      serverModule.createUser(email, passwordHash);

      const loginData = JSON.stringify({
        email,
        password
      });

      const loginResponse = await makeRequest({
        path: '/api/login',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(loginData),
          'X-Forwarded-Proto': 'https'
        }
      }, loginData);

      const sessionCookie = loginResponse.cookies
        .find(c => c.startsWith('connect.sid='))
        .split(';')[0];

      await makeRequest({
        path: '/api/logout',
        method: 'POST',
        headers: {
          'Cookie': sessionCookie,
          'X-Forwarded-Proto': 'https'
        }
      });

      const meResponse = await makeRequest({
        path: '/api/me',
        method: 'GET',
        headers: {
          'Cookie': sessionCookie,
          'X-Forwarded-Proto': 'https'
        }
      });

      expect(meResponse.statusCode).to.equal(200);
      const body = JSON.parse(meResponse.data);
      expect(body.authenticated).to.be.false;
    });
  });
});
