/**
 * Federation constants shared by all three builds.
 *
 * This file exists for one reason: the `shared` block has to be byte-identical
 * in every app. If shell and a remote disagree on the React version or on the
 * singleton flag, federation quietly loads two copies of React and hooks break
 * in ways that look like application bugs. Declaring it once removes that
 * failure mode.
 *
 * Plain `.mjs` on purpose - it is read by the rspack config, which runs in Node
 * before any TypeScript exists.
 */

/** Every remote publishes its manifest under this name. */
export const REMOTE_ENTRY_FILENAME = 'remoteEntry.js';

/**
 * Only the stateful packages are shared, and they are shared as singletons.
 *
 * `react` holds the hook dispatcher and `react-dom` holds the roots and the
 * scheduler. Two copies of either means hooks called inside a remote reach a
 * dispatcher that is not the one currently rendering, which surfaces as
 * "invalid hook call" or as silently dead state.
 *
 * The JSX runtime (`react/jsx-runtime`, `react/jsx-dev-runtime`) is deliberately
 * not shared. It is a stateless factory, so a second copy costs a couple of
 * kilobytes and cannot change behaviour. Sharing package subpaths is also not
 * registered by this version of the federation plugin, so declaring it would
 * leave dead configuration behind.
 *
 * `requiredVersion` is pinned rather than a range so a version drift between
 * apps fails loudly at load time instead of silently duplicating React.
 */
export const SHARED_DEPENDENCIES = {
  react: { singleton: true, requiredVersion: '19.2.8' },
  'react-dom': { singleton: true, requiredVersion: '19.2.8' },
};
