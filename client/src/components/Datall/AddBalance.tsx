import {
  Button,
  Card,
  Modal,
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

  const[balanceModal , setBalanceModal] =useState(true)





  useEffect(() => {
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

    getUsers();
  }, []);



  const AddBalanceHandler = async(user:User) =>{
    setBalanceModal(true)
    console.log(user)
  }

  return (
    <>
    
    <BalanceModal open={balanceModal} onClose={()=>setBalanceModal(false)}/>
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
                      <DeleteIcon />
                    </IconButton>
                    <IconButton>
                      <EditIcon />
                    </IconButton>
                    <IconButton onClick={()=>AddBalanceHandler(item)}>
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
