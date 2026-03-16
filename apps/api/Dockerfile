FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run prisma:generate

FROM base AS dev
RUN apk add --no-cache docker-cli
CMD ["npm", "run", "dev"]

FROM base AS worker
CMD ["npm", "run", "worker:dev"]

FROM base AS prod
RUN npm run build
CMD ["npm", "run", "start"]
