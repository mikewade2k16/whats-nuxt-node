FROM node:22-alpine AS base
WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

FROM base AS dev
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

FROM base AS prod
RUN npm run build
CMD ["npm", "run", "start"]

