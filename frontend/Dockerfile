# ---- Development: Expo web dev server (profile dev) ----
FROM node:22-bookworm AS development
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_ENV=development
ENV FRONTEND_PORT=8080
EXPOSE 8080

CMD ["sh", "-c", "npx expo start --web --host localhost --port \"$FRONTEND_PORT\""]

# ---- Builder: static web export (profile prod) ----
FROM node:22-bookworm AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG EXPO_PUBLIC_API_BASE_URL=http://localhost
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}

RUN npx expo export --platform web

# ---- Production: nginx serves dist/ ----
FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
