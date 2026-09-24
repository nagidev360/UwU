FROM node:20-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY database ./database

RUN npm run build

ENV NODE_ENV=production

CMD ["npm","start"]
