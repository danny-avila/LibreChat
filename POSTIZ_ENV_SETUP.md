# Postiz Environment Variables Setup

**Date:** 2026-02-26  
**Status:** ✅ Complete

---

## What Was Done

Converted the Postiz deployment to use environment variables from a `.env` file instead of hardcoded values in `docker-compose.yml`.

### Benefits:
✅ **Security**: Secrets are in `.env` file (can be gitignored)  
✅ **Flexibility**: Easy to change values without editing docker-compose  
✅ **Portability**: Same docker-compose works for dev/staging/prod  
✅ **Best Practice**: Industry standard for Docker deployments  

---

## Files Created/Modified

### 1. `.env` File Created
**Location:** `postiz-deployment/.env`

Contains all configuration:
- Server URLs (MAIN_URL, FRONTEND_URL, etc.)
- Security (JWT_SECRET)
- Database credentials
- Redis URL
- Temporal settings
- **Ports** (POSTIZ_PORT, TEMPORAL_UI_PORT, TEMPORAL_PORT)
- **OAuth credentials** for all platforms
- Storage settings
- Payment/Stripe settings

### 2. `docker-compose.yml` Updated
**Location:** `postiz-deployment/docker-compose.yml`

Changes:
- Added `env_file: - .env` to load environment variables
- Replaced hardcoded values with `${VARIABLE_NAME}`
- Used `${VARIABLE:-default}` for optional values
- Ports now configurable via env vars

---

## How to Use

### For Development (localhost)

1. **Use the existing `.env` file:**
   ```bash
   cd postiz-deployment
   # .env is already configured for localhost
   ```

2. **Start Postiz:**
   ```bash
   docker-compose up -d
   ```

3. **Access:**
   - Postiz: http://localhost:4007
   - Temporal UI: http://localhost:8081

### For Server Deployment

1. **Copy `.env` file to your server**

2. **Update URLs in `.env`:**
   ```env
   MAIN_URL=https://postiz.yourdomain.com
   FRONTEND_URL=https://postiz.yourdomain.com
   NEXT_PUBLIC_BACKEND_URL=https://postiz.yourdomain.com/api
   ```

3. **Update JWT secret (IMPORTANT!):**
   ```env
   JWT_SECRET=your_random_secure_string_here_change_this
   ```

4. **Update database passwords:**
   ```env
   POSTGRES_PASSWORD=your_secure_password
   POSTGRES_TEMPORAL_PWD=your_secure_password
   ```

5. **Deploy:**
   ```bash
   docker-compose up -d
   ```

---

## Port Configuration

Ports are now configurable via `.env`:

```env
POSTIZ_PORT=4007          # Main Postiz application
TEMPORAL_UI_PORT=8081     # Temporal UI (changed from 8080 to avoid conflicts)
TEMPORAL_PORT=7233        # Temporal server
```

**Why port 8081 for Temporal UI?**
- Port 8080 was already in use on your server
- Changed to 8081 to avoid conflicts
- Can be changed to any available port in `.env`

---

## OAuth Credentials

All OAuth credentials are in `.env`:

```env
# X (Twitter)
X_API_KEY=your_key
X_API_SECRET=your_secret

# LinkedIn
LINKEDIN_CLIENT_ID=your_client_id
LINKEDIN_CLIENT_SECRET=your_secret

# Add more platforms as needed...
```

**To add new platform:**
1. Get OAuth credentials from platform's developer portal
2. Add to `.env` file
3. Restart Postiz: `docker-compose restart postiz`

---

## Security Best Practices

### ✅ DO:
- Keep `.env` file secure
- Use strong, random JWT_SECRET
- Use strong database passwords
- Change default passwords in production
- Add `.env` to `.gitignore`

### ❌ DON'T:
- Commit `.env` to git
- Share `.env` file publicly
- Use default passwords in production
- Hardcode secrets in docker-compose

---

## Troubleshooting

### Port Already in Use
If you get "port already allocated" error:

1. Check which port is in use:
   ```bash
   netstat -ano | findstr "8080"  # Windows
   lsof -i :8080                   # Linux/Mac
   ```

2. Change port in `.env`:
   ```env
   TEMPORAL_UI_PORT=8082  # or any available port
   ```

3. Restart:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

### Environment Variables Not Loading
If changes to `.env` aren't taking effect:

1. Restart containers:
   ```bash
   docker-compose down
   docker-compose up -d
   ```

2. Force recreate:
   ```bash
   docker-compose up -d --force-recreate
   ```

### OAuth Not Working
If OAuth connections fail:

1. Check credentials in `.env`
2. Verify callback URLs in platform developer portals
3. Ensure URLs match (localhost vs domain)
4. Check Postiz logs:
   ```bash
   docker logs postiz
   ```

---

## Example: Deploying to Production

1. **On your server, create `.env`:**
   ```bash
   cd /path/to/postiz-deployment
   nano .env
   ```

2. **Update for production:**
   ```env
   # Production URLs
   MAIN_URL=https://postiz.yourdomain.com
   FRONTEND_URL=https://postiz.yourdomain.com
   NEXT_PUBLIC_BACKEND_URL=https://postiz.yourdomain.com/api
   
   # Strong secrets
   JWT_SECRET=generate_random_64_char_string_here
   POSTGRES_PASSWORD=strong_random_password
   POSTGRES_TEMPORAL_PWD=another_strong_password
   
   # OAuth credentials (from platform developer portals)
   X_API_KEY=your_production_key
   X_API_SECRET=your_production_secret
   LINKEDIN_CLIENT_ID=your_production_client_id
   LINKEDIN_CLIENT_SECRET=your_production_secret
   
   # Ports (use defaults or customize)
   POSTIZ_PORT=4007
   TEMPORAL_UI_PORT=8081
   TEMPORAL_PORT=7233
   ```

3. **Deploy:**
   ```bash
   docker-compose up -d
   ```

4. **Verify:**
   ```bash
   docker ps  # Check all containers are running
   docker logs postiz  # Check for errors
   ```

---

## Next Steps

1. ✅ `.env` file created with all variables
2. ✅ `docker-compose.yml` updated to use env vars
3. ✅ Port conflict fixed (Temporal UI on 8081)
4. ⏳ Deploy to server
5. ⏳ Update OAuth callback URLs for production domain
6. ⏳ Test OAuth connections

---

## Summary

Your Postiz deployment now uses environment variables properly! This makes it:
- More secure (secrets in .env, not in code)
- More flexible (easy to change config)
- Production-ready (same setup for dev/prod)
- Easier to deploy (just update .env file)

The port conflict is also fixed - Temporal UI now uses port 8081 instead of 8080.

---

*Last updated: 2026-02-26*
