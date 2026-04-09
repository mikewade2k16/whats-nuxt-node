FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=development
ENV NODE_OPTIONS="--max-old-space-size=512"

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
