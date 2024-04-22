import React from 'react';

const Intro: React.FC = () => {
  return (
    <section className="gradient-form h-screen bg-neutral-200 dark:bg-gray-900">
      <div className="flex h-full">
        <div className="flex w-full">
          <div className="g-0 h-full w-full lg:flex lg:flex-wrap">
            {/* Left column container*/}
            <div className="px-4 md:px-0 lg:w-4/12">
              <div className="md:mx-6 md:p-12">
                {/*Logo*/}
                <div className="text-center">
                  <img className="mx-auto w-52" src="/assets/logo-novlisky.png" alt="logo" />
                  <h4 className="mb-12 mt-1 pb-1 text-xl font-semibold text-white"></h4>
                </div>

                <form>
                  <p className="mb-4 text-white">Please login to your account</p>
                  {/*Username input*/}
                  <div className="relative mb-4" data-twe-input-wrapper-init>
                    <input
                      type="text"
                      className="peer-focus:text-primary dark:peer-focus:text-primary peer block min-h-[auto] w-full rounded border border-gray-300 bg-transparent px-3 py-[0.32rem] leading-[1.6] outline-none transition-all duration-200 ease-linear focus:placeholder:opacity-100 data-[twe-input-state-active]:placeholder:opacity-100 motion-reduce:transition-none dark:border-neutral-600 dark:text-gray-700 dark:placeholder:text-gray-400 [&:not([data-twe-input-placeholder-active])]:placeholder:opacity-0"
                      id="exampleFormControlInput1"
                      placeholder="Username"
                    />
                    <label
                      htmlFor="exampleFormControlInput1"
                      className="peer-focus:text-primary dark:peer-focus:text-primary pointer-events-none absolute left-3 top-0 mb-0 max-w-[90%] origin-[0_0] truncate pt-[0.37rem] leading-[1.6] text-gray-500 transition-all duration-200 ease-out peer-focus:-translate-y-[0.9rem] peer-focus:scale-[0.8] peer-data-[twe-input-state-active]:-translate-y-[0.9rem] peer-data-[twe-input-state-active]:scale-[0.8] motion-reduce:transition-none dark:text-gray-500"
                    >
                      Username
                    </label>
                  </div>

                  {/*Password input*/}
                  <div className="relative mb-4" data-twe-input-wrapper-init>
                    <input
                      type="password"
                      className="peer-focus:text-primary dark:peer-focus:text-primary peer block min-h-[auto] w-full rounded border border-gray-300 bg-transparent px-3 py-[0.32rem] leading-[1.6] outline-none transition-all duration-200 ease-linear focus:placeholder:opacity-100 data-[twe-input-state-active]:placeholder:opacity-100 motion-reduce:transition-none dark:border-neutral-600 dark:text-gray-700 dark:placeholder:text-gray-400 [&:not([data-twe-input-placeholder-active])]:placeholder:opacity-0"
                      id="exampleFormControlInput11"
                      placeholder="Password"
                    />
                    <label
                      htmlFor="exampleFormControlInput11"
                      className="peer-focus:text-primary dark:peer-focus:text-primary pointer-events-none absolute left-3 top-0 mb-0 max-w-[90%] origin-[0_0] truncate pt-[0.37rem] leading-[1.6] text-gray-500 transition-all duration-200 ease-out peer-focus:-translate-y-[0.9rem] peer-focus:scale-[0.8] peer-data-[twe-input-state-active]:-translate-y-[0.9rem] peer-data-[twe-input-state-active]:scale-[0.8] motion-reduce:transition-none dark:text-gray-500"
                    >
                      Password
                    </label>
                  </div>

                  {/*Submit button*/}
                  <div className="mb-12 pb-1 pt-1 text-center">
                    <button
                      className="mb-3 inline-block w-full rounded bg-blue-600 px-6 pb-2 pt-2.5 text-xs font-medium uppercase leading-normal text-white shadow-[0_4px_9px_-4px_#3b71ca] transition duration-150 ease-in-out hover:bg-blue-700 hover:shadow-[0_8px_9px_-4px_rgba(59,113,202,0.3),0_4px_18px_0_rgba(59,113,202,0.2)] focus:bg-blue-700 focus:shadow-[0_8px_9px_-4px_rgba(59,113,202,0.3),0_4px_18px_0_rgba(59,113,202,0.2)] focus:outline-none focus:ring-0 active:bg-blue-800 active:shadow-[0_8px_9px_-4px_rgba(59,113,202,0.3),0_4px_18px_0_rgba(59,113,202,0.2)]"
                      type="button"
                      data-twe-ripple-init
                      data-twe-ripple-color="light"
                    >
                      Log in
                    </button>

                    {/*Forgot password link*/}
                    <a href="#!" className="text-white">
                      Forgot password?
                    </a>
                  </div>

                  {/*Register button*/}
                  <div className="flex items-center justify-between pb-6">
                    <p className="mb-0 mr-2 text-white">Dont have an account?</p>
                    <button
                      type="button"
                      className="inline-block rounded border-2 border-blue-600 px-6 pb-[6px] pt-2 text-sm font-medium uppercase leading-normal text-white transition duration-150 ease-in-out hover:border-blue-700 hover:bg-blue-50 hover:text-blue-700 focus:border-blue-700 focus:bg-blue-50 focus:text-blue-700 focus:outline-none focus:ring-0 active:border-blue-800 active:text-blue-800"
                      data-twe-ripple-init
                      data-twe-ripple-color="light"
                    >
                      Register
                    </button>
                  </div>
                </form>
              </div>
            </div>
            {/* Right column container with background and description*/}
            <div
              className="flex items-center justify-center rounded-b-lg lg:w-8/12 lg:rounded-e-lg lg:rounded-bl-none"
              style={{
                background: 'linear-gradient(to right, #1a79f1, #ee607f)',
              }}
            >
              <div className="px-4 py-6 text-center text-white md:mx-6 md:p-12">
                <h4 className="mb-6 text-xl font-semibold">We are more than just a company</h4>
                <p className="text-sm">
                  Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor
                  incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud
                  exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Intro;
