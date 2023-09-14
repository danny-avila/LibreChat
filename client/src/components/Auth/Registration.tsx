import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { useLocalize } from '~/hooks';
import {
  useRegisterUserMutation,
  TRegisterUser,
  useGetStartupConfig,
} from 'librechat-data-provider';
import { GoogleIcon, FacebookIcon, OpenIDIcon, GithubIcon, DiscordIcon } from '~/components';

function Registration() {
  const navigate = useNavigate();
  const { data: startupConfig } = useGetStartupConfig();

  const localize = useLocalize();

  const {
    register,
    watch,
    handleSubmit,
    formState: { errors },
  } = useForm<TRegisterUser>({ mode: 'onChange' });

  const [error, setError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const registerUser = useRegisterUserMutation();

  const password = watch('password');

  const onRegisterUserFormSubmit = (data: TRegisterUser) => {
    registerUser.mutate(data, {
      onSuccess: () => {
        navigate('/chat/new');
      },
      onError: (error) => {
        setError(true);
        //@ts-ignore - error is of type unknown
        if (error.response?.data?.message) {
          //@ts-ignore - error is of type unknown
          setErrorMessage(error.response?.data?.message);
        }
      },
    });
  };

  useEffect(() => {
    if (startupConfig?.registrationEnabled === false) {
      navigate('/login');
    }
  }, [startupConfig, navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white pt-6 sm:pt-0">
      <div className="mt-6 w-96 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg">
            <div className="mt-2 flex gap-x-2">
              <a
                aria-label="Login with OpenID"
                className="justify-left flex w-full items-center space-x-3 rounded-md border border-gray-300 px-5 py-3 hover:bg-gray-50 focus:ring-2 focus:ring-violet-600 focus:ring-offset-1"
                href={`${startupConfig.serverDomain}/oauth/openid`}
              >
                <p>{startupConfig.openidLabel}</p>
              </a>
              <script type="text/javascript">
                window.location = "{`${startupConfig.serverDomain}/oauth/openid`}";
              </script>
            </div>
          </div>
    </div>
  );
}

export default Registration;
