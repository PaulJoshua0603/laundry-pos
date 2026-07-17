/* ══════════════════════════════════════════════════════════
   SudsUp POS · auth.js
   Client-side account system backed by localStorage.

   IMPORTANT — READ THIS BEFORE GOING LIVE WITH REAL CUSTOMERS:
   This runs entirely in the browser. Accounts, password hashes and
   business data live in localStorage on each device. That's enough
   to ship a working single-shop demo or an internal single-device
   till, but it is NOT secure multi-device / multi-location auth:
   anyone with devtools on that browser can read localStorage, and
   there is no server verifying anything. Before handling real
   customer payments or opening this to the public internet, swap
   the functions in the "DATA LAYER" section below for calls to a
   real backend (e.g. Supabase, Firebase Auth, or your own API with
   bcrypt/argon2 password hashing). See README.md for details.
══════════════════════════════════════════════════════════ */

const AUTH_USERS_KEY   = 'sudsup_users';
const AUTH_SESSION_KEY = 'sudsup_session';

/* ─── GOOGLE SIGN-IN ───
   1. Create an OAuth Client ID (type: "Web application") at
      https://console.cloud.google.com/apis/credentials
   2. Add your site's URL (e.g. https://yourshop.com, or
      http://localhost:PORT while testing) under
      "Authorized JavaScript origins".
   3. Paste the Client ID below. Until you do, the button shows a
      friendly "not configured yet" message instead of a broken
      Google prompt. */
const GOOGLE_CLIENT_ID = '234399207339-k158pf2sld5gmlup46elos7mamp3brin.apps.googleusercontent.com';

function googleConfigured(){
  return !!GOOGLE_CLIENT_ID && !GOOGLE_CLIENT_ID.startsWith('YOUR_');
}

function handleGoogleNotConfigured(){
  showAuthError('Google Sign-In isn\u2019t set up yet \u2014 add a Google OAuth Client ID in js/auth.js (see the comment above GOOGLE_CLIENT_ID, and README.md).');
}

function initGoogleSignIn(){
  const wrap = document.getElementById('googleBtnWrap');
  const fallback = document.getElementById('googleBtnFallback');
  if (!googleConfigured()){
    if (wrap) wrap.style.display = 'none';
    if (fallback) fallback.style.display = 'flex';
    return;
  }
  if (fallback) fallback.style.display = 'none';
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id){
    // GSI script hasn't finished loading yet — try again shortly.
    setTimeout(initGoogleSignIn, 300);
    return;
  }
  google.accounts.id.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: handleGoogleCredential,
  });
  renderGoogleButton();
}

function renderGoogleButton(){
  const wrap = document.getElementById('googleBtnWrap');
  if (!wrap || typeof google === 'undefined' || !google.accounts?.id) return;
  wrap.innerHTML = '';
  wrap.style.display = 'flex';
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  google.accounts.id.renderButton(wrap, {
    theme: isLight ? 'outline' : 'filled_black',
    size: 'large',
    shape: 'pill',
    text: 'continue_with',
    width: 320,
  });
}

/* Decode a JWT's payload without verifying its signature. This is
   fine here only because there's no real backend to attack in this
   demo — the whole account system already lives in localStorage.
   A production build should verify the ID token server-side. */
function decodeJwtPayload(token){
  const base64 = token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
  const json = decodeURIComponent(
    atob(base64).split('').map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')
  );
  return JSON.parse(json);
}

