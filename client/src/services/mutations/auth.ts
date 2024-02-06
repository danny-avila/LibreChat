import { useMutation } from '@tanstack/react-query';
import { loginUser, logoutUser, resetPassword } from '../api/auth';
import { LoginForm } from '../../types/auth';
import { LANDING_PATH } from '../../utils/constants';
import { useAuthContext } from '~/hooks';

export function useLoginVeraUser() {
  const { signIn } = useAuthContext();

  return useMutation({
    mutationFn: (data: LoginForm) => loginUser(data),
    onSettled: async (data, error) => {
      if (error) {
        console.log(error);
      } else if (data) {
        signIn(data);
        // const search: Record<string, unknown> = router.state.location.search;
        // if (search.redirect) {
        //   return router.history.push(search.redirect as string);
        // } else {
        //   return router.history.push(LANDING_PATH);
        // }
      }
    },
  });
}

export function useLogoutVeraUser() {
  const { signOut } = useAuthContext();

  return useMutation({
    mutationFn: () => logoutUser(signOut),
    onSettled: async (_, error) => {
      if (error) {
        console.log(error);
      } else {
        window.location.href = 'login';
      }
    },
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (email: string) => resetPassword(email),
    onSettled: async (data, error) => {
      if (error) {
        console.log(error);
      } else if (data) {
        console.log(data);
      }
    },
  });
}
