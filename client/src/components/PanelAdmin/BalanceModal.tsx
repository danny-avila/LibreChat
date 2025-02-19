import { Box, Button, Modal, Stack, TextField, Typography } from '@mui/material';
import axios from 'axios';
import { useState } from 'react';

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
  width: 350,
  bgcolor: 'background.default',
  border: '2px solid primary.main',
  boxShadow: 24,
  pt: 2,
  px: 4,
  pb: 3,
};

const BalanceModal: React.FC<BalanceModalProps> = (props) => {
  const [balance, setBalance] = useState<number | ''>('');

  const addBalanceHandler = async () => {
    const res = await axios.post('http://localhost:3080/api/addBalance/', {
      balance: balance,
      id: props.userId,
    });
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
      <Box sx={{ ...style }}>
        <Typography
          id="modal-modal-title"
          variant="h6"
          component="h2"
          sx={{ color: 'primary.main' }}
        >
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
            sx={{ mt: 2, maxWidth: '320px' }}
          />
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
              onClick={addBalanceHandler}
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
        </Stack>
      </Box>
    </Modal>
  );
};

export default BalanceModal;
