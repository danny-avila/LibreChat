# PandoraNext Deployment Guide

If you're looking to use the `ChatGPT` Endpoint in LibreChat, setting up a reverse proxy is a essential. PandoraNext offers a robust solution for this purpose. This guide will walk you through deploying PandoraNext to enable the `CHATGPT_REVERSE_PROXY` for use with LibreChat.

> Using this method you will only be able to use `text-davinci-002-render-sha` with PandoraNext in LibreChat. Other models offer with the `plus` subscription do not work.

You can use it locally in docker or deploy it onthe web for remote access.

## Deploy Online by Duplicating Hugging Face Space

To deploy PandoraNext online by duplicating the Hugging Face Space, follow these steps:

1. Get your PandoraNext license id here: [PandoraNext Dashboard](https://dash.pandoranext.com/)

2. **Configure `config.json`:**
    Edit the following `config.json`. Specify your `license_id` and `proxy_api_prefix`. For the `proxy_api_prefix`, use at least 8 characters, avoid characters that can't be used in a URL and make sure it's unique.

    Here's the `config.json` for your reference:

    ```json
    {
    "bind": "0.0.0.0:8181",
    "tls": {
        "enabled": false,
        "cert_file": "",
        "key_file": ""
    },
    "timeout": 600,
    "proxy_url": "",
    "license_id": "",
    "public_share": false,
    "site_password": "",
    "setup_password": "",
    "server_tokens": true,
    "proxy_api_prefix": "",
    "isolated_conv_title": "*",
    "captcha": {
        "provider": "",
        "site_key": "",
        "site_secret": "",
        "site_login": false,
        "setup_login": false,
        "oai_username": false,
        "oai_password": false
    },
    "whitelist": null
    }
    ```

3. **Hugging Face Space:**
    Visit the [PandoraNext LibreChat Space](https://huggingface.co/spaces/LibreChat/PandoraNext) on Hugging Face.

4. **Duplicate the Space:**
    Utilize the available options to duplicate or fork the space into your own Hugging Face account.

5. **Fill the required secrets**
    When asked for the `SECRETS`, 
    - for `CONFIG_JSON` use the whole content of the `config.json` you just modified, 
    - for `TOKENS_JSON` use the following default `token.json`:
    ```json
    {
      "test-1": {
          "token": "access token / session token / refresh token",
          "shared": true,
          "show_user_info": false
      },
      "test-2": {
          "token": "access token / session token / refresh token",
          "shared": true,
          "show_user_info": true,
          "plus": true
      },
      "test2": {
          "token": "access token / session token / refresh token / share token",
          "password": "12345"
      }
    }
    ```
6. **Configure LibreChat:**
   In the .env file (or secrets settings if you host LibreChat on Hugging Face), set the `CHATGPT_REVERSE_PROXY` variable using the following format:

   ```bash
   CHATGPT_REVERSE_PROXY=http://your_server_domain.com/your_proxy_api_prefix_here/backend-api/conversation
   ```

    - Replace `your_server_domain.com` with the domain of your deployed space.
        - you can use this format: `https://username-pandoranext.hf.space` (replace `username` with your Huggingface username)
    - Replace `your_proxy_api_prefix_here` with the `proxy_api_prefix` you have set in your `config.json`.
    - The resulting URL should look similar to:
     `https://username-pandoranext.hf.space/your_proxy_api_prefix_here/backend-api/conversation`

## Deploy Locally Using Docker

For local deployment using Docker, the steps are as follows:

1. **Clone or Download the Repository:**
   Get the latest release from the [PandoraNext GitHub repository](https://github.com/pandora-next/deploy).

   ```bash
   git clone https://github.com/pandora-next/deploy.git
   ```

2. Get your PandoraNext license id here: [PandoraNext Dashboard](https://dash.pandoranext.com/)

3. **Configure `config.json`:**
   Within the cloned repository, in the `data` folder, edit `config.json`. Specify your `license_id` and `proxy_api_prefix`. For the `proxy_api_prefix`, use at least 8 characters, avoid characters that can't be used in a URL and make sure it's unique.

   Here's the `config.json` for your reference:

   ```json
    {
    "bind": "0.0.0.0:8181",
    "tls": {
        "enabled": false,
        "cert_file": "",
        "key_file": ""
    },
    "timeout": 600,
    "proxy_url": "",
    "license_id": "",
    "public_share": false,
    "site_password": "",
    "setup_password": "",
    "server_tokens": true,
    "proxy_api_prefix": "",
    "isolated_conv_title": "*",
    "captcha": {
        "provider": "",
        "site_key": "",
        "site_secret": "",
        "site_login": false,
        "setup_login": false,
        "oai_username": false,
        "oai_password": false
    },
    "whitelist": null
    }
   ```

4. **Set Up the LibreChat `.env` Filer:**
   In the `.env` file within your LibreChat directory, you'll need to set the `CHATGPT_REVERSE_PROXY` variable:

   ```bash
   CHATGPT_REVERSE_PROXY=http://host.docker.internal:8181/your_proxy_api_prefix_here/backend-api/conversation
   ```
   - Replace `your_proxy_api_prefix_here` with the actual proxy API prefix.

4. **Start Docker Containers:**
   From the PandoraNext directory, run the following command to launch the Docker containers:

   ```bash
   docker-compose up -d
   ```

## Final Notes

- The `proxy_api_prefix` should be sufficiently random and unique to prevent errors.
- Ensure you have obtained a license ID from the [PandoraNext Dashboard](https://dash.pandoranext.com/).
