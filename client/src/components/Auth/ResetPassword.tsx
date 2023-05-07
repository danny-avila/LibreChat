import { useState } from "react";
import { useForm } from "react-hook-form";
import {useResetPasswordMutation, TResetPassword} from "~/data-provider"; 
import { useNavigate, useSearchParams } from "react-router-dom";

function ResetPassword() {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<TResetPassword>();
  const resetPassword = useResetPasswordMutation();
  const [resetError, setResetError] = useState<boolean>(false);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const password = watch("password");

  const onSubmit = (data: TResetPassword) => {
    resetPassword.mutate(data, {
      onError: () => {
        setResetError(true);
      }
    });
  };

  if (resetPassword.isSuccess) {
    return (
      <div className="flex min-h-screen flex-col items-center pt-6 justify-center sm:pt-0 bg-white">
        <div className="mt-6 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg w-96">
          <h1 className="text-center text-3xl font-semibold mb-4">
            Password Reset Success
          </h1>
          <div
            className="mt-4 bg-green-100 border border-green-400 text-center mb-8 text-green-700 px-4 py-3 rounded relative"
            role="alert"
          >
            You may now login with your new password.
          </div>
          <button
            onClick={() => navigate("/login")}
            aria-label="Sign in"
            className="w-full transform rounded-sm bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none"
          >
            Continue
          </button>
        </div>
      </div>
    )
  }
  else {
    return (
      <div className="flex min-h-screen flex-col items-center pt-6 justify-center sm:pt-0 bg-white">
        <div className="mt-6 overflow-hidden bg-white px-6 py-4 sm:max-w-md sm:rounded-lg w-96">
          <h1 className="text-center text-3xl font-semibold mb-4">
            Reset your password
          </h1>
          {resetError && (
            <div
              className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
              role="alert"
            >
             This password reset token is no longer valid. <a className="font-semibold hover:underline text-green-600" href="/forgot-password">Click here</a> to try again.
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
              <input type="hidden" id="token" value={params.get("token")} {...register("token", { required: "Unable to process: No valid reset token" })} />
              <input type="hidden" id="userId" value={params.get("userId")} {...register("userId", { required: "Unable to process: No valid user id" })} />
              <input
                type="password"
                id="password"
                autoComplete="current-password"
                aria-label="Password"
                {...register("password", {
                  required: "Password is required",
                  minLength: {
                    value: 8,
                    message: "Password must be at least 8 characters",
                  },
                  maxLength: {
                    value: 40,
                    message: "Password must be less than 40 characters",
                  },
                })}
                aria-invalid={!!errors.password}
                className="block rounded-t-md px-2.5 pb-2.5 pt-5 w-full text-sm text-gray-900 bg-gray-50 border-0 border-b-2 border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-green-500 peer"
                placeholder=" "
              ></input>
              <label
                htmlFor="password"
                className="absolute text-sm text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-2.5 peer-focus:text-green-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4"
              >
                Password
              </label>
            </div>

            {errors.password && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore */}
                {errors.password.message}
              </span>
            )}
          </div>
          <div className="mb-2">
            <div className="relative">
              <input
                type="password"
                id="confirm_password"
                aria-label="Confirm Password"
                // uncomment to prevent pasting in confirm field
                onPaste={(e) => {
                  e.preventDefault();
                  return false;
                }}
                {...register("confirm_password", {
                  validate: (value) =>
                    value === password || "Passwords do not match",
                })}
                aria-invalid={!!errors.confirm_password}
                className="block rounded-t-md px-2.5 pb-2.5 pt-5 w-full text-sm text-gray-900 bg-gray-50 border-0 border-b-2 border-gray-300 appearance-none focus:outline-none focus:ring-0 focus:border-green-500 peer"
                placeholder=" "
              ></input>
              <label
                htmlFor="confirm_password"
                className="absolute text-sm text-gray-500 duration-300 transform -translate-y-4 scale-75 top-4 z-10 origin-[0] left-2.5 peer-focus:text-green-500 peer-placeholder-shown:scale-100 peer-placeholder-shown:translate-y-0 peer-focus:scale-75 peer-focus:-translate-y-4"
              >
                Confirm Password
              </label>
            </div>
            {errors.confirm_password && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore */}
                {errors.confirm_password.message}
              </span>
            )}
             {errors.token && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore */}
                {errors.token.message}
              </span>
            )}
            {errors.userId && (
              <span role="alert" className="mt-1 text-sm text-red-600">
                {/* @ts-ignore */}
                {errors.userId.message}
              </span>
            )}
          </div>
          <div className="mt-6">
            <button
              disabled={
                !!errors.password ||
                !!errors.confirm_password
              }
              type="submit"
              aria-label="Submit registration"
              className="w-full transform rounded-sm bg-green-500 px-4 py-3 tracking-wide text-white transition-colors duration-200 hover:bg-green-600 focus:bg-green-600 focus:outline-none"
            >
              Continue
            </button>
          </div>
        </form>
      </div>
    </div>
    )
  }
};

export default ResetPassword;