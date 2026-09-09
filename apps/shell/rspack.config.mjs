import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { SHARED_DEPENDENCIES } from '@baseline/mf-shared';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import rspack from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';
const PORT = 3000;

export default {
  context: dirname,
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'cheap-module-source-map' : 'source-map',
  entry: { main: './src/index.tsx' },
  output: {
    path: path.resolve(dirname, 'dist'),
    // Federated chunks are fetched from whichever origin serves them, so the
    // public path has to be derived at runtime, not baked in.
    publicPath: 'auto',
    // Keeps this build's chunk-loading globals from colliding with a remote's.
    uniqueName: 'shell',
    clean: true,
  },
  // Off on purpose, and it has to be set explicitly: the rspack CLI turns lazy
  // compilation on for `serve` unless this key is present. It proxies modules
  // behind a stub that the federation runtime and the hot-update runtime
  // disagree about, which breaks HMR after the first edit. Slightly slower cold
  // start; editing works.
  lazyCompilation: false,
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
  },
  devServer: {
    port: PORT,
    hot: true,
    historyApiFallback: true,
    static: { directory: path.resolve(dirname, 'public') },
  },
  module: {
    rules: [
      // Rspack 2 needs CSS turned on explicitly with a rule; there is no
      // experiments flag any more. `css/auto` picks module vs global by file
      // name, and nothing here uses CSS modules.
      { test: /\.css$/, type: 'css/auto' },
      {
        test: /\.tsx?$/,
        exclude: /node_modules/,
        loader: 'builtin:swc-loader',
        options: {
          jsc: {
            parser: { syntax: 'typescript', tsx: true },
            transform: {
              react: {
                runtime: 'automatic',
                development: isDev,
                refresh: isDev,
              },
            },
          },
        },
      },
    ],
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'shell',
      // Deliberately empty. Remote URLs come from the container's configuration
      // at runtime via registerRemotes(), never from this bundle.
      remotes: {},
      shared: SHARED_DEPENDENCIES,
      // Off on purpose. The federation type-distribution feature starts its own
      // server, which collides with the dev server's port, and the cross-app
      // contracts are typed explicitly in this repo instead.
      dts: false,
    }),
    new rspack.HtmlRspackPlugin({
      template: './index.html',
      // Only the standalone entry. Without this the plugin also injects the
      // federation container entry, so the page runs two runtimes from the same
      // compilation, both claiming the same hot-update global, and HMR writes
      // into the wrong module registry. remoteEntry.js is for hosts to fetch,
      // not for this page to load.
      chunks: ['main'],
    }),
    new rspack.CopyRspackPlugin({ patterns: [{ from: 'public' }] }),
    isDev ? new ReactRefreshRspackPlugin() : null,
  ].filter(Boolean),
};
