const STORAGE_KEY = "psb_universe_user_session";
const AUTH_CHANGE_EVENT = "psb-auth-change";

export function getStoredUser() {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch (_error) {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function setStoredUser(user) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export function clearStoredUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(AUTH_CHANGE_EVENT));
}

export { AUTH_CHANGE_EVENT };
