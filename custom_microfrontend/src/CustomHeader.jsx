import React from 'react';

const CustomHeader = () => {
  return (
    <div 
      style={{
        backgroundColor: '#4a90e2',
        color: 'white',
        padding: '16px 24px',
        textAlign: 'center',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
        borderBottom: '2px solid #357abd',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        width: '100%',
        zIndex: 10000,
        boxSizing: 'border-box'
      }}
    >
      <h1 
        style={{
          margin: 0,
          fontSize: '24px',
          fontWeight: '600',
          letterSpacing: '0.5px'
        }}
      >
        Custom header sample
      </h1>
      <p 
        style={{
          margin: '8px 0 0 0',
          fontSize: '14px',
          opacity: 0.9,
          fontWeight: '400'
        }}
      >
        This is a custom microfrontend header displayed at the top of LibreChat
      </p>
    </div>
  );
};

export default CustomHeader;