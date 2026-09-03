// Small helpers shared by the producer, control center and cue pages.

// Faint build stamp in the bottom-left corner. Pass 'dark' on dark pages.
function mountVersionStamp(theme) {
  const style = document.createElement('style');
  style.textContent = `
    .version-stamp {
      position: fixed;
      bottom: max(6px, env(safe-area-inset-bottom));
      left: max(8px, env(safe-area-inset-left));
      font-size: 10px;
      line-height: 1;
      color: ${theme === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.28)'};
      pointer-events: none;
      user-select: none;
      z-index: 5;
    }`;
  document.head.appendChild(style);

  const stamp = document.createElement('div');
  stamp.className = 'version-stamp';
  document.body.appendChild(stamp);

  fetch('/api/version')
    .then((r) => r.json())
    .then(({ version }) => { stamp.textContent = 'v' + version; })
    .catch(() => {});
}

// Two-click confirmation that needs no native dialog (embedded browsers
// suppress confirm(), which then silently returns false). Returns true when
// the click should go ahead; otherwise arms the button and returns false.
function confirmClick(btn, label = 'Confirm?', windowMs = 6000) {
  if (btn.dataset.armed === 'yes') {
    btn.dataset.armed = '';
    return true;
  }

  const original = btn.dataset.originalLabel || btn.textContent;
  btn.dataset.originalLabel = original;
  btn.dataset.armed = 'yes';
  btn.textContent = label;
  btn.classList.add('danger');

  setTimeout(() => {
    if (btn.dataset.armed === 'yes') {
      btn.dataset.armed = '';
      btn.textContent = original;
      btn.classList.remove('danger');
    }
  }, windowMs);

  return false;
}
