FROM node:20-alpine
WORKDIR /app
COPY package.json server.js ./
USER node
ENV NODE_ENV=production
CMD ["node", "server.js"]
