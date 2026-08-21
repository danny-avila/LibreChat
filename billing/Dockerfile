FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY views ./views
COPY public ./public
EXPOSE 3000
USER node
CMD ["node", "server.js"]
