# Clone GIT and get stable_version
# This branch is made from last original commit that works through the custm_clients
# All later original commits are intended to replace this with flow through the agents
# and are not stable enought to be used for customisations
git clone git@github.com:gonka-ai/gonka-chat.git
git fetch
git checkout stable_version

# Set our parameters
cp .env.example .env
sudo nano .env
    OPENAI_API_KEY=
    GONKA_PRIVATE_KEY=
    GONKA_ENDPOINTS=
    GONKA_ADDRESS=

cp librechat.example-gonka.yaml librechat.yaml
sudo nano librechat.yaml
    baseURL
    models // hard-configured list of models that be available in the UI
    fetch // true - chat will try to fetch actual model's list from the API

cp docker-compose.override.yml.example-gonka docker-compose.override.yml

# Create necessary folders and set appropriate access
# In theory Docker creates all that by itself
mkdir /opt/gonka-chat/data-node
chown -R 1000:1000 /opt/gonka-chat/data-node
mkdir /opt/gonka-chat/meili_data_v1.12
chown -R 1000:1000 /opt/gonka-chat/meili_data_v1.12
mkdir -p /opt/gonka-chat/logs
chown -R 1000:1000 /opt/gonka-chat/logs

# Install dependencies
npm install // optional npm audit / npm audit fix
docker compose build
docker compose up -d

# Setup prefarable tool to forward port 3080 to the internet