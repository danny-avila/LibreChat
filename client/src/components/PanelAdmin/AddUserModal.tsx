import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  Modal,
  Stack,
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
  width: 350,
  bgcolor: 'background.default',
  border: '2px solid primary.main',
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
      setFullNameError('Name is required.');
    } else if (e.target.value.trim().length < 3) {
      setFullNameError('Name must be at least 3 characters.');
    } else {
      setFullNameError('');
    }
  };

  const emailHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    if (e.target.value.trim() === '') {
      setEmailError('Email is required.');
    } else if (e.target.value.includes('@') === false) {
      setEmailError('Please enter a valid email address.');
    } else {
      setEmailError('');
    }
  };

  const passwordHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    if (e.target.value.trim() === '') {
      setPasswordError('Password is required.');
    }else if(e.target.value.trim().length < 8){
      setPasswordError('Password must be at least 8 characters.');
    } else {
      setPasswordError('');
    }
  };

  const confirmPasswordHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value);
    if (e.target.value.trim() ==='') {
      setConfirmPasswordError('You must confirm password.');
    } else if (e.target.value.trim() !== password) {
      setConfirmPasswordError('Passwords do not match.');
    }else {
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
      const user = {
        email: email,
        name: fullName,
        username: fullName,
        confirm_password: confirmPassword,
        password: password,
      };
      try {
        const response = await axios.post('http://localhost:3090/api/auth/register', user);
        props.onClose();
        setFullName('');
        setEmail('');
        setPassword('');
        setFullName('');
        setConfirmPassword('');
        setFormError('');
        props.refreshUsers();
      } catch (error) {
        // setFormError(error?.message as string)
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
          <Typography id="modal-modal-title" variant="h6" sx={{ color: 'primary.main', mb: 2 }}>
            Add User
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
                  sx={{ maxWidth: '320px' }}
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
                  sx={{ maxWidth: '320px' }}
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
                  sx={{ maxWidth: '320px' }}
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
                  sx={{ maxWidth: '320px' }}
                />
                <FormHelperText sx={{ color: 'red' }}>{confirmPasswordError}</FormHelperText>
              </FormControl>
              <FormHelperText sx={{ color: 'red' }}>{formError}</FormHelperText>
              <Stack
                direction="row"
                spacing={2}
                sx={{ width: '100%', justifyContent: 'space-between' }}
              >
                <Button
                  variant="outlined"
                  onClick={props.onClose}
                  sx={{
                    fontWeight: 'bold',
                    flex: 1,
                    borderColor: 'primary.main',
                    color: 'primary.main',
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  type="submit"
                  sx={{
                    fontWeight: 'bold',
                    flex: 1,
                    backgroundColor: 'primary.main',
                    color: '#fff',
                    borderColor: 'primary.main',
                  }}
                >
                  Continue
                </Button>
              </Stack>
            </Box>
          </form>
        </Box>
      </Modal>
    </>
  );
};

export default AddUserModal;
