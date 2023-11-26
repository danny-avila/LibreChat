import React, { useState } from 'react';
import { useAuthContext } from '~/hooks';

function General() {
  const [imageUrl, setImageUrl] = useState('');
  const { user } = useAuthContext();

  const handleUpload = async () => {
    try {
      const userId = user?.id;

      if (!userId) {
        throw new Error('User ID is undefined');
      }

      const response = await fetch('/api/profilePicture', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId, imageUrl }),
      });

      if (!response.ok) {
        throw new Error('Failed to upload profile picture');
      }

      const { url } = await response.json();

      console.log('Profile picture uploaded successfully:', url);
    } catch (error) {
      console.error('Error:', error);
    }
  };

  return (
    <div>
      <input
        type="text"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
        placeholder="Enter image URL"
      />
      <button onClick={handleUpload}>Upload Profile Picture</button>
    </div>
  );
}

export default General;