async function handleGoogleCredential(response){
  hideAuthError();
  try {
    const payload = decodeJwtPayload(response.credential);
    const email = (payload.email || '').toLowerCase();
    const name = payload.name || email.split('@')[0] || 'there';
    if (!email){ showAuthError('Couldn\u2019t read an email address from your Google account.'); return; }

    const users = getUsers();
    let user = users.find(u => u.email === email);

    if (!user){
      user = {
        id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name,
        business: 'My Laundry Shop',
        email,
        provider: 'google',
        googleSub: payload.sub,
        picture: payload.picture || '',
        hash: null,
        salt: null,
        createdAt: new Date().toISOString(),
      };
      users.push(user);
      saveUsers(users);
      setSession({ userId: user.id, name: user.name, email: user.email, business: user.business });
      toast(`Welcome, ${name.split(' ')[0]}! Account created with Google.`, 'success');
    } else {
      setSession({ userId: user.id, name: user.name, email: user.email, business: user.business });
      toast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
    }
    enterApp();
  } catch (err){
    showAuthError('Something went wrong signing in with Google. Please try again.');
  }
}

/* ─── DATA LAYER (swap this out for a real backend later) ─── */
function getUsers(){
  try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)) || []; }
  catch { return []; }
}
function saveUsers(users){
  localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users));
}
function getSession(){
  try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY)); }
  catch { return null; }
}
function setSession(session){
  localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
}
function clearSession(){
  localStorage.removeItem(AUTH_SESSION_KEY);
}

/* ─── PASSWORD HASHING (PBKDF2 via Web Crypto) ───
   Not a replacement for server-side hashing, but far better than
   storing plaintext if this file ever gets deployed as-is. */
async function hashPassword(password, saltHex){
  const enc = new TextEncoder();
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw', enc.encode(password), { name: 'PBKDF2' }, false, ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 120000, hash: 'SHA-256' },
    keyMaterial, 256
  );
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}
function bytesToHex(bytes){
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex){
  const arr = new Uint8Array(hex.length / 2);
  for (let i = 0; i < arr.length; i++) arr[i] = parseInt(hex.substr(i * 2, 2), 16);
  return arr;
}

/* ─── VALIDATION ─── */
function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/* ─── UI: TAB SWITCHING ─── */
function authSwitchTab(tab){
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
  document.getElementById('authTab-' + tab).classList.add('active');
  document.getElementById('authForm-' + tab).classList.add('active');
  hideAuthError();
}

function showAuthError(msg){
  const el = document.getElementById('authErrorBanner');
  el.textContent = msg;
  el.classList.add('show');
}
function hideAuthError(){
  const el = document.getElementById('authErrorBanner');
  el.classList.remove('show');
  el.textContent = '';
}
function fieldError(id, msg){
  const el = document.getElementById(id);
  if (el) el.textContent = msg || '';
}

