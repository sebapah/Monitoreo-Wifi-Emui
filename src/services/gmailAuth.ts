import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth: Auth = getAuth(app);

// OAuth access token kept strictly in memory (never localStorage/sessionStorage).
let cachedAccessToken: string | null = null;
let cachedTokenExpiresAt = 0;

function clearCachedToken() {
  cachedAccessToken = null;
  cachedTokenExpiresAt = 0;
}

export function initGmailAuthListener(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      clearCachedToken();
    }
    callback(user);
  });
}

export function getCurrentGmailUser(): User | null {
  return auth.currentUser;
}

export function getCachedGmailAccessToken(): string | null {
  if (!cachedAccessToken) return null;
  if (Date.now() >= cachedTokenExpiresAt) {
    clearCachedToken();
    return null;
  }
  return cachedAccessToken;
}

export function invalidateGmailAccessToken(): void {
  clearCachedToken();
}

export async function signInWithGmail(): Promise<{ user: User; accessToken: string }> {
  const provider = new GoogleAuthProvider();
  provider.addScope(GMAIL_SEND_SCOPE);
  provider.setCustomParameters({
    prompt: 'select_account',
  });

  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  const accessToken = credential?.accessToken;

  if (!accessToken) {
    throw new Error(
      'Google no devolvió un permiso activo para enviar correos por Gmail. Intentá iniciar sesión nuevamente.',
    );
  }

  cachedAccessToken = accessToken;
  // Google OAuth access tokens typically last 3600s; refresh margin at 50 min.
  cachedTokenExpiresAt = Date.now() + 50 * 60 * 1000;

  return { user: result.user, accessToken };
}

export async function signOutGmail(): Promise<void> {
  clearCachedToken();
  await signOut(auth);
}

export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: string }).code)
      : '';

  if (code === 'auth/popup-closed-by-user') {
    return 'Se cerró la ventana de inicio de sesión antes de completar el permiso.';
  }
  if (code === 'auth/popup-blocked') {
    return 'El navegador bloqueó la ventana emergente de Google. Permití las ventanas emergentes para este sitio e intentá de nuevo.';
  }
  if (code === 'auth/cancelled-popup-request') {
    return 'Ya hay una ventana de inicio de sesión abierta.';
  }
  if (code === 'auth/unauthorized-domain') {
    return 'Este dominio aún no está autorizado en la configuración de Google.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'No se pudo conectar con la cuenta de Gmail.';
}
