# syntax=docker/dockerfile:1

# --- Build stage -------------------------------------------------------------
FROM node:20-alpine AS build
WORKDIR /app

# Google Drive integration is baked into the client bundle at build time.
# Leave empty to build without Drive support (Drive buttons stay hidden).
ARG VITE_GOOGLE_API_KEY=""
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_GOOGLE_APP_ID=""
ARG VITE_GOOGLE_CLIENT_SECRET=""
# Optional overrides (e.g. "0.17.1-dev.abc123" activates the DEV banner)
ARG VITE_APP_VERSION=""
ARG VITE_PWA_NAME=""

COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN VITE_GOOGLE_API_KEY="$VITE_GOOGLE_API_KEY" \
    VITE_GOOGLE_CLIENT_ID="$VITE_GOOGLE_CLIENT_ID" \
    VITE_GOOGLE_APP_ID="$VITE_GOOGLE_APP_ID" \
    VITE_GOOGLE_CLIENT_SECRET="$VITE_GOOGLE_CLIENT_SECRET" \
    VITE_APP_VERSION="${VITE_APP_VERSION:-}" \
    VITE_PWA_NAME="${VITE_PWA_NAME:-}" \
    npm run build

# --- Runtime stage -----------------------------------------------------------
FROM nginx:1.29-alpine-slim
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
