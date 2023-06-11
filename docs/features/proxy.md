# Proxy

If your server cannot connect to the chatGPT API server by some reason, (eg in China). You can set a environment variable `PROXY`. This will be transmitted to `node-chatgpt-api` interface.

**Warning:** `PROXY` is not `reverseProxyUrl` in `node-chatgpt-api`

## Set up proxy in local environment

- **Option 1:** system level environment
`export PROXY="http://127.0.0.1:7890"`

- **Option 2:** set in .env file
`PROXY="http://127.0.0.1:7890"`

**Change `http://127.0.0.1:7890` to your proxy server**


## Set up proxy in docker environment </strong></summary>

set in docker-compose.yml file, under services - api - environment

```
    api:
        ...
        environment:
                ...
                - "PROXY=http://127.0.0.1:7890"
                # add this line ↑
```

**Change `http://127.0.0.1:7890` to your proxy server**



---

## [Go Back to ReadMe](../../README.md)
