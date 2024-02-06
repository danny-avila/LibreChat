import { Auth, LoginForm } from '../../types/auth';
import { axios } from './setup';

export const loginUser = async (data: LoginForm) => {
  return (await axios.post<Auth>(`login`, data)).data;
};

export const logoutUser = async (signOutCallback: () => void) => {
  return await signOutCallback();
};

export const resetPassword = async (email: string) => {
  return await axios.get(`user/reset-password?email=${email}`);
};
