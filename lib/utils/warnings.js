const LOGGED_WARNINGS = new Set();

// Log each warning only once.
export function warnOnce(message) {
  if (!LOGGED_WARNINGS.has(message)) {
    LOGGED_WARNINGS.add(message);
    console.warn(`[objection] ${message}`);
  }
}

export function deprecate(message) {
  warnOnce(message);
}

// Only meant for tests that need to see a warning again.
export function resetWarnings() {
  LOGGED_WARNINGS.clear();
}
