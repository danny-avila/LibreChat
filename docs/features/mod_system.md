---
title: 🔨 Automated Moderation
description: The Automated Moderation System uses a scoring mechanism to track user violations. As users commit actions like excessive logins, registrations, or messaging, they accumulate violation scores. Upon reaching a set threshold, the user and their IP are temporarily banned. This system ensures platform security by monitoring and penalizing rapid or suspicious activities.
weight: -7
---
## Automated Moderation System (optional)
The Automated Moderation System uses a scoring mechanism to track user violations. As users commit actions like excessive logins, registrations, or messaging, they accumulate violation scores. Upon reaching a set threshold, the user and their IP are temporarily banned. This system ensures platform security by monitoring and penalizing rapid or suspicious activities.

In production, you should have Cloudflare or some other DDoS protection in place to really protect the server from excessive requests, but these changes will largely protect you from the single or several bad actors targeting your deployed instance for proxying.

### Notes

- Uses Caching for basic security and violation logging (bans, concurrent messages, exceeding rate limits)
    - In the near future, I will add **Redis** support for production instances, which can be easily injected into the current caching setup
- Exceeding any of the rate limiters (login/registration/messaging) is considered a violation, default score is 1
- Non-browser origin is a violation
- Default score for each violation is configurable
- Enabling any of the limiters and/or bans enables caching/logging
- Violation logs can be found in the data folder, which is created when logging begins: `librechat/data`
  - **Only violations are logged**
  - `violations.json` keeps track of the total count for each violation per user
  - `logs.json` records each individual violation per user
- Ban logs are stored in MongoDB under the `logs` collection. They are transient as they only exist for the ban duration
    - If you would like to remove a ban manually, you would have to remove them from the database manually and restart the server
    - **Redis** support is also planned for this.

### Rate Limiters

The project's current rate limiters are as follows (see below under setup for default values):

- Login and registration rate limiting
- [optional] Concurrent Message limiting (only X messages at a time per user)
- [optional] Message limiting (how often a user can send a message, configurable by IP and User)
- [optional] File Upload limiting: configurable through [`librechat.yaml` config file](https://docs.librechat.ai/install/configuration/custom_config.html#rate-limiting).

### Setup

The following are all of the related env variables to make use of and configure the mod system. Note this is also found in the [/.env.example](https://github.com/danny-avila/LibreChat/blob/main/.env.example) file, to be set in your own `.env` file.

**Note:** currently, most of these values are configured through the .env file, but they may soon migrate to be exclusively configured from the [`librechat.yaml` config file](https://docs.librechat.ai/install/configuration/custom_config.html#rate-limiting).

```bash
BAN_VIOLATIONS=true # Whether or not to enable banning users for violations (they will still be logged)
BAN_DURATION=1000 * 60 * 60 * 2 # how long the user and associated IP are banned for
BAN_INTERVAL=20 # a user will be banned everytime their score reaches/crosses over the interval threshold

# The score for each violation

LOGIN_VIOLATION_SCORE=1
REGISTRATION_VIOLATION_SCORE=1
CONCURRENT_VIOLATION_SCORE=1
MESSAGE_VIOLATION_SCORE=1
NON_BROWSER_VIOLATION_SCORE=20

# Login and registration rate limiting.

LOGIN_MAX=7 # The max amount of logins allowed per IP per LOGIN_WINDOW
LOGIN_WINDOW=5 # in minutes, determines the window of time for LOGIN_MAX logins
REGISTER_MAX=5 # The max amount of registrations allowed per IP per REGISTER_WINDOW
REGISTER_WINDOW=60 # in minutes, determines the window of time for REGISTER_MAX registrations

# Message rate limiting (per user & IP)

LIMIT_CONCURRENT_MESSAGES=true # Whether to limit the amount of messages a user can send per request
CONCURRENT_MESSAGE_MAX=2 # The max amount of messages a user can send per request

LIMIT_MESSAGE_IP=true # Whether to limit the amount of messages an IP can send per MESSAGE_IP_WINDOW
MESSAGE_IP_MAX=40 # The max amount of messages an IP can send per MESSAGE_IP_WINDOW
MESSAGE_IP_WINDOW=1 # in minutes, determines the window of time for MESSAGE_IP_MAX messages

# Note: You can utilize both limiters, but default is to limit by IP only.
LIMIT_MESSAGE_USER=false # Whether to limit the amount of messages an IP can send per MESSAGE_USER_WINDOW
MESSAGE_USER_MAX=40 # The max amount of messages an IP can send per MESSAGE_USER_WINDOW
MESSAGE_USER_WINDOW=1 # in minutes, determines the window of time for MESSAGE_USER_MAX messages

ILLEGAL_MODEL_REQ_SCORE=5 #Violation score to accrue if a user attempts to use an unlisted model.

```

> Note: Illegal model requests are almost always nefarious as it means a 3rd party is attempting to access the server through an automated script. For this, I recommend a relatively high score, no less than 5.

## OpenAI moderation text

### OPENAI_MODERATION
enable or disable OpenAI moderation

Values:
`true`: OpenAI moderation is enabled
`false`: OpenAI moderation is disabled

### OPENAI_MODERATION_API_KEY
Specify your OpenAI moderation API key here

### OPENAI_MODERATION_REVERSE_PROXY
enable or disable reverse proxy compatibility for OpenAI moderation. Note that it may not work with some reverse proxies

Values:
`true`: Enable reverse proxy compatibility
`false`: Disable reverse proxy compatibility

```bash
OPENAI_MODERATION=true
OPENAI_MODERATION_API_KEY=sk-1234
# OPENAI_MODERATION_REVERSE_PROXY=false
```
