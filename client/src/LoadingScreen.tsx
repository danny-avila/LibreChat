// src/components/LoadingScreen.jsx

import React from 'react';

const LoadingScreen = () => {
  return (
    <div style={styles.container}>
      <div style={styles.spinner}></div>
      <h1 style={styles.text}>Loading LibreChat...</h1>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    backgroundColor: '#171717',
  },
  spinner: {
    width: '50px',
    height: '50px',
    border: '6px solid #f3f3f3',
    borderTop: '6px solid #3498db',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  text: {
    color: '#fff',
    marginTop: '20px',
  },
};

export default LoadingScreen;
