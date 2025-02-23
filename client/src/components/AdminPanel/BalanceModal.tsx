import { Box, Button, FormHelperText, Modal, Stack, TextField, Typography } from '@mui/material';
import axios from 'axios';
import { useEffect, useState } from 'react';

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
  const [balance, setBalance] = useState<string>('');
  const [balanceError, setBalanceError] = useState<string>('');

  useEffect(() => {
    if (!props.open) {
      setBalance('');
      setBalanceError('');
    }
  }, [props.open]);

  const balanceChangeHandler = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBalance(e.target.value);
    if (e.target.value.trim() === '') {
      setBalanceError('You must enter a balance.');
    } else if (isNaN(+e.target.value)) {
      setBalanceError('You must enter a number.');
    } else {
      setBalanceError('');
    }
  };

  const addBalanceHandler = async () => {
    if (balance.trim() === '') {
      setBalanceError('You must enter a balance.');
    } else {
      setBalanceError('');
    }

    if (+balance > 0 && balanceError.trim() === '') {
      const res = await axios.post('/api/addBalance/', {
        balance: +balance,
        id: props.userId,
      });
      props.refreshUsers();
      props.onClose();
      setBalance('');
      setBalanceError('');
    }
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
          Enter the amount you'd like to add:
        </Typography>
        <Stack spacing={{ xs: 2 }}>
          <TextField
            label="Enter a number"
            type="number"
            value={balance}
            onChange={balanceChangeHandler}
            error={balanceError.length !== 0}
            sx={{ mt: 2, maxWidth: '320px' }}
          />
          <FormHelperText sx={{ color: 'red' }}>{balanceError}</FormHelperText>
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
