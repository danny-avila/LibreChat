# LibreChat: Complete Setup Guide
### Local Development → GitHub → Claude Code + Cursor → Google Cloud Run

> **Version:** February 2026  
> **Difficulty:** Intermediate  
> **Time estimate:** 2–4 hours (first time)  
> **Covers:** Tool installation, local Docker setup, MongoDB Atlas, GCP project setup, Cloud Run deployment, CI/CD with GitHub Actions

---

## Table of Contents

1. [System Requirements](#1-system-requirements)
2. [Install Required Tools](#2-install-required-tools)
   - 2.1 [Git](#21-git)
   - 2.2 [Docker Desktop](#22-docker-desktop)
   - 2.3 [Node.js (v20+)](#23-nodejs-v20)
   - 2.4 [Cursor IDE](#24-cursor-ide)
   - 2.5 [Claude Code CLI](#25-claude-code-cli)
   - 2.6 [Google Cloud CLI (gcloud)](#26-google-cloud-cli-gcloud)
3. [Create Required Accounts & Services](#3-create-required-accounts--services)
   - 3.1 [GitHub Account](#31-github-account)
   - 3.2 [MongoDB Atlas (Free Database)](#32-mongodb-atlas-free-database)
   - 3.3 [Google Cloud Account](#33-google-cloud-account)
   - 3.4 [Anthropic API Key (for Claude)](#34-anthropic-api-key-for-claude)
4. [Fork & Clone LibreChat](#4-fork--clone-librechat)
5. [Local Setup with Docker](#5-local-setup-with-docker)
6. [Customize with Cursor & Claude Code](#6-customize-with-cursor--claude-code)
7. [Prepare for Cloud Deployment](#7-prepare-for-cloud-deployment)
   - 7.1 [Configure MongoDB Atlas for Production](#71-configure-mongodb-atlas-for-production)
   - 7.2 [Set Up Google Cloud Project](#72-set-up-google-cloud-project)
   - 7.3 [Create Artifact Registry Repository](#73-create-artifact-registry-repository)
   - 7.4 [Build & Push Docker Image](#74-build--push-docker-image)
   - 7.5 [Store Secrets in GCP Secret Manager](#75-store-secrets-in-gcp-secret-manager)
8. [Deploy to Google Cloud Run](#8-deploy-to-google-cloud-run)
9. [Set Up CI/CD with GitHub Actions](#9-set-up-cicd-with-github-actions)
10. [Custom Domain & HTTPS](#10-custom-domain--https)
11. [Keeping LibreChat Updated](#11-keeping-librechat-updated)
12. [Troubleshooting](#12-troubleshooting)
13. [Quick Reference Cheatsheet](#13-quick-reference-cheatsheet)

---

## 1. System Requirements

Before starting, confirm your machine meets these requirements:

| Requirement | Minimum | Recommended |
|---|---|---|
| OS | macOS 12+, Windows 10, Ubuntu 20.04 | macOS 14+, Ubuntu 22.04 |
| RAM | 8 GB | 16 GB |
| Disk | 20 GB free | 40 GB free |
| CPU | 4 cores | 8 cores |
| Internet | Required | Stable broadband |

> **Windows Users:** All terminal commands in this guide should be run in **Git Bash**, **WSL 2** (Windows Subsystem for Linux), or **PowerShell** where noted. WSL 2 is strongly recommended for the best Docker + Linux compatibility.

---

## 2. Install Required Tools

### 2.1 Git

Git is used to clone the LibreChat repository, manage your code, and push changes to GitHub.

#### macOS
```bash
# Option A: Install via Homebrew (recommended)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git

# Option B: Install via Xcode Command Line Tools
xcode-select --install
```

#### Windows
Download and run the installer from [https://git-scm.com/download/win](https://git-scm.com/download/win).  
During installation, select **"Git from the command line and also from 3rd-party software"** and **"Use bundled OpenSSH"**.

#### Ubuntu / Debian
```bash
sudo apt update && sudo apt install git -y
```

#### Verify installation
```bash
git --version
# Expected output: git version 2.x.x
```

#### Configure Git (required)
```bash
git config --global user.name "Your Name"
git config --global user.email "your@email.com"

# Set default branch name to 'main'
git config --global init.defaultBranch main
```

---

### 2.2 Docker Desktop

Docker runs LibreChat and all its dependencies (MongoDB, MeiliSearch) in isolated containers — no manual dependency installation needed.

#### macOS
1. Go to [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
2. Download **Docker Desktop for Mac** — choose **Apple Silicon** (M1/M2/M3) or **Intel** based on your chip
3. Open the `.dmg` file and drag Docker to Applications
4. Launch Docker Desktop from Applications and complete the setup wizard
5. Wait for Docker to show **"Running"** in the menu bar

#### Windows
1. **First, enable WSL 2** (if not already done):
   ```powershell
   # Run in PowerShell as Administrator
   wsl --install
   # Restart your computer when prompted
   ```
2. Download Docker Desktop from [https://www.docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop)
3. During installation, ensure **"Use WSL 2 based engine"** is checked
4. After installation, open Docker Desktop and finish the setup wizard

#### Ubuntu / Linux
```bash
# Remove old Docker versions
sudo apt remove docker docker-engine docker.io containerd runc 2>/dev/null

# Add Docker's official GPG key and repository
sudo apt update
sudo apt install ca-certificates curl gnupg lsb-release -y
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine and Compose
sudo apt update
sudo apt install docker-ce docker-ce-cli containerd.io docker-compose-plugin -y

# Allow running Docker without sudo
sudo usermod -aG docker $USER
newgrp docker
```

#### Verify installation
```bash
docker --version
# Expected: Docker version 24.x.x or higher

docker compose version
# Expected: Docker Compose version v2.x.x
```

> **Important:** Make sure Docker Desktop is running (the whale icon is in your menu bar / system tray) before proceeding. Docker commands will fail if the daemon isn't active.

---

### 2.3 Node.js (v20+)

Node.js is required to run Claude Code and for local npm-based tasks.

#### All platforms — recommended via `nvm` (Node Version Manager)

**macOS / Linux / WSL:**
```bash
# Install nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash

# Reload shell config
source ~/.bashrc    # or ~/.zshrc if using zsh (macOS default)
source ~/.bash_profile

# Install and use Node.js v20
nvm install 20
nvm use 20
nvm alias default 20
```

**Windows (without WSL):**  
Use the official Windows installer from [https://nodejs.org](https://nodejs.org) — download the **LTS** version (v20.x).

#### Verify installation
```bash
node --version
# Expected: v20.x.x or higher

npm --version
# Expected: 10.x.x or higher
```

---

### 2.4 Cursor IDE

Cursor is an AI-powered code editor (fork of VS Code) that lets you edit files with AI assistance inline.

1. Go to [https://cursor.com](https://cursor.com) and click **Download**
2. Run the installer for your OS:
   - **macOS:** Open the `.dmg`, drag Cursor to Applications
   - **Windows:** Run the `.exe` installer
   - **Linux:** Run the `.AppImage` or use the `.deb` package
3. Launch Cursor and sign in (or skip — you can use it without an account with limited AI features)
4. Install the recommended extensions when prompted (ESLint, Prettier, Docker)

#### Configure Claude in Cursor (optional but recommended)
1. Open Cursor settings: `Cmd+,` (macOS) or `Ctrl+,` (Windows/Linux)
2. Search for **"Model"** and select `claude-3-5-sonnet` or `claude-3-opus` as your preferred model
3. Add your Anthropic API key under **Cursor → Preferences → AI → API Keys**

---

### 2.5 Claude Code CLI

Claude Code is Anthropic's AI-powered terminal tool for agentic coding. It reads your entire codebase and can make multi-file edits based on natural language instructions.

#### Install globally via npm
```bash
npm install -g @anthropic-ai/claude-code
```

#### Authenticate
```bash
claude auth
# This will open a browser window to authenticate with your Anthropic account
# OR: set the environment variable directly:
export ANTHROPIC_API_KEY="sk-ant-your-key-here"
```

> Add the export line to your `~/.bashrc` or `~/.zshrc` so it persists across terminal sessions.

#### Verify installation
```bash
claude --version
# Expected: @anthropic-ai/claude-code x.x.x
```

#### Basic Claude Code usage
```bash
# Start an interactive session in your project directory
cd /path/to/LibreChat
claude

# Or run a one-shot command
claude "Explain what docker-compose.yml does in this project"
claude "Add a health check endpoint to the API"
```

---

### 2.6 Google Cloud CLI (gcloud)

The gcloud CLI lets you manage GCP resources, deploy to Cloud Run, and push Docker images — all from your terminal.

#### macOS
```bash
# Via Homebrew (easiest)
brew install --cask google-cloud-sdk

# OR via curl installer
curl https://sdk.cloud.google.com | bash
exec -l $SHELL  # restart your shell
```

#### Windows
Download and run the installer from:  
[https://cloud.google.com/sdk/docs/install-sdk#windows](https://cloud.google.com/sdk/docs/install-sdk#windows)

During installation, leave all checkboxes checked (installs `gcloud`, `gsutil`, `bq`).

#### Ubuntu / Linux
```bash
# Add Google Cloud SDK repository
echo "deb [signed-by=/usr/share/keyrings/cloud.google.gpg] \
  https://packages.cloud.google.com/apt cloud-sdk main" | \
  sudo tee /etc/apt/sources.list.d/google-cloud-sdk.list

curl https://packages.cloud.google.com/apt/doc/apt-key.gpg | \
  sudo apt-key --keyring /usr/share/keyrings/cloud.google.gpg add -

sudo apt update && sudo apt install google-cloud-cli -y
```

#### Initialize and log in
```bash
gcloud init
# This will:
# 1. Open a browser to authenticate your Google account
# 2. Ask you to select or create a GCP project
# 3. Set a default compute region
```

#### Verify installation
```bash
gcloud --version
# Expected: Google Cloud SDK xxx.x.x
```

---

## 3. Create Required Accounts & Services

### 3.1 GitHub Account

If you don't already have one:

1. Go to [https://github.com/signup](https://github.com/signup)
2. Enter your email, create a password, and choose a username
3. Verify your email address
4. **Enable two-factor authentication** (highly recommended for security): GitHub → Settings → Password and authentication → Two-factor authentication

#### Set up SSH key for GitHub (recommended)
```bash
# Generate a new SSH key
ssh-keygen -t ed25519 -C "your@email.com"
# Press Enter to accept default file location (~/.ssh/id_ed25519)
# Enter a passphrase when prompted

# Start the SSH agent
eval "$(ssh-agent -s)"

# Add your key to the agent
ssh-add ~/.ssh/id_ed25519

# Copy your public key to clipboard
# macOS:
pbcopy < ~/.ssh/id_ed25519.pub
# Linux:
cat ~/.ssh/id_ed25519.pub  # then manually copy the output
# Windows (Git Bash):
clip < ~/.ssh/id_ed25519.pub
```

Then on GitHub:  
**Settings → SSH and GPG keys → New SSH key** → paste the key → Save.

Test the connection:
```bash
ssh -T git@github.com
# Expected: Hi username! You've successfully authenticated...
```

---

### 3.2 MongoDB Atlas (Free Database)

LibreChat needs MongoDB to store users, conversations, messages, and configuration. MongoDB Atlas provides a free hosted cluster perfect for this use case.

1. Go to [https://cloud.mongodb.com](https://cloud.mongodb.com) and click **Try Free**
2. Sign up with your email or Google/GitHub account
3. Choose **"Build a database"** → Select **M0 (Free)**
4. Choose a cloud provider (Google Cloud) and a region that matches your Cloud Run region (e.g., `us-central1` / Iowa)
5. Name your cluster — e.g., `librechat-cluster`
6. Click **Create**

#### Create a database user
1. In the left sidebar, click **Database Access**
2. Click **Add New Database User**
3. Select **Password** authentication
4. Enter a username (e.g., `librechat-user`) and a strong password
5. Under **Database User Privileges**, select **Atlas Admin** (or restrict to your database if preferred)
6. Click **Add User**

#### Allow network access
1. In the left sidebar, click **Network Access**
2. Click **Add IP Address**
3. Click **Allow Access from Anywhere** (adds `0.0.0.0/0`)
   > This is required for Cloud Run since it uses dynamic IPs. You can restrict this later using GCP's VPC connector for production.
4. Click **Confirm**

#### Get your connection string
1. In the left sidebar, click **Database** → **Connect** on your cluster
2. Choose **Drivers**
3. Select **Node.js** and version **5.5 or later**
4. Copy the connection string — it looks like:
   ```
   mongodb+srv://<username>:<password>@librechat-cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<username>` and `<password>` with what you set above
6. Add the database name before `?`:
   ```
   mongodb+srv://librechat-user:yourpassword@librechat-cluster.xxxxx.mongodb.net/LibreChat?retryWrites=true&w=majority
   ```
7. **Save this string somewhere safe** — you'll need it soon.

---

### 3.3 Google Cloud Account

1. Go to [https://cloud.google.com](https://cloud.google.com) and click **Get started for free**
2. Sign in with your Google account
3. Complete the account setup — you'll need to provide billing information (credit card) but Google gives **$300 in free credits** for 90 days and Cloud Run has a generous always-free tier
4. After setup, you'll land in the **Google Cloud Console** at [https://console.cloud.google.com](https://console.cloud.google.com)

> **Free tier note:** Cloud Run gives you 2 million requests/month, 360,000 GB-seconds of memory, and 180,000 vCPU-seconds for free every month. LibreChat usage for personal/small team use typically stays within these limits.

---

### 3.4 Anthropic API Key (for Claude)

To use Claude models inside LibreChat:

1. Go to [https://console.anthropic.com](https://console.anthropic.com)
2. Sign up or log in
3. Navigate to **API Keys** → **Create Key**
4. Name it (e.g., `librechat-prod`) and copy the key — it starts with `sk-ant-`
5. **Store it securely** — you won't be able to see it again after closing the dialog

> You can also add other AI provider keys (OpenAI, Google Gemini, etc.) to LibreChat later via the `.env` file.

---

## 4. Fork & Clone LibreChat

### Step 1: Fork the repository

Forking creates your own copy of LibreChat on GitHub that you control. This lets you:
- Push custom configurations
- Trigger automated deployments on push
- Pull future updates from the original repo

1. Go to [https://github.com/danny-avila/LibreChat](https://github.com/danny-avila/LibreChat)
2. Click the **Fork** button (top right)
3. Under **Owner**, select your GitHub username
4. Leave **Repository name** as `LibreChat`
5. Click **Create fork**

### Step 2: Clone your fork locally

```bash
# Replace YOUR_USERNAME with your GitHub username
git clone git@github.com:YOUR_USERNAME/LibreChat.git

# OR use HTTPS if you didn't set up SSH:
git clone https://github.com/YOUR_USERNAME/LibreChat.git

# Enter the project directory
cd LibreChat
```

### Step 3: Add the upstream remote

This lets you pull updates from the original LibreChat repo later:

```bash
git remote add upstream https://github.com/danny-avila/LibreChat.git

# Verify your remotes
git remote -v
# Should show:
# origin    git@github.com:YOUR_USERNAME/LibreChat.git (fetch)
# origin    git@github.com:YOUR_USERNAME/LibreChat.git (push)
# upstream  https://github.com/danny-avila/LibreChat.git (fetch)
# upstream  https://github.com/danny-avila/LibreChat.git (push)
```

---

## 5. Local Setup with Docker

### Step 1: Open the project in Cursor

```bash
# From inside the LibreChat directory:
cursor .
```

Cursor will open the full project. Take a moment to explore the structure:
- `api/` — Backend Node.js server
- `client/` — React frontend
- `docker-compose.yml` — Defines all services (api, mongodb, meilisearch, rag)
- `.env.example` — Template for all environment variables
- `librechat.yaml` — Optional: endpoint, model, and feature configuration

### Step 2: Copy the environment file

```bash
cp .env.example .env
```

> **Important:** `.env` is already listed in `.gitignore` — it will **not** be committed to GitHub. Never remove it from `.gitignore`.

### Step 3: Generate secure random secrets

LibreChat requires several cryptographic secrets. Generate them with:

```bash
# Run this 4 times to generate 4 different secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 4 outputs — you'll use them for `CREDS_KEY`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, and a spare.

For `CREDS_IV`, you need exactly 16 bytes (32 hex chars) — the output from above is already the right length.

### Step 4: Edit your `.env` file

Open `.env` in Cursor and configure the following key values. Use `Cmd+F` to find each variable:

```env
#=================================================
# Server
#=================================================
HOST=localhost
PORT=3080
NODE_ENV=development

#=================================================
# MongoDB - for local development use the Docker service
#=================================================
MONGO_URI=mongodb://127.0.0.1:27017/LibreChat

#=================================================
# Application Secrets — paste your generated values here
#=================================================
CREDS_KEY=paste_your_first_64char_hex_string_here
CREDS_IV=paste_first_32chars_of_another_hex_string
JWT_SECRET=paste_your_third_64char_hex_string_here
JWT_REFRESH_SECRET=paste_your_fourth_64char_hex_string_here

#=================================================
# AI Providers — add whichever you use
#=================================================
ANTHROPIC_API_KEY=sk-ant-your-key-here
OPENAI_API_KEY=sk-your-openai-key-here         # optional
GOOGLE_KEY=your-google-gemini-key-here          # optional

#=================================================
# Registration
#=================================================
ALLOW_REGISTRATION=true      # set to false after creating your account
ALLOW_SOCIAL_LOGIN=false

#=================================================
# Optional: MeiliSearch (full-text conversation search)
#=================================================
MEILI_HOST=http://meilisearch:7700
MEILI_MASTER_KEY=your-random-meilisearch-key-here
```

### Step 5: Create a `librechat.yaml` (optional but useful)

This file lets you customize which AI models and endpoints appear in the UI. Create it in the project root:

```bash
touch librechat.yaml
```

Add this starter config that enables Claude models:

```yaml
version: 1.3.4
cache: true

endpoints:
  anthropic:
    models:
      - claude-opus-4-5
      - claude-sonnet-4-5
      - claude-haiku-3-5
      - claude-sonnet-4-6
      - claude-opus-4-6
```

> **Important:** The `docker-compose.yml` does **not** mount `librechat.yaml` into the container by default. You must create a `docker-compose.override.yml` file to add the volume bind mount. Create this file in the project root:

```yaml
# docker-compose.override.yml
services:
  api:
    volumes:
      - type: bind
        source: ./librechat.yaml
        target: /app/librechat.yaml
```

> Docker Compose automatically merges this override file with `docker-compose.yml` when you run `docker compose up`. Without this, the API container will not see your `librechat.yaml` and will log a "file not found" error.

### Step 6: Start LibreChat with Docker Compose

```bash
docker compose up -d
```

This command:
1. Downloads all required Docker images (~2-3 GB first time)
2. Creates and starts containers for: `api`, `client`, `mongodb`, `meilisearch`, `rag_api`
3. Runs everything in the background (`-d` = detached)

**Watch the startup logs:**
```bash
docker compose logs -f api
# Wait until you see: "Server listening on port 3080"
# Press Ctrl+C to stop watching logs (containers keep running)
```

### Step 7: Access LibreChat locally

Open your browser and go to: [http://localhost:3080](http://localhost:3080)

You should see the LibreChat login/register page. Click **Register** to create your first account.

### Step 8: Test your setup

1. Log in with your new account
2. Start a new conversation
3. Select **Claude** (or another provider you configured) from the model dropdown
4. Send a test message and confirm you get a response

### Step 9: Useful local Docker commands

```bash
# Start all services
docker compose up -d

# Stop all services (data is preserved)
docker compose down

# Stop and delete all data (fresh start)
docker compose down -v

# View logs for a specific service
docker compose logs -f api          # backend
docker compose logs -f client       # frontend (if separate)
docker compose logs -f mongodb      # database

# Restart a single service after config changes
docker compose restart api

# See running containers and their status
docker compose ps

# Open a shell inside the API container (for debugging)
docker compose exec api sh
```

### Step 10: Save your config to GitHub

```bash
# Add only safe files (not .env which has secrets)
git add librechat.yaml

# Commit
git commit -m "chore: add initial librechat.yaml config"

# Push to your fork
git push origin main
```

---

## 6. Customize with Cursor & Claude Code

### Using Cursor for configuration

Cursor's AI can help you write and edit `librechat.yaml` and `.env` quickly.

**Inline edit with `Cmd+K`:**
1. Place your cursor inside `librechat.yaml`
2. Press `Cmd+K` (macOS) or `Ctrl+K` (Windows/Linux)
3. Type your instruction, e.g.:
   - "Add an OpenRouter endpoint with 6 models including Mistral and Llama 3"
   - "Add a system prompt for all conversations"
   - "Show me what all these environment variables in .env do"

**Chat with codebase using `Cmd+L`:**
1. Press `Cmd+L` to open the Cursor chat sidebar
2. Ask questions like:
   - "What does the `RAG_API_URL` variable control?"
   - "Which files would I edit to change the default model?"
   - "Explain the docker-compose.yml services and which ones are optional"

### Using Claude Code for deeper modifications

Claude Code can understand and modify the entire LibreChat codebase.

```bash
# Start Claude Code in the project directory
cd LibreChat
claude
```

**Example prompts for Claude Code:**

```
# Understand the architecture
> Give me an overview of how the frontend and backend communicate in this project

# Optimize for Cloud Run
> Create a docker-compose.override.yml that disables MeiliSearch and RAG API 
  to reduce memory usage for a single-container Cloud Run deployment

# Add features
> Where would I add a custom welcome message that appears in new conversations?

# Debugging
> I'm getting a MongoDB connection error when I start. 
  Check my docker-compose.yml and .env and diagnose the issue

# Security
> Review my .env.example and tell me which variables are security-critical 
  and what values I should never use in production
```

Claude Code can make multi-file edits — always review the changes it proposes before accepting.

### Create a Cloud Run-optimized Docker Compose override

For Cloud Run, you'll run a single API container (not the full docker-compose stack). But locally, you may want to test with a lighter setup. Ask Claude Code:

> "Create a `docker-compose.cloud.yml` that runs only the API container and expects MONGO_URI and other secrets from environment variables, without any internal MongoDB or MeiliSearch"

Or create it manually:

```yaml
# docker-compose.cloud.yml
# Used for testing the production-like single-container setup locally
services:
  api:
    image: ghcr.io/danny-avila/librechat:latest
    ports:
      - "3080:3080"
    environment:
      - HOST=0.0.0.0
      - PORT=3080
      - NODE_ENV=production
      - MONGO_URI=${MONGO_URI}          # pulled from your .env
      - JWT_SECRET=${JWT_SECRET}
      - JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
      - CREDS_KEY=${CREDS_KEY}
      - CREDS_IV=${CREDS_IV}
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - ALLOW_REGISTRATION=true
```

Test this setup:
```bash
docker compose -f docker-compose.cloud.yml up
# Visit http://localhost:3080 and verify it works with Atlas MongoDB
```

---

## 7. Prepare for Cloud Deployment

### 7.1 Configure MongoDB Atlas for Production

Update your `.env` (for local testing) to use the Atlas URI:

```env
MONGO_URI=mongodb+srv://librechat-user:yourpassword@librechat-cluster.xxxxx.mongodb.net/LibreChat?retryWrites=true&w=majority
```

Restart the API container to test connectivity:
```bash
docker compose restart api
docker compose logs -f api
# Should connect to Atlas without errors
```

---

### 7.2 Set Up Google Cloud Project

```bash
# Log in to Google Cloud
gcloud auth login
# A browser window will open — log in with your Google account

# Create a new project (use a unique project ID — must be globally unique)
gcloud projects create librechat-prod-2026 --name="LibreChat Production"

# Set this as your active project
gcloud config set project librechat-prod-2026

# Check it's set correctly
gcloud config get-value project
# Expected: librechat-prod-2026

# Link billing account (required to enable APIs)
# First, list your billing accounts
gcloud billing accounts list
# Then link (replace BILLING_ACCOUNT_ID with the ID from the list above)
gcloud billing projects link librechat-prod-2026 \
  --billing-account=BILLING_ACCOUNT_ID

# Enable all required APIs in one command
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com

# Wait ~1-2 minutes for APIs to enable, then verify
gcloud services list --enabled --filter="name:(run.googleapis.com OR artifactregistry.googleapis.com)"
```

---

### 7.3 Create Artifact Registry Repository

Google Cloud Run requires Docker images to be stored in Artifact Registry (GCP's private container registry).

```bash
# Create the repository
gcloud artifacts repositories create librechat \
  --repository-format=docker \
  --location=us-central1 \
  --description="LibreChat Docker images"

# Verify it was created
gcloud artifacts repositories list

# Configure Docker to authenticate with Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev
# When prompted, type Y to confirm
```

---

### 7.4 Build & Push Docker Image

You have two options:

#### Option A: Re-tag the official LibreChat image (faster, no customizations)

Use this if you haven't modified any source code:

```bash
# Pull the latest official image
docker pull ghcr.io/danny-avila/librechat:latest

# Tag it for your Artifact Registry
docker tag ghcr.io/danny-avila/librechat:latest \
  us-central1-docker.pkg.dev/librechat-prod-2026/librechat/app:latest

# Push to Artifact Registry
docker push us-central1-docker.pkg.dev/librechat-prod-2026/librechat/app:latest
```

#### Option B: Build from your fork (required if you made code changes)

```bash
# From your LibreChat directory
docker build \
  --platform linux/amd64 \
  -t us-central1-docker.pkg.dev/librechat-prod-2026/librechat/app:latest \
  .

# Push the image
docker push us-central1-docker.pkg.dev/librechat-prod-2026/librechat/app:latest
```

> **Apple Silicon (M1/M2/M3) note:** Cloud Run requires `linux/amd64` images. Always include `--platform linux/amd64` when building on Apple Silicon. The build will take longer (it's emulating x86) but the image will run correctly on Cloud Run.

#### Verify the image was pushed
```bash
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/librechat-prod-2026/librechat
```

---

### 7.5 Store Secrets in GCP Secret Manager

**Never** pass secrets as plain environment variables in Cloud Run. Use Secret Manager instead — it encrypts secrets at rest and gives you access control and audit logging.

```bash
# Helper function to create a secret from a string value
create_secret() {
  echo -n "$2" | gcloud secrets create "$1" \
    --data-file=- \
    --replication-policy=automatic
  echo "Created secret: $1"
}

# Create all required secrets
# Replace the values with your actual secrets from your .env file

create_secret "MONGO_URI" "mongodb+srv://librechat-user:yourpassword@librechat-cluster.xxxxx.mongodb.net/LibreChat?retryWrites=true&w=majority"

create_secret "JWT_SECRET" "your_jwt_secret_value_here"

create_secret "JWT_REFRESH_SECRET" "your_jwt_refresh_secret_value_here"

create_secret "CREDS_KEY" "your_creds_key_value_here"

create_secret "CREDS_IV" "your_creds_iv_value_here"

create_secret "ANTHROPIC_API_KEY" "sk-ant-your-key-here"

# If using OpenAI:
# create_secret "OPENAI_API_KEY" "sk-your-openai-key-here"
```

Or create them one at a time (more explicit):
```bash
echo -n "your_jwt_secret" | gcloud secrets create JWT_SECRET --data-file=-
```

#### Grant Cloud Run permission to access secrets

```bash
# Get your project number (different from project ID)
PROJECT_NUMBER=$(gcloud projects describe librechat-prod-2026 \
  --format="value(projectNumber)")

echo "Project number: $PROJECT_NUMBER"

# Grant the default Compute service account access to Secret Manager
gcloud projects add-iam-policy-binding librechat-prod-2026 \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

#### List and verify your secrets
```bash
gcloud secrets list
# Should show: MONGO_URI, JWT_SECRET, JWT_REFRESH_SECRET, CREDS_KEY, CREDS_IV, ANTHROPIC_API_KEY
```

---

## 8. Deploy to Google Cloud Run

### Step 1: Run the deployment command

```bash
gcloud run deploy librechat \
  --image=us-central1-docker.pkg.dev/librechat-prod-2026/librechat/app:latest \
  --platform=managed \
  --region=us-central1 \
  --allow-unauthenticated \
  --port=3080 \
  --memory=2Gi \
  --cpu=2 \
  --cpu-throttling \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=300 \
  --set-secrets="MONGO_URI=MONGO_URI:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,CREDS_KEY=CREDS_KEY:latest,CREDS_IV=CREDS_IV:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
  --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,PORT=3080,ALLOW_REGISTRATION=true,MEILI_NO_ANALYTICS=true"
```

**Explanation of key flags:**

| Flag | Value | Why |
|---|---|---|
| `--memory` | `2Gi` | LibreChat API needs ~1.5GB minimum |
| `--cpu` | `2` | Matches memory allocation, improves performance |
| `--cpu-throttling` | — | CPU only allocated during requests (cost saving) |
| `--min-instances` | `0` | Scale to zero when not in use (free tier) |
| `--max-instances` | `3` | Limit scaling to control costs |
| `--timeout` | `300` | Allow 5 min for long AI responses |
| `--allow-unauthenticated` | — | Makes the URL publicly accessible |

### Step 2: Note your Cloud Run URL

After deployment succeeds, gcloud prints:
```
Service [librechat] revision [librechat-00001-xxx] has been deployed and is serving 100 percent of traffic.
Service URL: https://librechat-xxxxxxxxxx-uc.a.run.app
```

**Visit that URL in your browser — LibreChat is now live!**

### Step 3: Create your admin account

1. Open the Cloud Run URL
2. Click **Register** and create your account
3. After creating your account, **disable public registration** to prevent strangers from signing up:

```bash
gcloud run services update librechat \
  --region=us-central1 \
  --update-env-vars="ALLOW_REGISTRATION=false"
```

### Step 4: Verify deployment health

```bash
# View recent logs
gcloud run logs read \
  --service=librechat \
  --region=us-central1 \
  --limit=50

# View service details
gcloud run services describe librechat \
  --region=us-central1 \
  --format=yaml

# List all revisions
gcloud run revisions list --service=librechat --region=us-central1
```

### Step 5: Update an existing deployment

Whenever you push a new image, update Cloud Run to use it:

```bash
# After pushing a new image tagged with a commit hash or 'latest'
gcloud run services update librechat \
  --region=us-central1 \
  --image=us-central1-docker.pkg.dev/librechat-prod-2026/librechat/app:latest
```

### Step 6: Roll back to a previous version

```bash
# List all revisions
gcloud run revisions list --service=librechat --region=us-central1

# Route 100% of traffic to a specific revision
gcloud run services update-traffic librechat \
  --region=us-central1 \
  --to-revisions=librechat-00001-xxx=100
```

---

## 9. Set Up CI/CD with GitHub Actions

Automate your workflow so every push to `main` automatically builds and deploys a new version.

### Step 1: Create a GCP service account for GitHub Actions

```bash
# Create the service account
gcloud iam service-accounts create github-actions \
  --display-name="GitHub Actions CI/CD" \
  --project=librechat-prod-2026

# Grant required roles
gcloud projects add-iam-policy-binding librechat-prod-2026 \
  --member="serviceAccount:github-actions@librechat-prod-2026.iam.gserviceaccount.com" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding librechat-prod-2026 \
  --member="serviceAccount:github-actions@librechat-prod-2026.iam.gserviceaccount.com" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding librechat-prod-2026 \
  --member="serviceAccount:github-actions@librechat-prod-2026.iam.gserviceaccount.com" \
  --role="roles/iam.serviceAccountUser"

# Create and download a JSON key for this service account
gcloud iam service-accounts keys create gcp-sa-key.json \
  --iam-account=github-actions@librechat-prod-2026.iam.gserviceaccount.com
```

### Step 2: Add secrets to your GitHub repository

1. Open your forked repo on GitHub
2. Go to **Settings → Secrets and variables → Actions**
3. Click **New repository secret** for each:
   - **Name:** `GCP_SA_KEY` → **Value:** paste the entire contents of `gcp-sa-key.json`
   - **Name:** `GCP_PROJECT_ID` → **Value:** `librechat-prod-2026`
4. **Delete `gcp-sa-key.json` from your machine immediately after:**

```bash
rm gcp-sa-key.json
```

### Step 3: Create the GitHub Actions workflow file

```bash
mkdir -p .github/workflows
```

Create `.github/workflows/deploy.yml`:

```yaml
name: Build & Deploy to Cloud Run

on:
  push:
    branches:
      - main
  workflow_dispatch:    # allows manual trigger from GitHub UI

env:
  PROJECT_ID: ${{ secrets.GCP_PROJECT_ID }}
  REGION: us-central1
  REPO_NAME: librechat
  SERVICE_NAME: librechat
  IMAGE_NAME: app

jobs:
  build-and-deploy:
    name: Build, Push & Deploy
    runs-on: ubuntu-latest

    steps:
      # 1. Check out the code
      - name: Checkout repository
        uses: actions/checkout@v4

      # 2. Authenticate with Google Cloud
      - name: Authenticate to Google Cloud
        id: auth
        uses: google-github-actions/auth@v2
        with:
          credentials_json: ${{ secrets.GCP_SA_KEY }}

      # 3. Set up Cloud SDK
      - name: Set up Cloud SDK
        uses: google-github-actions/setup-gcloud@v2

      # 4. Configure Docker to use gcloud credentials
      - name: Configure Docker for Artifact Registry
        run: |
          gcloud auth configure-docker ${{ env.REGION }}-docker.pkg.dev --quiet

      # 5. Build the Docker image
      - name: Build Docker image
        run: |
          docker build \
            --platform linux/amd64 \
            --tag ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPO_NAME }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --tag ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPO_NAME }}/${{ env.IMAGE_NAME }}:latest \
            .

      # 6. Push the image to Artifact Registry
      - name: Push Docker image
        run: |
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPO_NAME }}/${{ env.IMAGE_NAME }}:${{ github.sha }}
          docker push ${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPO_NAME }}/${{ env.IMAGE_NAME }}:latest

      # 7. Deploy to Cloud Run
      - name: Deploy to Cloud Run
        run: |
          gcloud run deploy ${{ env.SERVICE_NAME }} \
            --image=${{ env.REGION }}-docker.pkg.dev/${{ env.PROJECT_ID }}/${{ env.REPO_NAME }}/${{ env.IMAGE_NAME }}:${{ github.sha }} \
            --platform=managed \
            --region=${{ env.REGION }} \
            --allow-unauthenticated \
            --port=3080 \
            --memory=2Gi \
            --cpu=2 \
            --min-instances=0 \
            --max-instances=3 \
            --timeout=300 \
            --set-secrets="MONGO_URI=MONGO_URI:latest,JWT_SECRET=JWT_SECRET:latest,JWT_REFRESH_SECRET=JWT_REFRESH_SECRET:latest,CREDS_KEY=CREDS_KEY:latest,CREDS_IV=CREDS_IV:latest,ANTHROPIC_API_KEY=ANTHROPIC_API_KEY:latest" \
            --set-env-vars="NODE_ENV=production,HOST=0.0.0.0,PORT=3080,ALLOW_REGISTRATION=false" \
            --quiet

      # 8. Print the service URL
      - name: Get service URL
        run: |
          URL=$(gcloud run services describe ${{ env.SERVICE_NAME }} \
            --region=${{ env.REGION }} \
            --format="value(status.url)")
          echo "🚀 Deployed to: $URL"
```

### Step 4: Commit and push the workflow

```bash
git add .github/workflows/deploy.yml
git commit -m "ci: add GitHub Actions Cloud Run deployment workflow"
git push origin main
```

### Step 5: Watch the first automated deployment

1. Go to your GitHub repo
2. Click the **Actions** tab
3. You'll see the workflow running — click it to see live logs
4. If everything is green, your deployment is fully automated!

From now on, every time you push code to `main`, GitHub Actions will automatically build and deploy the new version.

---

## 10. Custom Domain & HTTPS

Cloud Run gives you a default HTTPS URL, but you can map a custom domain (e.g., `chat.yourdomain.com`).

### Option A: Google Cloud Run domain mapping (simplest)

```bash
# Map your custom domain
gcloud run domain-mappings create \
  --service=librechat \
  --domain=chat.yourdomain.com \
  --region=us-central1
```

Run the command and follow the instructions to add a DNS record at your domain registrar. HTTPS is automatically provisioned via Let's Encrypt.

### Option B: Cloudflare (recommended for extra control)

1. Add your domain to Cloudflare (free plan works)
2. In Cloud Run Console → your service → **Manage Custom Domains**
3. Add your domain and note the provided IP or CNAME
4. In Cloudflare DNS, add a CNAME record:
   - **Name:** `chat`
   - **Target:** the CNAME provided by Cloud Run
   - **Proxy:** On (orange cloud) — enables Cloudflare's CDN and DDoS protection
5. SSL/TLS is handled by both Cloudflare and Cloud Run automatically

---

## 11. Keeping LibreChat Updated

The LibreChat team releases updates frequently. Pull them into your fork:

```bash
# Fetch the latest changes from the original repo
git fetch upstream

# Merge upstream main into your local main
git checkout main
git merge upstream/main

# If there are merge conflicts:
# Open conflicting files in Cursor and resolve them
# Then: git add . && git commit -m "merge: upstream updates"

# Push the merged changes to your fork
git push origin main
```

If CI/CD is set up, pushing to `main` will automatically trigger a new deployment.

**Check the LibreChat changelog before updating:**  
[https://www.librechat.ai/changelog](https://www.librechat.ai/changelog)

---

## 12. Troubleshooting

### Local Issues

**Docker containers won't start**
```bash
# Check for port conflicts (3080, 27017, 7700 must be free)
lsof -i :3080
lsof -i :27017

# Check Docker daemon is running
docker info

# View detailed error logs
docker compose logs api --tail=100
```

**"Cannot connect to MongoDB"**
```bash
# Verify your MONGO_URI in .env is correct
cat .env | grep MONGO_URI

# Test connection from inside the container
docker compose exec api sh -c 'node -e "const m = require(\"mongoose\"); m.connect(process.env.MONGO_URI).then(() => console.log(\"Connected!\")).catch(console.error)"'
```

**Port 3080 already in use**
```bash
# Find what's using the port
lsof -i :3080 -P -n | grep LISTEN

# Kill the process (replace PID with actual process ID)
kill -9 PID

# Or change LibreChat's port in docker-compose.yml:
# ports: - "3081:3080"
```

**"librechat.yaml: invalid config"**
- Validate your YAML at [https://www.yamllint.com](https://www.yamllint.com)
- Check indentation — YAML uses spaces, not tabs
- Ask Claude Code: "Check my librechat.yaml for syntax errors"

---

### Cloud Run Issues

**Deployment fails with "permission denied"**
```bash
# Verify the service account has the right roles
gcloud projects get-iam-policy librechat-prod-2026 \
  --flatten="bindings[].members" \
  --filter="bindings.members:github-actions@"
```

**Service starts but crashes immediately**
```bash
# View the startup logs
gcloud run logs read --service=librechat --region=us-central1 --limit=100

# Common causes:
# - Missing required environment variable
# - Invalid MONGO_URI (wrong password, IP not whitelisted)
# - Out of memory (increase --memory to 4Gi)
```

**"Error: Secret not found" in Cloud Run**
```bash
# List your secrets and verify names match
gcloud secrets list

# Check the secret has a version
gcloud secrets versions list MONGO_URI
```

**MongoDB Atlas "connection timed out" from Cloud Run**
- Go to Atlas → Network Access
- Confirm `0.0.0.0/0` is in the allowlist
- Confirm the Atlas cluster is in the same region as Cloud Run

**GitHub Actions failing**
```bash
# Common issues:
# 1. GCP_SA_KEY secret format is wrong — should be raw JSON, not base64
# 2. Service account missing IAM roles — re-add them
# 3. APIs not enabled — run: gcloud services enable run.googleapis.com

# Check the Actions log carefully for the specific error message
```

**Cold start too slow**
```bash
# Set minimum instances to 1 (prevents scaling to zero)
gcloud run services update librechat \
  --region=us-central1 \
  --min-instances=1
# Note: This costs ~$10-15/month for a 2 vCPU / 2 GiB instance
```

---

## 13. Quick Reference Cheatsheet

### Local Development

| Action | Command |
|---|---|
| Start all services | `docker compose up -d` |
| Stop all services | `docker compose down` |
| View API logs | `docker compose logs -f api` |
| Restart API only | `docker compose restart api` |
| Full reset (delete data) | `docker compose down -v` |
| Open in Cursor | `cursor .` |
| Start Claude Code | `claude` |
| Generate secret key | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

### Git Workflow

| Action | Command |
|---|---|
| Save changes | `git add . && git commit -m "message"` |
| Push to GitHub | `git push origin main` |
| Pull upstream updates | `git fetch upstream && git merge upstream/main` |
| Create a feature branch | `git checkout -b my-feature` |
| Merge feature branch | `git checkout main && git merge my-feature` |

### Google Cloud

| Action | Command |
|---|---|
| Login | `gcloud auth login` |
| Set project | `gcloud config set project PROJECT_ID` |
| Build & push image | `docker build --platform linux/amd64 -t IMAGE_URL . && docker push IMAGE_URL` |
| Deploy to Cloud Run | `gcloud run deploy librechat --image=IMAGE_URL --region=us-central1` |
| View deployment logs | `gcloud run logs read --service=librechat --region=us-central1` |
| Update environment var | `gcloud run services update librechat --update-env-vars KEY=VALUE` |
| Update a secret | `echo -n "new_value" \| gcloud secrets versions add SECRET_NAME --data-file=-` |
| List Cloud Run services | `gcloud run services list` |
| Get service URL | `gcloud run services describe librechat --region=us-central1 --format="value(status.url)"` |

---

## Appendix: File Structure Reference

```
LibreChat/
├── .env                        # Your local secrets (never commit)
├── .env.example                # Template for .env
├── librechat.yaml              # Model/endpoint config (safe to commit)
├── docker-compose.yml          # Full local stack definition
├── docker-compose.override.yml # Local dev overrides
├── Dockerfile                  # Used to build the production image
├── .github/
│   └── workflows/
│       └── deploy.yml          # CI/CD pipeline
├── api/                        # Backend Node.js/Express server
│   ├── server/                 # Express app, routes, middleware
│   ├── models/                 # MongoDB schemas
│   └── strategies/             # AI provider integrations
├── client/                     # React frontend
│   ├── src/
│   │   ├── components/         # UI components
│   │   └── store/              # Zustand state management
└── packages/                   # Shared utilities
```

---

## Appendix: Estimated Costs

| Service | Free Tier | Paid (approx) |
|---|---|---|
| **Cloud Run** | 2M req/mo, 360k GB-sec | ~$5–20/mo typical usage |
| **Artifact Registry** | 0.5 GB free | ~$0.10/GB/mo |
| **Secret Manager** | 6 secrets free | ~$0.06/10k ops |
| **MongoDB Atlas M0** | Always free (512 MB) | $57/mo for M10 |
| **Cloud Run min-instances=1** | — | ~$12/mo (2 vCPU/2Gi) |

For personal or small team use, staying on the free tiers of all services is realistic. Total cost for a low-traffic personal instance: **$0–$5/month**.

---

*Guide maintained separately from the official LibreChat docs. For LibreChat-specific questions, refer to [librechat.ai/docs](https://www.librechat.ai/docs) and the [LibreChat Discord](https://discord.librechat.ai).*
