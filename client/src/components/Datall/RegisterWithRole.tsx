import axios from 'axios';
import React, { useEffect, useState } from 'react';
import { boolean } from 'zod';
// import { register } from 'librechat-data-provider/src/api-endpoints';

import { useNavigate } from 'react-router-dom';

const RegisterWithRole: React.FC = () => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const[role,setRole] =useState<string>('')

  const [fullNameError, setFullNameError] = useState<string>('');
  const [emailError, setEmailError] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>('');
  const[roleError,setRoleError] =useState<string>('')

  const [changeState, setChangeState] = useState<boolean>(false);

  // const registerPath =register()
  const navigate = useNavigate();

  useEffect(() => {
    const fetchBalance = async () => {
      try {
        const response = await axios.get('http://localhost:3090/api/balance');
        console.log('Balance:', response.data);
      } catch (error) {
        console.error('Error fetching balance:', error);
      }
    };

    fetchBalance();
  }, [changeState]);

  const fullNameHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFullName(e.target.value);
    if (e.target.value.trim() === '') {
      setFullNameError('FullName is required.');
    } else {
      setFullNameError('');
    }
  };

  const emailHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (e.target.value.trim() === '' || e.target.value.includes('@') === false) {
      setEmailError('Email is required.');
    } else {
      setEmailError('');
    }
  };

  const passwordHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (e.target.value.trim() === '' || e.target.value.trim().length < 6) {
      setPasswordError('Password is required.');
    } else {
      setPasswordError('');
    }
  };

  const confirmPasswordHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (e.target.value.trim() !== password) {
      setConfirmPasswordError('Password is wrong.');
    } else {
      setConfirmPasswordError('');
    }
  };

  const roleHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRole(e.target.value);
    if (e.target.value !== 'ADMIN' && e.target.value !== 'USER') {
      setRoleError('role is wrong.');
    } else {
      setRoleError('');
    }
  };

  const submitHandler = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (
      fullName.length &&
      email.length &&
      password.length &&
      confirmPassword.length &&
      fullNameError.length === 0 &&
      emailError.length === 0 &&
      passwordError.length === 0 &&
      confirmPasswordError.length === 0 &&
      roleError.length === 0
    ) {
      console.log('submit');

      const user = {
        email: email,
        name: fullName,
        username: fullName,
        confirm_password: confirmPassword,
        password: password,
        role: role
      };

      const additionalData = { emailVerified: false };

      try {
        const response = await axios.post('http://localhost:3090/api/auth/register', user);
        // const response = await axios.post(`http://localhost:3090${registerPath}`, user );

        console.log('User Created:', response);

        navigate('/datall/welcome', { state: user, replace: true });
      } catch (error) {
        console.error('Error creating user', error);
      }
    } else {
      setChangeState((prevState) => !prevState);
    }
  };

  return (
    <form className="flex flex-col gap-3" onSubmit={submitHandler}>
        <h2>with roles:</h2>
      {/* fullName */}
      <div className="flex items-center justify-between">
        <label htmlFor="fullName">fullName: </label>
        <input
          type="text"
          placeholder="fullName"
          id="fullName"
          onChange={fullNameHandler}
          className="rounded-2xl border px-3.5 py-2 focus:border-green-500 focus:outline-none"
        />
      </div>
      {fullNameError.length > 0 && <span className="text-red-500">{fullNameError}</span>}
      {/* email */}
      <div className="flex items-center justify-between">
        <label htmlFor="email">email: </label>
        <input
          type="text"
          placeholder="email"
          id="email"
          onChange={emailHandler}
          className="rounded-2xl border px-3.5 py-2 focus:border-green-500 focus:outline-none"
        />
      </div>
      {emailError.length > 0 && <span className="text-red-500">{emailError}</span>}
      {/* password */}
      <div className="flex items-center justify-between">
        <label htmlFor="password">password: </label>
        <input
          type="text"
          placeholder="password"
          id="password"
          onChange={passwordHandler}
          className="rounded-2xl border px-3.5 py-2 focus:border-green-500 focus:outline-none"
        />{' '}
      </div>
      {passwordError.length > 0 && <span className="text-red-500">{passwordError}</span>}
      {/* confirmPassword */}
      <div className="flex items-center justify-between">
        <label htmlFor="confirmPassword">confirmPass: </label>
        <input
          type="text"
          placeholder="confirmPassword"
          id="confirmPassword"
          onChange={confirmPasswordHandler}
          className="rounded-2xl border px-3.5 py-2 focus:border-green-500 focus:outline-none"
        />
      </div>
      {confirmPasswordError.length > 0 && (
        <span className="text-red-500">{confirmPasswordError}</span>
      )}
      {/* role */}
      <div className="flex items-center justify-between">
        <label htmlFor="role">role: </label>
        <input
          type="text"
          placeholder="role"
          id="role"
          onChange={roleHandler}
          className="rounded-2xl border px-3.5 py-2 focus:border-green-500 focus:outline-none"
        />
      </div>
      {roleError.length > 0 && (
        <span className="text-red-500">{roleError}</span>
      )}
      <button type="submit" className="w-full rounded-2xl bg-green-500 py-2 text-white">
        Continue
      </button>
      
    </form>
  );
};

export default RegisterWithRole;
