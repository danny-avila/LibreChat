import { Label } from '@mui/icons-material';
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  Modal,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useState } from 'react';
interface AddUserModalProps {
  open: boolean;
  onClose: () => void;
  refreshUsers: () => Promise<void>;
}

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: 700,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  pt: 2,
  px: 4,
  pb: 3,
};

const AddUserModal: React.FC<AddUserModalProps> = (props) => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');

  const [fullNameError, setFullNameError] = useState<string>('');
  const [emailError, setEmailError] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');
  const [confirmPasswordError, setConfirmPasswordError] = useState<string>('');

  const [formError, setFormError] = useState<string>('');

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
      confirmPasswordError.length === 0
    ) {
      console.log('submit');

      const user = {
        email: email,
        name: fullName,
        username: fullName,
        confirm_password: confirmPassword,
        password: password,
      };

      try {
        const response = await axios.post('http://localhost:3090/api/auth/register', user);
        // const response = await axios.post(`http://localhost:3090${registerPath}`, user );

        console.log('User Created:');
        props.onClose();
        setFullName('');
        setEmail('');
        setPassword('');
        setFullName('');
        setConfirmPassword('');
        setFormError('');
        props.refreshUsers();
      } catch (error) {
        // setFormError('sth went wrong!please try later')

        console.error('Error creating user', error);
      }
    } else {
      setFormError('please fill the inputs');
    }
  };

  return (
    <>
      <Modal open={props.open} onClose={props.onClose}>
        <Box sx={{ ...style }}>
          <Typography id="modal-modal-title" variant="h6">
            add user
          </Typography>

          <form onSubmit={submitHandler}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl>
                <TextField
                  label="Enter a name"
                  type="text"
                  onChange={fullNameHandler}
                  value={fullName}
                  error={fullNameError.length !== 0}
                />
                <FormHelperText sx={{ color: 'red' }}>{fullNameError}</FormHelperText>
              </FormControl>
              <FormControl>
                <TextField
                  label="Enter a email"
                  type="text"
                  onChange={emailHandler}
                  value={email}
                  error={emailError.length !== 0}
                />
                <FormHelperText sx={{ color: 'red' }}>{emailError}</FormHelperText>
              </FormControl>
              <FormControl>
                <TextField
                  label="Enter a password"
                  type="text"
                  onChange={passwordHandler}
                  value={password}
                  error={passwordError.length !== 0}
                />
                <FormHelperText sx={{ color: 'red' }}>{passwordError}</FormHelperText>
              </FormControl>
              <FormControl>
                <TextField
                  label="confirm_password"
                  type="text"
                  onChange={confirmPasswordHandler}
                  value={confirmPassword}
                  error={confirmPasswordError.length !== 0}
                />
                <FormHelperText sx={{ color: 'red' }}>{confirmPasswordError}</FormHelperText>
              </FormControl>
              <FormHelperText sx={{ color: 'red' }}>{formError}</FormHelperText>

              <Button variant="outlined" type="submit">
                Continue
              </Button>
            </Box>
          </form>
        </Box>
      </Modal>
    </>
  );
};

export default AddUserModal;
