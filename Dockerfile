FROM node:20-alpine AS development-dependencies-env
COPY . /app
WORKDIR /app
# Aggiorna npm per compatibilità lockfile
RUN npm install -g npm@11.5.2 && npm ci

FROM node:20-alpine AS production-dependencies-env
COPY ./package.json package-lock.json /app/
WORKDIR /app
# Aggiorna npm per compatibilità lockfile e install prod deps
RUN npm install -g npm@11.5.2 && npm ci --omit=dev

FROM node:20-alpine AS build-env
COPY . /app/
COPY --from=development-dependencies-env /app/node_modules /app/node_modules
WORKDIR /app
RUN npm run build

FROM node:20-alpine
COPY ./package.json package-lock.json /app/
COPY --from=production-dependencies-env /app/node_modules /app/node_modules
COPY --from=build-env /app/build /app/build
WORKDIR /app
# React Router serve expects /app/build/server/index.js
CMD ["npm", "run", "start"]