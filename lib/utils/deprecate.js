const LOGGED_DEPRECATIONS = new Set();

export function deprecate(message) {
  // Only log deprecation messages once.
  if (!LOGGED_DEPRECATIONS.has(message)) {
    LOGGED_DEPRECATIONS.add(message);
    console.warn(message);
  }
}

// Only meant for tests that need to see a deprecation message again.
export function resetDeprecations() {
  LOGGED_DEPRECATIONS.clear();
}
