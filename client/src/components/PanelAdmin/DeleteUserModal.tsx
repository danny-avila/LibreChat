import { Box, Button, Modal, Typography } from '@mui/material';
import axios from 'axios';

interface User {
  name: string;
  username: string;
  role: string;
  id: string;
  email: string;
  balance: number;
}

interface DeleteUserModalProps {
  open: boolean;
  onClose: () => void;
  refreshUsers: () => Promise<void>;
  user: User ;
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

const DeleteUserModal: React.FC<DeleteUserModalProps> = (props) => {
  const deleteUserHandler = async() => {
      const res= await axios.delete(`http://localhost:3090/api/deleteUser/${props.user.id}`)
      props.refreshUsers()
      props.onClose()
    console.log(res) 
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
          Delete User
        </Typography>
        <Typography id="modal-modal-description" sx={{ mt: 2 ,mb:1 }}>
          Are you sure you want delete this user with this specifications ?
        </Typography>
        <Typography variant="body2">Username: {props?.user?.username}</Typography>
        <Typography variant="body2">ID: {props?.user?.id}</Typography>
        <Typography variant="body2">Email: {props?.user?.email}</Typography>

        <Button variant="outlined" onClick={deleteUserHandler} sx={{mt:2}}>
          Yes delete it
        </Button>
      </Box>
    </Modal>
  );
};

export default DeleteUserModal;
