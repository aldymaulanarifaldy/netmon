FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

COPY backend .

RUN npm run build

EXPOSE 3001

CMD ["node", "dist/index.js"]
