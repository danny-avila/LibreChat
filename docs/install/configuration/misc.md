---
title: 🌀 Miscellaneous
description: As LibreChat has varying use cases and environment possibilities, this page will host niche setup/configurations, as contributed by the community, that are not better delegated to any of the other guides.
weight: -2
author: danny-avila and jerkstorecaller
---

As LibreChat has varying use cases and environment possibilities, this page will host niche setup/configurations, as contributed by the community, that are not better delegated to any of the other guides.

# Using LibreChat behind a reverse proxy with Basic Authentication

### Basic Authentication (Basic Auth)

Basic Authentication is a simple authentication scheme built into the HTTP protocol. When a client sends a request to a server, the server can respond with a `401 Unauthorized` status code, prompting the client to provide a username and password. This username and password are then sent with subsequent requests in the HTTP header, encoded in Base64 format. 

For example, if the username is `Aladdin` and the password is `open sesame`, the client sends:

```
Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==
```

Where `QWxhZGRpbjpvcGVuIHNlc2FtZQ==` is the Base64 encoding of `Aladdin:open sesame`.

**Note**: Basic Auth is not considered very secure on its own because the credentials are sent in easily decodable Base64 format. It should always be used in conjunction with HTTPS to encrypt the credentials during transmission.

### Reverse Proxy

A reverse proxy is a server that sits between client devices and a web server, forwarding client requests to the web server and returning the server's responses back to the clients. This is useful for load balancing, caching, and, in this context, adding an additional layer of security or authentication.

### The Issue with LibreChat and Basic Auth

If LibreChat is behind a webserver acting as a reverse proxy with Basic Auth (a common scenario for casual users), LibreChat will not function properly without some extra configuration. You will connect to LibreChat, be prompted to enter Basic Auth credentials, enter your username/password, LibreChat will load, but then you will not get a response from the AI services.

The reason is that LibreChat uses Bearer authentication when calling the backend API at domain.com/api. Because those calls will use Bearer rather than Basic auth, your webserver will view this as unauthenticated connection attempt and return 401.

The solution is to enable Basic Auth, but disable it specifically for the /api/ endpoint. (it's safe because the API calls still require an authenticated user)

You will therefore need to create a new rule that disables Basic Auth for /api/. This rule must be higher priority than the rule activating Basic Auth. 

### Nginx Configuration

For example, for nginx, you might do:

```
#https://librechat.domain.com
server {
	listen 443 ssl;
	listen [::]:443 ssl;
	server_name librechat.*;
	include /config/nginx/ssl.conf;

	#all connections to librechat.domain.com require basic_auth
	location / {
	  auth_basic "Access Restricted";
	  auth_basic_user_file /config/nginx/.htpasswd;
	  include /config/nginx/proxy_params.conf;
	  proxy_pass http://127.0.0.1:3080;
	}

    #...except for /api/, which will use LibreChat's own auth system
	location ~ ^/api/ {
	  auth_basic off;
	  include /config/nginx/proxy_params.conf;
	  proxy_pass http://127.0.0.1:3080;
	}
}
```

The provided Nginx configuration sets up a server block for `librechat.domain.com`:

1. **Basic Auth for All Requests**: The `location /` block sets up Basic Auth for all requests to `librechat.domain.com`. The `auth_basic` directive activates Basic Auth, and the `auth_basic_user_file` directive points to the file containing valid usernames and passwords.

2. **Exception for `/api/` Endpoint**: The `location ~ ^/api/` block matches any URL path starting with `/api/`. For these requests, Basic Auth is turned off using `auth_basic off;`. This ensures that LibreChat's own authentication system can operate without interference.
