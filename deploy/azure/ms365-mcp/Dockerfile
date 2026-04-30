FROM node:20-slim
WORKDIR /app
RUN npm init -y && npm install @softeria/ms-365-mcp-server
EXPOSE 3000
CMD ["npx", "@softeria/ms-365-mcp-server", "--http", "3000", "--preset", "mail,calendar,contacts"]
