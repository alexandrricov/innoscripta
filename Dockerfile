# syntax=docker/dockerfile:1
#
# One Dockerfile for all three apps.
#
# They are built together from one workspace and then split into three images,
# one per app, selected with the `APP` build argument. Compose builds all three
# from this same file, so the install and build layers are shared and the
# workspace is only resolved once.
#
# The result is a static bundle behind nginx. Nothing in the image knows where
# the other apps live: that arrives at container start, in `config.js`.

FROM node:24-alpine AS build

# pnpm comes from the version pinned in package.json's packageManager field, so
# the build uses the same one as the developer machine.
RUN corepack enable
WORKDIR /repo

# Manifests first, so a source change does not re-resolve the dependency tree.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/shell/package.json apps/shell/
COPY apps/people/package.json apps/people/
COPY apps/delivery/package.json apps/delivery/
COPY packages/contracts/package.json packages/contracts/
COPY packages/domain/package.json packages/domain/
COPY packages/mf-shared/package.json packages/mf-shared/
COPY packages/seed/package.json packages/seed/
COPY packages/theme/package.json packages/theme/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build

# --- one image per app -------------------------------------------------------

FROM nginx:alpine AS serve

# Which app this image serves. Passed by compose; no default on purpose, so a
# build without it fails instead of quietly producing the wrong image.
ARG APP
RUN test -n "$APP" || (echo "Build argument APP is required (shell|people|delivery)" && false)

COPY --from=build /repo/apps/${APP}/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

# The nginx image runs every executable in this directory before starting the
# server, which is exactly the hook a generated config needs. No ENTRYPOINT
# override, so the image keeps its own signal handling and log wiring.
COPY docker/40-baseline-config.sh /docker-entrypoint.d/40-baseline-config.sh
RUN chmod +x /docker-entrypoint.d/40-baseline-config.sh

EXPOSE 80
