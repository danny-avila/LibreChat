import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/Dialog.tsx';
import { useGetUserQuery } from '@librechat/data-provider';

const Profile = ({ isOpen, setIsOpen }) => {
  const { data: user, isLoading, error } = useGetUserQuery();

  // If the profile is not open, don't render anything
  if (!isOpen) return null;

  // While the data is loading
  if (isLoading) return <div>Loading...</div>;

  // If there's an error
  if (error) return <div>An error occurred: {error.message}</div>;

  const { fullName, username, email } = user;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={setIsOpen}
      style={{ width: '500px', borderRadius: '5px', boxShadow: '0 0 10px rgba(0, 0, 0, 0.15)' }}
    >
      <DialogContent style={{ padding: '20px' }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: '24px', color: 'white', marginBottom: '10px' }}>{`${fullName}'s Profile`}</DialogTitle>
        </DialogHeader>
        <div>
          <h1 style={{ fontSize: '20px', color: 'white' }}>{fullName}</h1>
          <h2 style={{ marginTop: '20px', fontSize: '20px', color: 'white' }}>{username}</h2>
          <h2 style={{ marginTop: '20px', fontSize: '20px', color: 'white' }}>{email}</h2>
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
