import { useState } from "react";
import { useForm } from "react-hook-form";
import { useRequestPasswordResetMutation, TRequestPasswordReset } from "~/data-provider";

function RequestPasswordReset() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<TRequestPasswordReset>();
  const requestPasswordReset = useRequestPasswordResetMutation();
  const [success, setSuccess] = useState<boolean>(false);
  const [requestError, setRequestError] = useState<boolean>(false);
  const [resetLink, setResetLink] = useState<string>("");

  const onSubmit = (data: TRequestPasswordReset) => {
    requestPasswordReset.mutate(data, {
      onSuccess: (data) => {
        setSuccess(true);
        setResetLink(data.link);
      },
      onError: () => {
        setRequestError(true);
        setTimeout(() => {
          setRequestError(false);
        }, 5000);
      }
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center pt-6 justify-center sm:pt-0 bg-white">
      <div className="mt-6 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg w-96">
        <h1 className="text-center text-3xl font-semibold mb-4">
          Reset your password
        </h1>
        {success && (
          <div
            className="mt-4 bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded relative"
            role="alert"
          >
            Click <a className="text-green-600 hover:underline" href={resetLink}>HERE</a> to reset your password.
            {/* An email has been sent with instructions on how to reset your password. */}
          </div>
        )}
        {requestError && (
          <div
            className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
            role="alert"
          >
           There was a problem resetting your password. There was no user found with the email address provided. Please try again.
          </div>
        )}
        <form
          className="mt-6"
          aria-label="Password reset form"
          method="POST"
          onSubmit={handleSubmit(onSubmit)}
        >
          <div className="mb-2">
            <div className="relative">
            <input
                type="email"
                id="email"
                autoComplete="off"
                aria-label="Email"
                {...register("email", {
                  required: "Email is required",
                  minLength: {
                    value: 3,
                    message: "Email must be at least 6 characters",
                  },
                  maxLength: {
                    value: 120,
                    message: "Email should not be longer than 120 characters",
                  },
                  pattern: {
                    value: /\S+@\S+\.\S+/,
                    message: "You must enter a valid email address",
                  },
                })}
                aria-invalid={!!errors.email}
                className="block rounded-t-md px-2.5 pb-2.5 pt-5 w-full text-sm text-gray-900 bg-gray-50 border-0 border-b-2 border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-green-500 peer"
                placeholder=" "
              ></input>
              <label
                htmlFor="email"
                className="absolute text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-2.5 peer-focus:text-green-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4"
              >
                Email address
              </label>
            </div>
            {errors.email && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore */}
                {errors.email.message}
              </span>
            )}
          </div>
          <div className="mt-6">
            <button
              type="submit"
              disabled={ !!errors.email }
              className="w-full py-2 px-4 border border-transparent rounded-sm shadow-sm text-sm font-medium text-white bg-green-500 hover:bg-green-600 focus:outline-none active:bg-green-500"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default RequestPasswordReset;