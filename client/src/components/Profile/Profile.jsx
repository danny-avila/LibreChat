import React from 'react';
import { useGetUserQuery } from '@librechat/data-provider';
// import './Profile.css';

const Profile = ({ isOpen }) => {
  // Fetch user data using useGetUserQuery
  const { data: user, isLoading, error } = useGetUserQuery();

  // If the profile is not open, don't render anything
  if (!isOpen) return null;

  // While the data is loading
  if (isLoading) return <div>Loading...</div>;

  // If there's an error
  if (error) return <div>An error occurred: {error.message}</div>;

  // Destructure user data and set default values if some data is missing
  const { fullName = 'Full Name', username = 'Username', email = 'email@example.com', location = 'Unknown', title = 'Unknown', profileImage = '', address = 'Unknown', profession = 'Unknown', socialMedia = {}, interestedTopics = [] } = user;

  return (
    <div className="profile-container">
      <div className="top-left">
        <div className="profile-image">
          <img src={profileImage} alt="Profile" />
        </div>
        <div className="basic-profile-info">
          <h2>{username}</h2>
          <p>{location}</p>
          <p>{title}</p>
        </div>
      </div>
      <div className="top-right">
        <h2>{fullName}</h2>
        <p>Email: {email}</p>
        <p>Address: {address}</p>
        <p>Profession: {profession}</p>
      </div>
      <div className="bottom-left">
        <h2>Social Media</h2>
        <ul>
          <li>Twitter: {socialMedia.twitter || 'Not available'}</li>
          <li>LinkedIn: {socialMedia.linkedin || 'Not available'}</li>
          <li>Instagram: {socialMedia.instagram || 'Not available'}</li>
        </ul>
      </div>
      <div className="bottom-right">
        <h2>Interested Topics</h2>
        <ul>
          {interestedTopics.length > 0 ? (
            interestedTopics.map((topic) => <li key={topic}>{topic}</li>)
          ) : (
            <li>No topics listed.</li>
          )}
        </ul>
      </div>
    </div>
  );
};

export default Profile;
