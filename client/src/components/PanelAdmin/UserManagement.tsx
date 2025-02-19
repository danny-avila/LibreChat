import {
  Button,
  Card,
  Modal,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import Paper from '@mui/material/Paper';
import { IconButton } from '@mui/material';

import DeleteIcon from '@mui/icons-material/Delete';
import EditIcon from '@mui/icons-material/Edit';
import AddIcon from '@mui/icons-material/Add';
import axios from 'axios';
import { useEffect, useState } from 'react';
import BalanceModal from './BalanceModal';
import AddUserModal from './AddUserModal';
import DeleteUserModal from './DeleteUserModal';
import EditUserModal from './EditUserModal';
// import Modal from './Modal';
import useAuthRedirect from '~/routes/useAuthRedirect';
import { useAuthContext } from '~/hooks';
import { useNavigate } from 'react-router-dom';

interface User {
  name: string;
  username: string;
  role: string;
  id: string;
  email: string;
  balance: number;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  const [balanceModal, setBalanceModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User>();

  const [addUserModal, setAddUserModal] = useState(false);
  const [deleteUserModal, setDeleteUserModal] = useState(false);
  const [editUserModal, setEditUserModal] = useState(false);

  const [loading, setLoading] = useState(true);

  const { user } = useAuthContext();
  const navigate = useNavigate();

  const getUsers = async () => {
    const res = await axios.get('http://localhost:3090/api/getUsers');

    const filteredUsers = res.data.map((item: any) => ({
      name: item.name,
      username: item.username,
      role: item.role,
      id: item._id,
      email: item.email,
      balance: item.balance,
    }));
    console.log(res);
    setUsers(filteredUsers);
  };

  // useEffect(() => {
  //   getUsers();
  // }, []);

  // useEffect(()=>{
  //   console.log(user )
  //   if(user !== undefined && user.role !== "ADMIN"){
  //     navigate('/c')
  //   }
  // },[])

  // useEffect(() => {
  //   if (user && user.role !== 'ADMIN') {
  //     navigate('/c');
  //   } else if (!user) {
  //     navigate('/login');
  //   } else {
  //     getUsers();
  //   }
  // }, [user, navigate]);

  useEffect(() => {
    const checkUser = async () => {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setLoading(false);
    };

    checkUser();
  }, []);

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate('/login');
      } else if (user.role !== 'ADMIN') {
        navigate('/c');
      } else {
        getUsers();
      }
    }
  }, [loading, user, navigate]);

  const addBalanceHandler = async (user: User) => {
    setBalanceModal(true);
    setSelectedUserId(user.id);
    console.log(user);
  };

  const deleteUserHandler = async (user: User) => {
    // console.log('delete' ,user)
    setDeleteUserModal(true);
    setSelectedUserId(user.id);
    setSelectedUser(user);
  };

  const editUserHandler = async (user: User) => {
    setEditUserModal(true);
    setSelectedUser(user);
  };

  if (loading) {
    return <p className="flex items-center justify-center">Loading...</p>;
  }

  return (
    <>
      {/* header */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', my: 2 }}>
        <Typography variant="h4" sx={{ color: 'primary.main' }}>
          User Management
        </Typography>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setAddUserModal(true)}
          sx={{
            fontWeight: 'bold',
            borderColor: 'primary.main',
            color: 'primary.main',
            '&:hover': { backgroundColor: 'primary.main', color: '#fff' },
          }}
        >
          Add User
        </Button>
      </Stack>
      {/* balance modal */}
      <BalanceModal
        open={balanceModal}
        onClose={() => setBalanceModal(false)}
        userId={selectedUserId}
        refreshUsers={getUsers}
      />
      {/* add-user modal */}
      <AddUserModal
        open={addUserModal}
        onClose={() => setAddUserModal(false)}
        refreshUsers={getUsers}
      />
      {/* edit user modal */}
      <EditUserModal
        open={editUserModal}
        onClose={() => setEditUserModal(false)}
        user={selectedUser}
        refreshUsers={getUsers}
      />
      {/* delete-user modal */}
      <DeleteUserModal
        open={deleteUserModal}
        onClose={() => setDeleteUserModal(false)}
        user={selectedUser}
        refreshUsers={getUsers}
      />
      <Paper sx={{ width: '100%', overflow: 'hidden' }} variant="outlined">
        <TableContainer
          sx={{
            maxHeight: '85vh',
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'primary.main',
              borderRadius: '4px',
            },
          }}
        >
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                <TableCell sx={{ fontWeight: 'bold' }}>User_id</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Role</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Balance</TableCell>
                <TableCell sx={{ fontWeight: 'bold' }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((item, index) => (
                <TableRow
                  key={item.id}
                  sx={{
                    '&:nth-of-type(odd)': { backgroundColor: 'primary.main' },
                    '&:nth-of-type(even)': { backgroundColor: 'secondary.main' },
                  }}
                >
                  <TableCell
                    sx={{
                      color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                    }}
                  >
                    {item.id}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                    }}
                  >
                    {item.username}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                    }}
                  >
                    {item.email}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                    }}
                  >
                    {item.role}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                    }}
                  >
                    {item.balance}
                  </TableCell>
                  <TableCell
                    sx={{
                      color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                    }}
                  >
                    <Tooltip title="delete user">
                      <IconButton
                        onClick={() => deleteUserHandler(item)}
                        sx={{
                          color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                        }}
                      >
                        <DeleteIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="edit user">
                      <IconButton
                        onClick={() => editUserHandler(item)}
                        sx={{
                          color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                        }}
                      >
                        <EditIcon />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="add balance">
                      <IconButton
                        onClick={() => addBalanceHandler(item)}
                        sx={{
                          color: +index % 2 === 0 ? 'secondary.main' : 'primary.main',
                        }}
                      >
                        <AddIcon />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </>
  );
};

export default UserManagement;
