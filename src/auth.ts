interface StoredAccount {
  email: string;
  salt: string;
  passwordHash: string;
}

const accountsKey = 'aquaSense-accounts';
const sessionKey = 'aquaSense-session';
const passwordIterations = 120_000;

function readAccounts(): StoredAccount[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(accountsKey) ?? '[]');
    if (!Array.isArray(value)) return [];
    return value.filter((account): account is StoredAccount =>
      account !== null &&
      typeof account === 'object' &&
      typeof account.email === 'string' &&
      typeof account.salt === 'string' &&
      typeof account.passwordHash === 'string',
    );
  } catch {
    return [];
  }
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hashPassword(password: string, salt: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: Uint8Array.from(salt.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16)),
    iterations: passwordIterations,
  }, key, 256);
  return toHex(new Uint8Array(bits));
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function signUp(emailInput: string, password: string): Promise<string> {
  const email = normalizeEmail(emailInput);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  if (password.length < 8) throw new Error('Use a password with at least 8 characters.');

  const accounts = readAccounts();
  if (accounts.some((account) => account.email === email)) {
    throw new Error('An account with this email already exists on this device.');
  }

  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  accounts.push({ email, salt, passwordHash: await hashPassword(password, salt) });
  localStorage.setItem(accountsKey, JSON.stringify(accounts));
  localStorage.setItem(sessionKey, email);
  return email;
}

export async function logIn(emailInput: string, password: string): Promise<string> {
  const email = normalizeEmail(emailInput);
  const account = readAccounts().find((candidate) => candidate.email === email);
  if (!account || await hashPassword(password, account.salt) !== account.passwordHash) {
    throw new Error('Email or password is incorrect.');
  }
  localStorage.setItem(sessionKey, email);
  return email;
}

export function currentSession(): string | null {
  return localStorage.getItem(sessionKey);
}

export function logOut(): void {
  localStorage.removeItem(sessionKey);
}