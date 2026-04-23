FROM node:22-alpine AS deps

WORKDIR /app

ENV NUXT_TELEMETRY_DISABLED=1

COPY package*.json ./

RUN npm ci --ignore-scripts --no-audit --no-fund

FROM deps AS production-build

COPY . .

ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=3072"

RUN npm run build

FROM node:22-alpine AS production

WORKDIR /app

ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
ENV NUXT_TELEMETRY_DISABLED=1

COPY --from=production-build /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]

FROM deps AS dev

COPY . .

ENV NODE_ENV=development
ENV NODE_OPTIONS="--max-old-space-size=768"
ENV NUXT_TELEMETRY_DISABLED=1

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
