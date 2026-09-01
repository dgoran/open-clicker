const { expect } = require('chai');
const { parseTarget } = require('../show-machine-client');

describe('Show client target parsing', () => {
  const fallback = 'http://localhost:3000';

  it('accepts a bare session code and uppercases it', () => {
    expect(parseTarget('a1b2c3', fallback)).to.deep.equal({
      serverUrl: fallback,
      sessionCode: 'A1B2C3'
    });
  });

  it('extracts server and code from a pasted cue link', () => {
    expect(parseTarget('https://clicker.example.com/show.html?code=A1B2C3', fallback)).to.deep.equal({
      serverUrl: 'https://clicker.example.com',
      sessionCode: 'A1B2C3'
    });
  });

  it('extracts server and code from a presenter link', () => {
    expect(parseTarget('http://192.168.1.10:3000/clicker.html?code=xyz789', fallback)).to.deep.equal({
      serverUrl: 'http://192.168.1.10:3000',
      sessionCode: 'XYZ789'
    });
  });

  it('falls back to the plain code when a URL has no code parameter', () => {
    expect(parseTarget('https://clicker.example.com/show.html', fallback).serverUrl).to.equal(fallback);
  });

  it('trims surrounding whitespace', () => {
    expect(parseTarget('  a1b2c3  ', fallback).sessionCode).to.equal('A1B2C3');
  });
});
