FROM mcr.microsoft.com/playwright:v1.56.1-jammy

WORKDIR /app

COPY package.json ./
RUN npm install --production

COPY src ./src

ENV PORT=7001

EXPOSE 7001

CMD ["node", "src/index.js"]
