// Runtime configuration. Loaded before the bundle and never compiled into it.
//
// Hosted inside the shell this file is not loaded at all: the shell's own
// config.js has already set the global. It matters when this remote runs on its
// own port and still has to find its neighbour.
//
// In Docker it is generated on container start from environment variables, so
// the same built artifact runs in any environment. These are development
// defaults.
window.__BASELINE_CONFIG__ = {
  peopleUrl: 'http://localhost:3001',
  deliveryUrl: 'http://localhost:3002',
};
