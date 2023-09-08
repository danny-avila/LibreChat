# Base node image
FROM node:lts-alpine3.18 AS node

COPY . /app
WORKDIR /app

# Install call deps - Install curl for health check
RUN apk --no-cache add curl && \
    # We want to inherit env from the container, not the file
    # This will preserve any existing env file if it's already in souce
    # otherwise it will create a new one
    touch .env && \
    # Build deps in seperate
    npm ci

# React client build
ENV NODE_OPTIONS="--max-old-space-size=2048"
RUN npm run frontend

ENV MONGO_URI=mongodb+srv://nodegpt:boHmydaj9jinDSwn@nemocluster.dqrur36.mongodb.net/libreChat
ENV OPENAI_API_KEY=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

ENV APP_TITLE=VectorGPT
ENV HOST=localhost
ENV PORT=3080
 #The max amount of logins allowed per IP per LOGIN_WINDOW
ENV LOGIN_MAX=20
#in minutes, determines how long an IP is banned for after LOGIN_MAX logins
ENV LOGIN_WINDOW=5
#The max amount of registrations allowed per IP per REGISTER_WINDOW
ENV REGISTER_MAX=5
#in minutes, determines how long an IP is banned for after REGISTER_MAX registrations
ENV REGISTER_WINDOW=60
#Identify the available models, separated by commas *without spaces*, The first will be default.
ENV AZURE_OPENAI_MODELS=gpt-3.5-turbo,gpt-4
#Identify the available models, separated by commas. The first will be default., Leave it blank to use internal settings.
ENV CHATGPT_MODELS=text-davinci-002-render-sha,gpt-4
#For securely storing credentials, you need a fixed key and IV. You can set them here for prod and dev environments
#If you don't set them, the app will crash on startup.
#You need a 32-byte key (64 characters in hex) and 16-byte IV (32 characters in hex)
#Use this replit to generate some quickly: https://replit.com/@daavila/crypto#index.js
#Here are some examples (THESE ARE NOT SECURE!)
ENV CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
ENV CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb
#Allow Public Registration
ENV ALLOW_REGISTRATION=false
#Allow Social Registration
ENV ALLOW_SOCIAL_LOGIN=false
#Allow Social Registration (WORKS ONLY for Google, Github, Discord)
ENV ALLOW_SOCIAL_REGISTRATION=false
#JWT Secrets
ENV JWT_SECRET=N7w1ePlw46h5l5d7UY60CVG6ZCdxCj8e
ENV JWT_REFRESH_SECRET=660c3V0LiKxyLKymG1de37Oc3LS8VA8m
#Set the expiration delay for the secure cookie with the JWT token
#Delay is in millisecond e.g. 7 days is 1000*60*60*24*7
ENV SESSION_EXPIRY=604800000

# Email is used for password reset. Note that all 4 values must be set for email to work.
ENV EMAIL_SERVICE=gmail
ENV EMAIL_USERNAME=vectorkftdeveloper@gmail.com
ENV EMAIL_PASSWORD=gunxbipkwgbdknhh
ENV EMAIL_FROM=noreply@vectorgtp.ai

# Node API setup
EXPOSE 3080
ENV HOST=0.0.0.0
CMD ["npm", "run", "backend"]

# Optional: for client with nginx routing
# FROM nginx:stable-alpine AS nginx-client
# WORKDIR /usr/share/nginx/html
# COPY --from=node /app/client/dist /usr/share/nginx/html
# COPY client/nginx.conf /etc/nginx/conf.d/default.conf
# ENTRYPOINT ["nginx", "-g", "daemon off;"]
