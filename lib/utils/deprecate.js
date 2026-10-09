'use strict';

const LOGGED_DEPRECATIONS = new Set();

function deprecate(message) {
  // Only log deprecation messages once.
  if (!LOGGED_DEPRECATIONS.has(message)) {
    LOGGED_DEPRECATIONS.add(message);
    console.warn(message);
  }
}

// Only meant for tests that need to see a deprecation message again.
function resetDeprecations() {
  LOGGED_DEPRECATIONS.clear();
}

module.exports = {
  deprecate,
  resetDeprecations,
};
