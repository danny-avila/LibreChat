---
title: 🪟 Windows
description: Windows Installation Guides
weight: 0
---

# Windows Installation Guide

## **Recommended:**

[![Watch the video](https://img.youtube.com/vi/naUHHqpyOo4/maxresdefault.jpg)](https://youtu.be/naUHHqpyOo4)
Click on the thumbnail to open the video☝️
---

In this video we're going to install LibreChat on Windows 11 using Docker and Git.

#### Timestamps

- 0:00 - Intro
- 0:10 - Requirements
- 0:31 - Docker Installation
- 1:50 - Git Installation
- 2:27 - LibreChat Installation
- 3:07 - Start LibreChat
- 3:59 - Access to LibreChat
- 4:23 - Outro

#### Instructions
- To install LibreChat, you need Docker desktop and Git. Download them from these links:
  - Docker desktop: **[https://docs.docker.com/desktop/install/windows-install/](https://docs.docker.com/desktop/install/windows-install/)**
  - Git: **[https://git-scm.com/download/win](https://git-scm.com/download/win)**
- Follow the steps in the video to install and run Docker desktop and Git.
- Open a terminal in the root of the C drive and enter these commands:
  - `git clone https://github.com/danny-avila/LibreChat`
  - `cd LibreChat`
  - `copy .env.example .env`
  - `docker compose up`
- Visit http://localhost:3080/ to access LibreChat. Create an account and start chatting.

- [Manage Your MongoDB Database  (optional)](../../features/manage_your_database.md)
Safely access and manage your MongoDB database using Mongo Express

Have fun!

> Note: See the [Docker Compose Install Guide](./docker_compose_install.md) for more details 

- 👆 Docker Compose installation is recommended for most use cases. It's the easiest, simplest, and most reliable method to get started.

---
## **Manual Installation**

- Install the prerequisites on your machine 👇

### Download and Install Node.js (Required)

  - Navigate to **[https://nodejs.org/en/download](https://nodejs.org/en/download)** and to download the latest Node.js version for your OS (The Node.js installer includes the NPM package manager.)

### Download and Install Git (Recommended)
- Git: https://git-scm.com/download/win

### [Create a MongoDB database](../configuration/mongodb.md) (Required)

### [Setup your AI Endpoints](../configuration/ai_setup.md) (Required)
- At least one AI endpoint should be setup for use.

### Download LibreChat (Required)
  - Open Terminal (command prompt) and clone the repository by running `git clone https://github.com/danny-avila/LibreChat.git`
  - **IMPORTANT : If you install the files somewhere else modify the instructions accordingly**
  
### Enable the Conversation search feature: (optional)

  - Download MeiliSearch latest release from : **[github.com/meilisearch](https://github.com/meilisearch/meilisearch/releases)**
  - Copy it to "C:/LibreChat/"
  - Rename the file to "meilisearch.exe"
  - Open it by double clicking on it
  - Copy the generated Master Key and save it somewhere (You will need it later)

### [User/Auth System](../configuration/user_auth_system.md) (Optional)
- How to set up the user/auth system and Google login.

## Setup and Run LibreChat
Using the command line (in the root directory)
### To setup the app:
1. Run `npm ci` (this step will also create the env file)
2. Run `npm run frontend`

### To use the app:
1. Run `npm run backend`
2. Run `meilisearch --master-key <meilisearch_Master_Key>` (Only if SEARCH=TRUE)
3. Visit `http://localhost:3080` (default port) & enjoy

### Using a batch file

- **Make a batch file to automate the starting process**
  - Open a text editor
  - Paste the following code in a new document
  - The meilisearch executable needs to be at the root of the LibreChat directory
  - Put your MeiliSearch master key instead of "`<meilisearch_Master_Key>`"
  - Save the file as `C:/LibreChat/LibreChat.bat`
  - you can make a shortcut of this batch file and put it anywhere

  ```bat title="LibreChat.bat"
  start "MeiliSearch" cmd /k "meilisearch --master-key <meilisearch_Master_Key>

  start "LibreChat" cmd /k "npm run backend"

  REM this batch file goes at the root of the LibreChat directory (C:/LibreChat/)
  ```

---

## **Update**

- Run `npm run update` from the project directory for a clean installation.

If you're having issues running this command, you can try running what the script does manually:

```powershell
# Windows PowerShell terminal 

# Step 1: Get the latest changes

# Fetch the latest changes from Github
git fetch origin
# Switch to the repo's main branch
git checkout main
# Pull the latest changes to the main branch from Github
git pull origin main

# Step 2: Delete all node_modules directories
# Define he list of directories we will delete
$directories = @(
    ".",
    ".\packages\data-provider",
    ".\client",
    ".\api"
)

# Loop over each directory and delete the node_modules folder if it exists
foreach ($dir in $directories) {
    $nodeModulesPath = Join-Path -Path $dir -ChildPath "node_modules"
    if (Test-Path $nodeModulesPath) {
        Write-Host "Deleting node_modules in $dir"
        Remove-Item -Recurse -Force $nodeModulesPath
    }
}

# Step 3: Clean the npm cache
npm cache clean --force

# Step 4: Install dependencies
npm ci

# Step 5: Build client-side (frontend) code
npm run frontend

# Start LibreChat
npm run backend
```

The above assumes that you're using the Windows PowerShell application on a Windows system and are executing the commands from the project directory. The commands are tailored for PowerShell, which is a powerful scripting environment native to Windows. While Windows also offers the Command Prompt and newer versions have the Windows Subsystem for Linux (WSL), the provided instructions are specifically designed for PowerShell.

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.gg/weqZFtD9C4) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
