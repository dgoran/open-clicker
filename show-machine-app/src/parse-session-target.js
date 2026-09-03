// Turns what a user types or pastes into a server + session code. Accepts a
// bare code ("A1B2C3") or a cue/presenter link
// ("https://host/show.html?code=A1B2C3"). Shared by the desktop app and the
// CLI client so both accept exactly the same input.
function parseSessionTarget(input, fallbackServerUrl) {
  const value = (input || '').trim();
  if (!value) return { serverUrl: fallbackServerUrl, sessionCode: '' };

  const match = value.match(/^https?:\/\/\S+/i);
  if (match) {
    try {
      const url = new URL(match[0]);
      const code = url.searchParams.get('code') || '';
      return { serverUrl: url.origin, sessionCode: code.trim().toUpperCase() };
    } catch (err) {
      // Not a parseable URL after all; treat it as a plain code below.
    }
  }
  return { serverUrl: fallbackServerUrl, sessionCode: value.toUpperCase() };
}

module.exports = { parseSessionTarget };
