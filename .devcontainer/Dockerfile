FROM node:18-bullseye

RUN npm install -g @anthropic-ai/claude-code
RUN useradd -m -s /bin/bash vscode

# Install sudo and grant vscode user sudo privileges without password
RUN apt-get update && apt-get install -y sudo \
    && adduser vscode sudo \
    && echo "vscode ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/vscode-nopasswd \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /workspaces && chown -R vscode:vscode /workspaces
WORKDIR /workspaces