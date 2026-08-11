import type { UserProfile } from './userProfile';

const TOKEN_KEY = 'spendwiseSessionToken';
const USER_KEY = 'spendwiseAuthenticatedUser';
const FINANCE_KEYS = ['expenses', 'budgets', 'income', 'emiPlans', 'savingsGoals', 'mongoBootstrapComplete'];

export type AuthUser = Pick<UserProfile, 'fullName' | 'email'>;

function readStored<T>(key: string): T | null {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
}

export function getAuthToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function getAuthenticatedUser() {
  return readStored<AuthUser>(USER_KEY);
}

export function isAuthenticated() {
  return Boolean(getAuthToken() && getAuthenticatedUser());
}

export function expireSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new CustomEvent('authChanged'));
}

async function authRequest(path: string, body: Record<string, string>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({})) as { message?: string; token?: string; user?: AuthUser };
  if (!response.ok || !payload.token || !payload.user) throw new Error(payload.message || 'Unable to authenticate');
  return { token: payload.token, user: payload.user };
}

function clearFinanceData() {
  FINANCE_KEYS.forEach((key) => localStorage.removeItem(key));
}

function saveSession(token: string, user: AuthUser, preserveFinanceData: boolean) {
  if (!preserveFinanceData) clearFinanceData();
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new CustomEvent('authChanged'));
}

export async function signUp(fullName: string, email: string, password: string) {
  const session = await authRequest('/api/auth/signup', { fullName, email, password });
  saveSession(session.token, session.user, true);
  return session.user;
}

export async function logIn(email: string, password: string) {
  const session = await authRequest('/api/auth/login', { email, password });
  saveSession(session.token, session.user, false);
  return session.user;
}

export async function googleLogIn(email: string, fullName?: string, googleId?: string) {
  const session = await authRequest('/api/auth/google', { email, fullName: fullName || '', googleId: googleId || '' });
  saveSession(session.token, session.user, true);
  return session.user;
}

export async function githubLogIn(email?: string, fullName?: string, githubId?: string, username?: string) {
  const session = await authRequest('/api/auth/github', { 
    email: email || '', 
    fullName: fullName || '', 
    githubId: githubId || '',
    username: username || ''
  });
  saveSession(session.token, session.user, true);
  return session.user;
}

export async function logOut() {
  const token = getAuthToken();
  try {
    if (token) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  } finally {
    expireSession();
    clearFinanceData();
    window.dispatchEvent(new CustomEvent('authChanged'));
  }
}
