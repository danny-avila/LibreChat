import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog.tsx';

// Mock user data
const dummyUser = {
  name: 'John Doe',
  email: 'johndoe@example.com',
  placeholder: 'placeholder'

}

const Profile = ({ isOpen, setIsOpen }) => {
  const { name, email, placeholder } = dummyUser;

  // If the profile is not open, don't render anything
  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      style={{ width: '500px', borderRadius: '5px', boxShadow: '0 0 10px rgba(0, 0, 0, 0.15)' }}
    >
      <DialogContent style={{ padding: '20px' }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: '24px', color: 'white', marginBottom: '10px' }}>{`${name}'s Profile`}</DialogTitle>
        </DialogHeader>
        <div>
          <h1 style={{ fontSize: '20px', color: 'white' }}>{name}</h1>
          <h2 style={{ marginTop: '20px', fontSize: '20px', color: 'white' }}>{email}</h2>
          <h2 style={{ marginTop: '20px', fontSize: '20px', color: 'white' }}>{placeholder}</h2>
          <button
            onClick={() => setIsOpen(false)}
            style={{ marginTop: '40px', padding: '10px 20px', color: '#fff', backgroundColor: '#007bff', border: 'none', borderRadius: '3px', cursor: 'pointer' }}
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Profile;

