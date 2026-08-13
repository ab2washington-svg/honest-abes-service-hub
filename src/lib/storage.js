// Local-only persistence for the zero-cost MVP.
//
// This keeps the app fully functional with $0 infrastructure — data lives
// in the browser's localStorage on whatever device you're using.
//
// When you're ready for real multi-user / multi-device data (e.g. Adrian on
// desktop, Mike and Sarah on their phones, all seeing the same job board),
// swap this file for a Supabase client (free tier: 500MB Postgres, no card
// required). Keep the same storageGet(key, fallback) / storageSet(key, value)
// function signatures and nothing else in the app needs to change.

const PREFIX = "hasp:";

export async function storageGet(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (e) {
    console.error("storageGet failed", e);
    return fallback;
  }
}

export async function storageSet(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch (e) {
    console.error("storageSet failed", e);
    return false;
  }
}
