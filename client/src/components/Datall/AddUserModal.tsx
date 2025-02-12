import { Label } from '@mui/icons-material';
import { Box, FormControl, Modal, TextField, Typography } from '@mui/material';
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
  return (
    <>
      <Modal open={props.open} onClose={props.onClose}>
        <Box sx={{ ...style }}>
          
          <Typography id="modal-modal-title" variant="h6">add user</Typography>
          <FormControl>
            
            <TextField label='Enter a name' type='text' />
          </FormControl>
        </Box>
      </Modal>
    </>
  );
};

export default AddUserModal;
