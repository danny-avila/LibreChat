# Base node image
FROM node:18-alpine AS node

COPY . /app
WORKDIR /app

# Instala dependencias necesarias para la construcción y la ejecución
RUN apk add --no-cache g++ make python3 py3-pip curl
RUN npm install -g npm@latest node-gyp

# Instala dependencias del proyecto
RUN npm install

# Construye el cliente (frontend)
WORKDIR /app/client
RUN npm install
RUN npm run frontend

# Cambia al directorio de la API para configuraciones finales
WORKDIR /app/api

# Define el puerto y variables de entorno para la API
EXPOSE 3080
ENV HOST=0.0.0.0
ENV NODE_ENV=development

# Comando para iniciar la API
CMD ["npm", "run", "backend"]