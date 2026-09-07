// Runtime configuration. Loaded before the bundle and never compiled into it.
//
// In Docker this file is generated on container start from environment
// variables, so the same built artifact runs in any environment. These values
// are only the local development defaults.
window.__BASELINE_CONFIG__ = {
  peopleUrl: 'http://localhost:3001',
  deliveryUrl: 'http://localhost:3002',
};
