import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { REMOTE_ENTRY_FILENAME, SHARED_DEPENDENCIES } from '@baseline/mf-shared';
import { ModuleFederationPlugin } from '@module-federation/enhanced/rspack';
import rspack from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = process.env.NODE_ENV !== 'production';
const PORT = 3001;

export default {
  context: dirname,
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'cheap-module-source-map' : 'source-map',
  // The standalone entry. It produces index.html and mounts the app on its own,
  // so this build runs by itself; remoteEntry.js below comes out of the same
  // build and lets the shell host it. One codebase, one build, two ways to run.
  entry: { main: './src/index.tsx' },
  output: {
    path: path.resolve(dirname, 'dist'),
    publicPath: 'auto',
    uniqueName: 'people',
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
    // The shell is served from another origin, so it can only read this
    // manifest with CORS open.
    headers: { 'Access-Control-Allow-Origin': '*' },
  },
  module: {
    rules: [
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
      name: 'people',
      filename: REMOTE_ENTRY_FILENAME,
      exposes: {
        './App': './src/App.tsx',
      },
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
    isDev ? new ReactRefreshRspackPlugin() : null,
  ].filter(Boolean),
};
