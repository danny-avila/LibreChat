# LibreChat Deployment Guide for Zeabur

## 🎯 Quick Deployment Steps

### Step 1: Deploy Template
1. Visit [LibreChat Zeabur Template](https://zeabur.com/templates/0X2ZY8)
2. Click "Deploy" button
3. Wait for initial deployment to complete

### Step 2: Configure Environment Variables

In your Zeabur Dashboard → Variables tab → Click "Edit as Raw":

```env
# Core Credentials (REQUIRED - App will crash without these)
CREDS_KEY=f34be427ebb29de8d88c107a71546019685ed8b241d8f2ed00c3df97ad2566f0
CREDS_IV=e2341419ec3dd3d19b13a1a87fafcbfb

# JWT Tokens (REQUIRED - App will crash without these) 
JWT_SECRET=16f8c0ef4a5d391b26034086c628469d3f9f497f08163ab9b40137092f2909ef
JWT_REFRESH_SECRET=eaa5191f2914e30b9387fd84e254e4ba6fc51b4654968a9b0803b456a54b8418

# Node.js Configuration (REQUIRED)
NODE_ENV=production
NODE_OPTIONS=--max-old-space-size=4096
HOST=0.0.0.0

# Database Configuration (REQUIRED - Configure MongoDB connection)
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/LibreChat?retryWrites=true&w=majority

# Optional - API Keys for AI Services
OPENAI_API_KEY=user_provided
ANTHROPIC_API_KEY=user_provided
GOOGLE_KEY=user_provided

# Optional - Domain Configuration
DOMAIN_CLIENT=https://your-zeabur-domain.zeabur.app
DOMAIN_SERVER=https://your-zeabur-domain.zeabur.app
```

### Step 3: Generate Secure Keys (Optional)

If you want to generate your own secure keys instead of using the examples:

```bash
# Generate CREDS_KEY (32 bytes in hex = 64 characters)
openssl rand -hex 32

# Generate CREDS_IV (16 bytes in hex = 32 characters)  
openssl rand -hex 16

# Generate JWT_SECRET (32 bytes in hex = 64 characters)
openssl rand -hex 32

# Generate JWT_REFRESH_SECRET (32 bytes in hex = 64 characters)
openssl rand -hex 32
```

Or use the [LibreChat Credentials Generator](https://www.librechat.ai/toolkit/creds_generator).

### Step 4: MongoDB Setup

#### Option A: MongoDB Atlas (Recommended)
1. Create free MongoDB Atlas cluster at [mongodb.com](https://cloud.mongodb.com)
2. Get connection string 
3. Set `MONGO_URI` variable in Zeabur

#### Option B: Use Zeabur MongoDB Service
1. Add MongoDB service to your project in Zeabur
2. Zeabur will automatically inject `MONGODB_URI` variable

### Step 5: Restart and Verify

1. Click "Restart" on your LibreChat service in Zeabur
2. Check logs for successful startup
3. Visit your domain to verify deployment

## 🔧 Build Optimization Features

Our optimized build includes:

- ✅ **Fixed React-Virtualized errors** with automatic patches
- ✅ **Optimized code splitting** (25 chunks vs large monoliths)
- ✅ **Reduced bundle size** (main chunk: 3.1MB from 5MB)
- ✅ **PWA support** with large file handling
- ✅ **Memory optimization** for Node.js builds

## 📊 Resource Requirements

### Minimum Zeabur Plan:
- **Memory**: 512MB (recommended: 1GB)
- **CPU**: 0.5 vCPU (recommended: 1 vCPU)
- **Build Memory**: 4GB (handled by NODE_OPTIONS)

### Build Time:
- Initial build: ~3-5 minutes
- Subsequent builds: ~2-3 minutes

## 🚨 Troubleshooting

### Runtime Error: "Cannot read properties of undefined"
**Problem**: Missing environment variables
**Solution**: Ensure all REQUIRED variables are set (see Step 2)

### Build Failures
**Problem**: Memory issues or dependency conflicts
**Solution**: Our optimized build configuration should handle this automatically

### Zeabur-Specific Issues
**Problem**: Service won't start
**Solution**: Check Variables tab and ensure all required variables are set

## 🛡️ Security Notes

1. **Never commit** credentials to version control
2. **Regenerate** default keys for production use
3. **Use MongoDB Atlas** with proper network restrictions
4. **Enable authentication** in production (ALLOW_REGISTRATION=false)

## 📋 Health Check

After deployment, verify these endpoints:

- `https://your-domain.zeabur.app` - Main application
- `https://your-domain.zeabur.app/api/health` - API health check

## 📚 Additional Resources

- [LibreChat Documentation](https://docs.librechat.ai/)
- [Zeabur Documentation](https://zeabur.com/docs)
- [Environment Variables Reference](https://www.librechat.ai/docs/configuration/dotenv)
- [LibreChat Features](https://www.librechat.ai/docs/features)

---

**Status**: ✅ Ready for production deployment with optimized builds and proper configuration.

For support: [LibreChat Discord](https://discord.librechat.ai/) | [Zeabur Discord](https://zeabur.com/dc)
