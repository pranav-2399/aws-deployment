FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY app ./app
COPY db ./db
USER node
EXPOSE 3000
CMD ["node","app/server.js"]
