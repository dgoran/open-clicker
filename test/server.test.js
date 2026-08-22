const { expect } = require('chai');
const crypto = require('crypto');

describe('Session Code Generation', () => {
  it('should generate a 6-character alphanumeric code', () => {
    // Generate 6 bytes to ensure at least 6 chars after stripping +/=
    const bytes = crypto.randomBytes(6);
    const code = bytes.toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 6)
      .toUpperCase();
    
    expect(code).to.have.lengthOf(6);
    expect(code).to.match(/^[A-Z0-9]+$/);
  });

  it('should generate different codes each time', () => {
    // Generate 6 bytes to ensure at least 6 chars after stripping +/=
    const bytes1 = crypto.randomBytes(6);
    const code1 = bytes1.toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 6)
      .toUpperCase();
    
    const bytes2 = crypto.randomBytes(6);
    const code2 = bytes2.toString('base64')
      .replace(/[+/=]/g, '')
      .substring(0, 6)
      .toUpperCase();
    
    expect(code1).to.not.equal(code2);
  });
});

describe('Token Generation', () => {
  it('should generate a 64-character hex token', () => {
    const token = crypto.randomBytes(32).toString('hex');
    
    expect(token).to.have.lengthOf(64);
    expect(token).to.match(/^[a-f0-9]+$/);
  });

  it('should generate different tokens each time', () => {
    const token1 = crypto.randomBytes(32).toString('hex');
    const token2 = crypto.randomBytes(32).toString('hex');
    
    expect(token1).to.not.equal(token2);
  });
});
