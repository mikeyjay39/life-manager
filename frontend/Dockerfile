# ---- Development: Expo web dev server (profile dev) ----
FROM node:22-bookworm AS development
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 8081
ENV NODE_ENV=development

CMD ["npx", "expo", "start", "--web", "--host", "0.0.0.0", "--port", "8081"]

# ---- Builder: static web export (profile prod) ----
FROM node:22-bookworm AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG EXPO_PUBLIC_API_BASE_URL=https://localhost:3000
ENV EXPO_PUBLIC_API_BASE_URL=${EXPO_PUBLIC_API_BASE_URL}

RUN npx expo export --platform web

# ---- Production: nginx serves dist/ ----
FROM nginx:1.27-alpine AS production

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
