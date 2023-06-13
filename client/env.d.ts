/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SERVER_URL_DEV: string;
  readonly VITE_SERVER_URL_PROD: string;
  readonly VITE_SHOW_GOOGLE_LOGIN_OPTION: string;
  readonly ALLOW_OPENID: string;
  readonly OPENID_LABEL: string;
  readonly VITE_CLIENT_URL_DEV: string;
  readonly VITE_CLIENT_URL_PROD: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
