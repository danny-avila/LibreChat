# .devcontainer/Dockerfile
FROM node:18-bullseye

ARG INSTALL_DOCKER="false"
ENV INSTALL_DOCKER=${INSTALL_DOCKER}

# Install Docker and Docker Compose only if INSTALL_DOCKER is "true"
RUN if [ "$INSTALL_DOCKER" = "true" ]; then \
        apt-get update && \
        apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release && \
        curl -fsSL https://download.docker.com/linux/debian/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg && \
        echo "deb [arch=amd64 signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/debian $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null && \
        apt-get update && \
        apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin; \
    fi

# Install sudo
RUN apt-get update && apt-get install -y sudo

# Set up non-root user
RUN useradd -m -s /bin/bash vscode
RUN if [ "$INSTALL_DOCKER" = "true" ]; then usermod -aG docker vscode; fi

# Add vscode user to sudoers
RUN echo "vscode ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/vscode && \
    chmod 0440 /etc/sudoers.d/vscode

USER vscode

WORKDIR /workspaces

# Copy package.json and package-lock.json
COPY package*.json ./

# Run npm install and other commands
RUN npm run reinstall && \
    npm run pull:rag && \
    npm run copy-ex

# Set the default command
CMD ["/bin/bash"]