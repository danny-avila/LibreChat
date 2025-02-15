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
  width: 400,
  bgcolor: 'background.paper',
  border: '2px solid #000',
  boxShadow: 24,
  pt: 2,
  px: 4,
  pb: 3,
};

const BalanceModal: React.FC<BalanceModalProps> = (props) => {
  const [balance, setBalance] = useState<number | ''>('');

  const addBalanceHandler = async () => {
    console.log(balance);

    const res = await axios.post('http://localhost:3080/api/addBalance/add_balance', {
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
      <Box sx={{ ...style, width: 400 }}>
        <Typography id="modal-modal-title" variant="h6" component="h2">
          Add Balance
        </Typography>
        <Typography id="modal-modal-description" sx={{ mt: 2 }}>
          write the amount of balance you want add:
        </Typography>
        <Stack spacing={{ xs: 2 }}>
          <TextField
            label="Enter a number"
            type="number"
            value={balance}
            onChange={(event) => setBalance(+event.target.value)}
          />
          <Button variant="outlined" onClick={addBalanceHandler}>
            ADD
          </Button>
        </Stack>
      </Box>
    </Modal>
  );
};

export default BalanceModal;
