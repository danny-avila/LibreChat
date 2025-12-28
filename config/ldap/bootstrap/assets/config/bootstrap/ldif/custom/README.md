Add your custom ldif files here if you don't want to overwrite image default boostrap ldif.
at run time you can also mount a data volume with your ldif files to /container/service/slapd/assets/config/bootstrap/ldif/custom

The startup script provides some substitutions in bootstrap ldif files. Following substitutions are supported:

- `{{ LDAP_BASE_DN }}`
- `{{ LDAP_BACKEND }}`
- `{{ LDAP_DOMAIN }}`
- `{{ LDAP_READONLY_USER_USERNAME }}`
- `{{ LDAP_READONLY_USER_PASSWORD_ENCRYPTED }}`

Other `{{ * }}` substitutions are left unchanged.

Since startup script modifies `ldif` files,
you **must** add `--copy-service` argument to entrypoint if you don't want to overwrite them.