/* ─── REGISTER ─── */
async function handleRegister(e){
  e.preventDefault();
  hideAuthError();
  fieldError('regNameErr','');
  fieldError('regEmailErr','');
  fieldError('regPassErr','');
  fieldError('regPass2Err','');

  const name     = document.getElementById('regName').value.trim();
  const business = document.getElementById('regBusiness').value.trim();
  const email    = document.getElementById('regEmail').value.trim().toLowerCase();
  const pass     = document.getElementById('regPassword').value;
  const pass2    = document.getElementById('regPassword2').value;

  let valid = true;
  if (name.length < 2){ fieldError('regNameErr','Enter your full name.'); valid = false; }
  if (!isValidEmail(email)){ fieldError('regEmailErr','Enter a valid email address.'); valid = false; }
  if (pass.length < 8){ fieldError('regPassErr','At least 8 characters.'); valid = false; }
  if (pass !== pass2){ fieldError('regPass2Err','Passwords don\u2019t match.'); valid = false; }
  if (!valid) return;

  const users = getUsers();
  if (users.some(u => u.email === email)){
    showAuthError('An account with that email already exists. Try logging in instead.');
    return;
  }

  const submitBtn = document.getElementById('regSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating account\u2026';

  try {
    const { hash, salt } = await hashPassword(pass);
    const user = {
      id: 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name,
      business: business || 'My Laundry Shop',
      email,
      hash,
      salt,
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    setSession({ userId: user.id, name: user.name, email: user.email, business: user.business });
    toast(`Welcome, ${user.name.split(' ')[0]}! Account created.`, 'success');
    enterApp();
  } catch (err){
    showAuthError('Something went wrong creating your account. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create account';
  }
}

/* ─── LOGIN ─── */
async function handleLogin(e){
  e.preventDefault();
  hideAuthError();

  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;

  if (!email || !pass){
    showAuthError('Enter your email and password.');
    return;
  }

  const submitBtn = document.getElementById('loginSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Signing in\u2026';

  try {
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user){
      showAuthError('No account found with that email.');
      return;
    }
    if (user.provider === 'google' && !user.hash){
      showAuthError('This account signs in with Google. Use the "Continue with Google" button above.');
      return;
    }
    const { hash } = await hashPassword(pass, user.salt);
    if (hash !== user.hash){
      showAuthError('Incorrect password.');
      return;
    }
    setSession({ userId: user.id, name: user.name, email: user.email, business: user.business });
    toast(`Welcome back, ${user.name.split(' ')[0]}!`, 'success');
    enterApp();
  } catch (err){
    showAuthError('Something went wrong signing in. Please try again.');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign in';
  }
}

/* ─── LOGOUT ─── */
function handleLogout(){
  clearSession();
  document.getElementById('userMenu')?.classList.remove('show');
  document.getElementById('mobileMoreOverlay')?.classList.remove('show');
  const shellEl = document.getElementById('shell');
  shellEl.classList.add('leaving');
  setTimeout(() => {
    shellEl.classList.remove('active');
    shellEl.classList.remove('leaving');
    showAuthScreen();
  }, 190);
  toast('Signed out');
}

/* ─── SCREEN SWITCHING ─── */
function showAuthScreen(){
  const authEl = document.getElementById('authScreen');
  authEl.classList.remove('hidden');
  authEl.classList.remove('leaving');
  document.getElementById('shell').classList.remove('active');
  document.getElementById('authForm-login')?.reset();
  document.getElementById('authForm-register')?.reset();
}

function enterApp(immediate){
  const session = getSession();
  if (!session) { showAuthScreen(); return; }

  const authEl = document.getElementById('authScreen');
  const shellEl = document.getElementById('shell');

  const initials = session.name.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
  document.getElementById('topbarAvatar').textContent = initials || 'U';
  document.getElementById('userMenuName').textContent = session.name;
  document.getElementById('userMenuEmail').textContent = session.email;
  document.getElementById('userMenuBusiness').textContent = session.business;
  const mAvatar = document.getElementById('mMoreAvatar');
  const mName = document.getElementById('mMoreName');
  const mBiz = document.getElementById('mMoreBusiness');
  if(mAvatar) mAvatar.textContent = initials || 'U';
  if(mName) mName.textContent = session.name;
  if(mBiz) mBiz.textContent = session.business;

  if (typeof initAppForUser === 'function') initAppForUser(session);

  if (immediate){
    authEl.classList.add('hidden');
    shellEl.classList.add('active');
  } else {
    // Smooth cross-fade: let the login screen fade out first, then
    // swap it for the app shell (which fades in via its own animation).
    authEl.classList.add('leaving');
    setTimeout(() => {
      authEl.classList.add('hidden');
      authEl.classList.remove('leaving');
      shellEl.classList.add('active');
    }, 200);
  }
}

/* ─── USER MENU DROPDOWN ─── */
document.addEventListener('click', (e) => {
  const menu = document.getElementById('userMenu');
  const avatar = document.getElementById('topbarAvatar');
  if (!menu) return;
  if (avatar && avatar.contains(e.target)){
    menu.classList.toggle('show');
  } else if (!menu.contains(e.target)){
    menu.classList.remove('show');
  }
});

/* ─── BOOT ─── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('authForm-register').addEventListener('submit', handleRegister);
  document.getElementById('authForm-login').addEventListener('submit', handleLogin);
  initGoogleSignIn();

  const session = getSession();
  if (session && getUsers().some(u => u.id === session.userId)){
    enterApp(true);
  } else {
    clearSession();
    showAuthScreen();
  }
});
