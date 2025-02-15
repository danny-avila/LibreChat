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
// import Modal from './Modal';

interface User {
  name: string;
  username: string;
  role: string;
  id: string;
  email: string;
  balance: number;
}

const AddBalance: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);

  const [balanceModal, setBalanceModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedUser ,setSelectedUser] =useState<User>()

  const [addUserModal, setAddUserModal] = useState(false);
  const [deleteUserModal,setDeleteUserModal] =useState(false)

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

  useEffect(() => {
    getUsers();
  }, []);

  const addBalanceHandler = async (user: User) => {
    setBalanceModal(true);
    setSelectedUserId(user.id);
    console.log(user);
  };

  const deleteBalanceHandler = async(user: User) =>{
    // console.log('delete' ,user)
    setDeleteUserModal(true)
    setSelectedUserId(user.id);
    setSelectedUser(user)
  
  }

  return (
    <>
      {/* header */}
      <Stack direction="row" sx={{ justifyContent: 'space-between', my: 2 }}>
        <Typography variant="h4">User Management</Typography>
        <Button variant="outlined" startIcon={<AddIcon />} onClick={()=>setAddUserModal(true)}>
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

      {/* delete-user modal */}
      <DeleteUserModal open={deleteUserModal} onClose={()=>setDeleteUserModal(false)} refreshUsers={getUsers} user={selectedUser}/>
      <Paper sx={{ width: '100%', overflow: 'hidden' }} variant="outlined">
        <TableContainer sx={{ maxHeight: 440 }}>
          <Table stickyHeader aria-label="sticky table">
            <TableHead>
              <TableRow>
                <TableCell>User_id</TableCell>
                <TableCell>Username</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Balance</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.id}</TableCell>
                  <TableCell>{item.username}</TableCell>
                  <TableCell>{item.email}</TableCell>
                  <TableCell>{item.role}</TableCell>
                  <TableCell>{item.balance}</TableCell>
                  <TableCell>
                    <IconButton>
                      <DeleteIcon onClick={()=>deleteBalanceHandler(item)}/>
                    </IconButton>
                    <IconButton>
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={() => addBalanceHandler(item)}>
                      <AddIcon />
                    </IconButton>
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

export default AddBalance;
