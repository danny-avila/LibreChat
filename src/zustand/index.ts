import { create } from "zustand";
import { Auth } from "../types/auth";
import { appLocalStorage as localStorage } from "../services/api/setup";
import { User } from "~/types/user";

type AuthStoreState = {
  token: string | null;
  auth: Auth | null;
  user: User | null;
  signIn: (auth: Auth) => void;
  signOut: () => void;
  isAdmin: () => boolean;
  isVeraAdmin: () => boolean;
  isAuthenticated: () => boolean;
};

const getToken = () => {
  const authString = localStorage.getItem("auth") as string;
  const auth: Auth | null = JSON.parse(authString ?? "null");
  return auth ? auth.access_token : null;
};

const getAuth = () => {
  const authString = localStorage.getItem("auth") as string;
  const auth: Auth | null = JSON.parse(authString ?? "null");
  return auth;
};

const getUser = () => {
  const authString = localStorage.getItem("auth") as string;
  const auth: Auth | null = JSON.parse(authString ?? "null");
  return auth ? auth.user : null;
};

const getIsAuthenticated = () => {
  const authString = localStorage.getItem("auth") as string;
  const auth: Auth | null = JSON.parse(authString ?? "null");
  return !!auth;
};

const getIsAdmin = () => {
  const authString = localStorage.getItem("auth") as string;
  const auth: Auth | null = JSON.parse(authString ?? "null");
  if (auth) {
    return auth.user.roles.some((role) => role === "admin");
  }
  return false;
};

const getIsVeraAdmin = () => {
  const authString = localStorage.getItem("auth") as string;
  const auth: Auth | null = JSON.parse(authString ?? "null");
  if (auth) {
    return auth.user.roles.some((role) => role === "vera-admin");
  }
  return false;
};

export const useAuthStore = create<AuthStoreState>((set) => ({
  token: getToken(),
  auth: getAuth(),
  user: getUser(),
  signIn: (auth: Auth) =>
    set(() => {
      localStorage.setItem("auth", JSON.stringify(auth));
      return {
        token: auth.access_token,
        auth: auth,
        user: auth.user,
      };
    }),
  signOut: () =>
    set(() => {
      localStorage.removeItem("auth");
      return {
        token: null,
        auth: null,
        user: null
      };
    }),
  isAdmin: getIsAdmin,
  isVeraAdmin: getIsVeraAdmin,
  isAuthenticated: getIsAuthenticated,
}));

// https://docs.pmnd.rs/zustand/guides/slices-pattern
