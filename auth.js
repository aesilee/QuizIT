/* ══════════════════════════════════════════════════════
   QuizIT — auth.js  (MongoDB backend version)
   ══════════════════════════════════════════════════════ */

const API = 'http://localhost:3001'; // change to your server URL when deployed

let currentUser = null; // { id, email }
let authToken   = null;
let authMode    = 'login';

// ── INIT ────────────────────────────────────────────────────────────────────
function initAuth() {
  // Try restoring session from localStorage
  const saved = localStorage.getItem('quizit_session');
  if (saved) {
    try {
      const { token, user } = JSON.parse(saved);
      authToken   = token;
      currentUser = user;
      onSignedIn();
      return;
    } catch { localStorage.removeItem('quizit_session'); }
  }
  showAuthPage();
}

// ── SHOW / HIDE AUTH PAGE ───────────────────────────────────────────────────
function showAuthPage() {
  document.getElementById('auth-overlay').classList.add('active');
  document.getElementById('auth-error').textContent = '';
  document.getElementById('auth-email').value    = '';
  document.getElementById('auth-password').value = '';
}

function hideAuthPage() {
  document.getElementById('auth-overlay').classList.remove('active');
}

async function onSignedIn() {
  hideAuthPage();
  updateUserUI();
  await syncSetsFromCloud();
  renderHome();
}

// ── USER UI ─────────────────────────────────────────────────────────────────
function updateUserUI() {
  if (!currentUser) return;
  const email    = currentUser.email || '';
  const initial  = email.charAt(0).toUpperCase();
  const emailEl  = document.getElementById('user-email-display');
  const avatarEl = document.getElementById('sidebar-user-avatar');
  if (emailEl)  emailEl.textContent  = email;
  if (avatarEl) avatarEl.textContent = initial;
}

// ── SIGN UP ─────────────────────────────────────────────────────────────────
async function authSignUp() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');

  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }
  if (password.length < 6) { errEl.textContent = 'Password must be at least 6 characters.'; return; }

  btn.disabled = true;
  btn.textContent = 'Creating account…';
  errEl.textContent = '';

  try {
    const res  = await fetch(`${API}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) { errEl.textContent = data.error; return; }

    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('quizit_session', JSON.stringify({ token: authToken, user: currentUser }));
    onSignedIn();
  } catch {
    errEl.textContent = 'Could not reach server. Is it running?';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Sign Up';
  }
}

// ── LOG IN ──────────────────────────────────────────────────────────────────
async function authSignIn() {
  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const errEl    = document.getElementById('auth-error');
  const btn      = document.getElementById('auth-submit-btn');

  if (!email || !password) { errEl.textContent = 'Please fill in all fields.'; return; }

  btn.disabled = true;
  btn.textContent = 'Signing in…';
  errEl.textContent = '';

  try {
    const res  = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (!res.ok) { errEl.textContent = data.error; return; }

    authToken   = data.token;
    currentUser = data.user;
    localStorage.setItem('quizit_session', JSON.stringify({ token: authToken, user: currentUser }));
    onSignedIn();
  } catch {
    errEl.textContent = 'Could not reach server. Is it running?';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log In';
  }
}

// ── SIGN OUT ─────────────────────────────────────────────────────────────────
function authSignOut() {
  authToken   = null;
  currentUser = null;
  localStorage.removeItem('quizit_session');
  localStorage.removeItem('studydeck_sets_v2');
  sets = [];
  showAuthPage();
}

// ── CLOUD SYNC ───────────────────────────────────────────────────────────────
async function syncSetsFromCloud() {
  if (!authToken) return;
  try {
    const res  = await fetch(`${API}/sets`, {
      headers: { Authorization: `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (data.data) {
      sets = data.data;
      localStorage.setItem('studydeck_sets_v2', JSON.stringify(sets));
    }
  } catch (e) {
    console.warn('Could not sync from cloud, using local data.', e);
  }
}

async function syncSetsToCloud() {
  if (!authToken) return;
  try {
    await fetch(`${API}/sets`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
      body:    JSON.stringify({ data: sets })
    });
  } catch (e) {
    console.warn('Cloud save failed:', e);
  }
}

// ── AUTH FORM HELPERS ─────────────────────────────────────────────────────────
function authSubmit() {
  if (authMode === 'login') authSignIn();
  else authSignUp();
}

function authKeydown(e) {
  if (e.key === 'Enter') authSubmit();
}

function switchAuthTab(mode) {
  authMode = mode;
  const btn       = document.getElementById('auth-submit-btn');
  const switchBtn = document.getElementById('auth-switch-btn');
  const switchMsg = document.getElementById('auth-switch-msg');
  const titleEl   = document.getElementById('auth-title');
  document.getElementById('auth-error').textContent = '';

  if (mode === 'login') {
    titleEl.textContent   = 'Welcome back';
    btn.textContent       = 'Log In';
    switchMsg.textContent = "Don't have an account? ";
    switchBtn.textContent = 'Sign up';
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-login').classList.add('active');
  } else {
    titleEl.textContent   = 'Create account';
    btn.textContent       = 'Sign Up';
    switchMsg.textContent = 'Already have an account? ';
    switchBtn.textContent = 'Log in';
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.getElementById('tab-signup').classList.add('active');
  }
}