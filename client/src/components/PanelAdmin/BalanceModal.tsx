import { Box, Button, Modal, Stack, TextField, Typography } from '@mui/material';
import axios from 'axios';
import { useState } from 'react';
import { number } from 'zod';

interface BalanceModalProps {
  open: boolean;
  onClose: () => void;
  userId: string;
  refreshUsers: () => Promise<void>;
}

const style = {
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width:350,
  bgcolor: 'background.paper',
  border: '2px solid #2d6a4f',
  boxShadow: 24,
  pt: 2,
  px: 4,
  pb: 3,
};

const BalanceModal: React.FC<BalanceModalProps> = (props) => {
  const [balance, setBalance] = useState<number | ''>('');

  const addBalanceHandler = async () => {
    console.log(balance);

    const res = await axios.post('http://localhost:3080/api/addBalance/', {
      balance: balance,
      id: props.userId,
    });
    console.log('add balance:', res);
    props.refreshUsers();
    props.onClose();
    setBalance('');
  };

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      aria-labelledby="parent-modal-title"
      aria-describedby="parent-modal-description"
    >
      <Box sx={{ ...style}}>
        <Typography id="modal-modal-title" variant="h6" component="h2" sx={{color:'#2d6a4f'}}>
          Add Balance
        </Typography>
        <Typography id="modal-modal-description" sx={{ my: 2 }}>
          Enter the balance you want add:
        </Typography>
        <Stack spacing={{ xs: 2 }}>
          <TextField
            label="Enter a number"
            type="number"
            value={balance}
            onChange={(event) => setBalance(+event.target.value)}
            sx={{mt:2,maxWidth: '320px'}}
          />
          <Button variant="outlined" onClick={addBalanceHandler}  sx={{
            mt:2,
            fontWeight: 'bold',
            maxWidth: '320px',
            borderColor: '#74c69d',
            color: '#74c69d',
            '&:hover': { backgroundColor: '#74c69d', color: '#fff' },
          }}>
            ADD
          </Button>
        </Stack>
      </Box>
    </Modal>
  );
};

export default BalanceModal;
