# LibreChat Deployment on Zeabur

This guide will help you deploy LibreChat on Zeabur platform.

## Prerequisites

- Zeabur account
- GitHub repository with LibreChat code

## Deployment Steps

### 1. Connect GitHub Repository

1. Log in to your Zeabur dashboard
2. Click "New Project"
3. Select "Deploy from GitHub"
4. Connect your GitHub account and select the repository

### 2. Configure Git Settings

In your service settings, under "Git Settings":
- **Branch**: `AI-experts-OS` (or your desired branch)
- **Tag**: `v0.7.8-sharp-fix2` (or latest tag)

### 3. Add MongoDB

1. In your project, click "Add Service"
2. Select "MongoDB"
3. Zeabur will automatically create a MongoDB instance and inject the `MONGO_URI`

### 4. Configure Environment Variables

In your service settings, add these essential environment variables:

```env
# Required encryption keys (generate secure random strings)
CREDS_KEY=<32-character-random-string>
CREDS_IV=<16-character-random-string>
JWT_SECRET=<long-random-string>
JWT_REFRESH_SECRET=<another-long-random-string>

# Server settings
HOST=0.0.0.0
PORT=3080
NODE_ENV=production

# Features
ALLOW_REGISTRATION=true
FILE_UPLOAD=true
IMAGE_UPLOAD=true

# Optional: AI Provider Keys
OPENAI_API_KEY=<your-openai-key>
ANTHROPIC_API_KEY=<your-anthropic-key>
GOOGLE_API_KEY=<your-google-key>
```

### 5. Optional: Add Redis for Caching

1. Click "Add Service" in your project
2. Select "Redis"
3. Zeabur will automatically inject the `REDIS_URI`

### 6. Deploy

1. Save all your settings
2. Zeabur will automatically build and deploy your application
3. Monitor the build logs for any issues

## Generating Secure Keys

For generating secure random strings for your environment variables:

```bash
# For CREDS_KEY (32 characters)
openssl rand -hex 16

# For CREDS_IV (16 characters)
openssl rand -hex 8

# For JWT secrets
openssl rand -hex 32
```

## Custom Domain

1. In your service settings, go to "Domain"
2. Add your custom domain
3. Configure your DNS to point to Zeabur's servers

## Troubleshooting

### Sharp Module Issues
The Dockerfile has been optimized for Alpine Linux with proper sharp installation. If you still encounter issues:
1. Check the runtime logs
2. Ensure the latest tag is being used
3. Try redeploying the service

### Memory Issues
If the build fails due to memory:
1. The Dockerfile already sets `NODE_OPTIONS="--max-old-space-size=3072"`
2. Contact Zeabur support for increased build resources

### MongoDB Connection
- Zeabur automatically injects the MongoDB connection string
- No manual configuration needed
- Check if MongoDB service is running in your project

## Updates

To update your deployment:
1. Push changes to your GitHub repository
2. Create a new tag: `git tag v0.7.8-update && git push origin v0.7.8-update`
3. Update the tag in Zeabur's Git Settings
4. Zeabur will automatically redeploy

## Support

For LibreChat specific issues:
- Visit: https://github.com/danny-avila/LibreChat
- Documentation: https://docs.librechat.ai/

For Zeabur platform issues:
- Visit: https://zeabur.com/docs
- Contact Zeabur support 