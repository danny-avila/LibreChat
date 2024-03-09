---
title: 🍎 Mac
description: Mac Installation Guides
weight: 0
---

# Mac Installation Guide
## **Recommended : [Docker Install](docker_compose_install.md)**
- 👆 Docker Compose installation is recommended for most use cases. It's the easiest, simplest, and most reliable method to get started.

---

## **Manual Installation**

### Install the prerequisites (Required)
- Install Homebrew (if not already installed) by following the instructions on **[brew.sh](https://brew.sh/)**
- Install Node.js and npm by running `brew install node`

### Download LibreChat (Required)
- Open Terminal and clone the repository by running `git clone https://github.com/danny-avila/LibreChat.git`
- Change into the cloned directory by running `cd LibreChat`
- Create a .env file by running `cp .env.example .env`
- Install dependencies by running: `npm ci`
- Build the client by running: `npm run frontend`

> You will only need to add your `MONGO_URI` (next step) for LibreChat to work. Make sure LibreChat works with the basic configuration first, you can always come back to the `.env` later for advanced configurations. See: [.env configuration](../configuration/dotenv.md)

### Create a MongoDB database (Required)
- [Create an online MongoDB database](../configuration/mongodb.md) **or** Install MongoDB by running `brew tap mongodb/brew` and `brew install mongodb-community`
- add your `MONGO_URI` in the .env file (use vscode or any text editor)

> Choose only one option, online or brew. Both have pros and cons

### [Setup your AI Endpoints](../configuration/ai_setup.md) (Required)
- At least one AI endpoint should be setup for use.

### [User/Auth System](../configuration/user_auth_system.md) (Optional)
- Set up the user/auth system and various social logins.

### **Download MeiliSearch for macOS (Optional):**
- This enables the conversation search feature
- You can download the latest MeiliSearch binary for macOS from their GitHub releases page: **[github.com/meilisearch](https://github.com/meilisearch/meilisearch/releases)**
  - Look for the file named `meilisearch-macos-amd64` (or the equivalent for your system architecture) and download it.

- **Make the binary executable:**
  - Open Terminal and navigate to the directory where you downloaded the MeiliSearch binary. Run the following command to make it executable: `chmod +x meilisearch-macos-amd64`

- **Run MeiliSearch:**
  - Now that the binary is executable, you can start MeiliSearch by running the following command: `./meilisearch-macos-amd64 --master-key your_master_key_goes_here`
    - Replace `your_master_key_goes_here` with your desired master key!

- MeiliSearch will start running on the default port, which is 7700. You can now use MeiliSearch in your LibreChat project.

- Remember to include the MeiliSearch URL and Master Key in your .env file. Your .env file should include the following lines:

```
SEARCH=true
MEILI_NO_ANALYTICS=true
MEILI_HOST=http://0.0.0.0:7700
MEILI_MASTER_KEY=your_master_key_goes_here
```

>  **Important:** use the same master key here and in your .env file.

- With MeiliSearch running and configured, the LibreChat project should now have the Conversation search feature enabled.

### Start LibreChat
- In the LibreChat directory, start the application by running `npm run backend`
- **Visit: http://localhost:3080 & enjoy**

---

### Optional but recommended:

- Create a script to automate the starting process by creating a new file named `librechat.sh` in the LibreChat directory and pasting the following code:

``` bash title="librechat.sh"
#!/bin/bash
# Replace "your_master_key_goes_here" with your MeiliSearch Master Key
if [ -x "$(command -v ./meilisearch)" ]; then
    ./meilisearch --master-key your_master_key_goes_here &
fi
npm run backend
```

- Make the script executable by running: `chmod +x librechat.sh`

- You can now start LibreChat by running: `./librechat.sh`

---

### Update LibreChat

- Run `npm run update` from the project directory for a clean installation.

**If you're having issues running this command, you can try running what the script does manually:**

```bash
# Terminal on macOS, prefix commands with `sudo` as needed
# Step 1: Get the latest changes
# 1a - Fetch the latest changes from Github
git fetch origin

# 1b - Switch to the repo's main branch
git checkout main

# 1c - Pull the latest changes to the main branch from Github
git pull origin main

# Step 2: Delete all node_modules directories
# 2a - Define the list of directories we will delete
directories=(
    "."
    "./packages/data-provider"
    "./client"
    "./api"
)

# 2b - Loop over each directory and delete the node_modules folder if it exists
for dir in "${directories[@]}"; do
    nodeModulesPath="$dir/node_modules"
    if [ -d "$nodeModulesPath" ]; then
        echo "Deleting node_modules in $dir"
        rm -rf "$nodeModulesPath"
    fi
done

# Step 3: Clean the npm cache
npm cache clean --force

# Step 4: Install dependencies
npm ci

# Step 5: Build client-side (frontend) code
npm run frontend

# Start LibreChat
npm run backend
```

The above assumes that you're using the default Terminal application on macOS and are executing the commands from the project directory. The commands are written in Bash, which is the default shell for macOS (though newer versions use `zsh` by default, but these commands should work there as well).

---

>⚠️ Note: If you're having trouble, before creating a new issue, please search for similar ones on our [#issues thread on our discord](https://discord.librechat.ai) or our [troubleshooting discussion](https://github.com/danny-avila/LibreChat/discussions/categories/troubleshooting) on our Discussions page. If you don't find a relevant issue, feel free to create a new one and provide as much detail as possible.
