# Email

## General setup

in the .env file modify this 4 variables:

```
EMAIL_SERVICE=   # eg. gmail
EMAIL_USERNAME=  # eg. your email address if using gmail
EMAIL_PASSWORD=  # eg. this is the "app password" if using gmail
EMAIL_FROM=      # eg. email address for from field like noreply@librechat.ai
```

EMAIL_SERVICE is the name of the email service you are using (Gmail, Outlook, Yahoo Mail, ProtonMail, iCloud Mail, etc.).
EMAIL_USERNAME is the username of the email service (usually, it will be the email address, but in some cases, it can be an actual username used to access the account).
EMAIL_PASSWORD is the password used to access the email service. This is not the password to access the email account directly, but a password specifically generated for this service.
EMAIL_FROM is the email address that will appear in the "from" field when a user receives an email.

---

## Setup with Gmail

1. Create a Google Account and enable 2-step verification.
2. In the [Google Account settings](https://myaccount.google.com/), click on the "Security" tab and open "2-step verification."
3. Scroll down and open "App passwords." Choose "Mail" for the app and select "Other" for the device, then give it a random name.
4. Click on "Generate" to create a password, and copy the generated password.
5. In the .env file, modify the variables as follows:

```
EMAIL_SERVICE=gmail
EMAIL_USERNAME=your-email
EMAIL_PASSWORD=your-app-password
EMAIL_FROM=email address for the from field, e.g., noreply@librechat.ai
```

---

NOTE: The variable EMAIL_FROM currently does not work. To stay updated, check the bug fixes [here](https://github.com/danny-avila/LibreChat/tags).
