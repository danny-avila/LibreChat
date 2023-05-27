# Proxy

If your server cannot connect to the chatGPT API server by some reason, (eg in China). You can set a environment variable `PROXY`. This will be transmitted to `node-chatgpt-api` interface.

**Warning:** `PROXY` is not `reverseProxyUrl` in `node-chatgpt-api`

<details>
<summary><strong>Set up proxy in local environment </strong></summary>

- **Option 1:** system level environment
`export PROXY="http://127.0.0.1:7890"`
- **Option 2:** set in .env file
`PROXY="http://127.0.0.1:7890"`

**Change `http://127.0.0.1:7890` to your proxy server**
</details>

<details>
<summary><strong>Set up proxy in docker environment </strong></summary>

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

</details>

##

## [Go Back to ReadMe](../../README.md)
