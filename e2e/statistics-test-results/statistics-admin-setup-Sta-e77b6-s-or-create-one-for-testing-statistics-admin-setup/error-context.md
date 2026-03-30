# Page snapshot

```yaml
- img "LibreChat Logo"
- button "Switch to dark theme"
- heading "Welcome back" [level=1]
- form "Login form":
  - textbox "Email"
  - text: Email address
  - textbox "Password"
  - text: Password
  - button "Continue"
- paragraph:
  - text: Don't have an account?
  - link "Sign up":
    - /url: /register
- text: Or
- link "Sign in with Microsoft":
  - /url: http://localhost:3080/oauth/openid
  - img "OpenID Logo"
  - paragraph: Sign in with Microsoft
- contentinfo:
  - link "Privacy policy":
    - /url: https://librechat.ai/privacy-policy
  - link "Terms of service":
    - /url: https://librechat.ai/tos
- region "Notifications (F8)":
  - list
```