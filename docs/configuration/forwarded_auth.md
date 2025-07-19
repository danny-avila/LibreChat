# Forwarded Authentication

LibreChat supports authentication via forwarded HTTP headers, which is useful when you have a reverse proxy (like Nginx, Traefik, or Caddy) that handles authentication before the request reaches LibreChat.

## Configuration

To enable forwarded authentication, you need to configure the following environment variables:

```env
# Enable forwarded authentication
FORWARD_AUTH_ENABLED=true

# Required header containing the username (case-insensitive)
FORWARD_AUTH_USERNAME_HEADER=X-Forwarded-User

# Optional header containing the user's email (case-insensitive)
FORWARD_AUTH_EMAIL_HEADER=X-Forwarded-Email
```

## How It Works

When forwarded authentication is enabled, LibreChat will:

1. Check for the `FORWARD_AUTH_USERNAME_HEADER` in incoming requests
2. If the header is present, it will:
   - Look up a user with that username or email (if the email header is provided)
   - Create a new user if none exists
   - Automatically authenticate the user (bypassing the login form)
   - Update existing users' provider to `forwardedAuth` if they were previously authenticated by another method
3. The first user registered via forwarded authentication will be granted admin privileges

## Important Security Considerations

When using this authentication method, your reverse proxy should:

1. Validate user authentication before forwarding requests to LibreChat
2. Strip any existing authentication headers from incoming requests to prevent header spoofing
3. Add the username and optional email headers only after successful authentication

## Example Proxy Configurations

### Nginx Example

```nginx
server {
    # ... other config ...

    location / {
        # Remove any existing headers that might be used for spoofing
        proxy_set_header X-Forwarded-User "";
        proxy_set_header X-Forwarded-Email "";

        # Check if user is authenticated and add headers
        # This example uses the $remote_user variable which is set by Nginx
        # when using basic auth, but could be from any authentication method
        if ($remote_user) {
            proxy_set_header X-Forwarded-User $remote_user;
            # If you have access to the user's email, you can set it here
            # proxy_set_header X-Forwarded-Email $user_email;
        }

        proxy_pass http://librechat:3080;
        # ... other proxy settings ...
    }
}
```

### Traefik Example

Using Traefik with a Forward Auth middleware:

```yaml
# traefik.yml
http:
  middlewares:
    auth-forward:
      forwardAuth:
        address: http://auth-service
        authResponseHeaders:
          - "X-Forwarded-User"
          - "X-Forwarded-Email"

  routers:
    librechat:
      rule: "Host(`chat.example.com`)"
      service: librechat
      middlewares:
        - auth-forward
      # ... other config ...
```

## Client-Side Behavior

When forwarded authentication is enabled, the LibreChat client will:

1. Detect that forwarded authentication is enabled via the startup config
2. Skip displaying the login form
3. Automatically redirect to the home page, which will trigger the authentication process

## Notes

- The username and email headers are case-insensitive, so `X-Forwarded-User`, `x-forwarded-user`, etc. will all work
- If a user with the same email already exists, the user will be authenticated and their provider updated to `forwardedAuth`
- Forwarded authentication takes precedence over other authentication methods, allowing for a smooth transition if you're switching from another method