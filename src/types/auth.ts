import { User } from "./user";

export type LoginForm = {
  email: string;
  password: string;
};

export type Auth = {
  access_token: string;
  id_token: string;
  expires_in: number;
  scope: string;
  user: User;
};
