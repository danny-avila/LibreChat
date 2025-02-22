import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  InputLabel,
  MenuItem,
  Modal,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { SelectChangeEvent } from '@mui/material';

interface User {
  name: string;
  username: string;
  role: string;
  id: string;
  email: string;
  balance: number;
}

interface EditUserModalProps {
  open: boolean;
  onClose: () => void;
  refreshUsers: () => Promise<void>;
  user: User;
}

interface UserRole {
  role: 'ADMIN' | 'USER';
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

const EditUserModal: React.FC<EditUserModalProps> = (props) => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');

  const [fullNameError, setFullNameError] = useState<string>('');
  const [emailError, setEmailError] = useState<string>('');
  const [passwordError, setPasswordError] = useState<string>('');

  const [role, setRole] = useState<UserRole['role']>('USER');

  const [formError, setFormError] = useState<string>('');

  useEffect(() => {
    if (props.open) {
      setFullName(props.user.name);
      setEmail(props.user.email);
      setRole(props.user.role as 'ADMIN' | 'USER');
      setPassword('');
      setFullNameError('');
      setEmailError('');
      setPasswordError('');
      setFormError('');
    }
  }, [props.open, props.user]);

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
    } else if (e.target.value.trim().length < 8) {
      setPasswordError('Password must be at least 8 characters.');
    } else {
      setPasswordError('');
    }
  };

  const roleChangeHandler = (e: SelectChangeEvent<'ADMIN' | 'USER'>) => {
    setRole(e.target.value as UserRole['role']);
  };

  const submitHandler = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (fullName.length && email.length && fullNameError.length === 0 && emailError.length === 0) {
      const editedUser: Partial<User> = {
        ...(fullName && { name: fullName }),
        ...(fullName && { username: fullName }), // Only include if fullName is not empty
        ...(email && { email }), // Only include if email is not empty
        ...(password && { password }), // Only include if password is not empty
        ...(role && { role }), // Only include if role is selected
      };

      try {
        const response = await axios.put(`http://localhost:3090/api/editUser/${props.user.id}`, {
          editedUser: editedUser,
        });
        props.onClose();
        setFullName('');
        setEmail('');
        setPassword('');
        setFullName('');
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
          <Typography id="modal-modal-title" variant="h6" sx={{ color: 'primary.main', mb: 2 }}>
            Edit User
          </Typography>
          <form onSubmit={submitHandler}>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <FormControl>
                <InputLabel id="role-label">role</InputLabel>
                <Select
                  labelId="role-label"
                  label="Role"
                  value={role}
                  onChange={roleChangeHandler}
                  sx={{ maxWidth: '320px' }}
                >
                  <MenuItem value="ADMIN">admin</MenuItem>
                  <MenuItem value="USER">user</MenuItem>
                </Select>
              </FormControl>
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

export default EditUserModal;
