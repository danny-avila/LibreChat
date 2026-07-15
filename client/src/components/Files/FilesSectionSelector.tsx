import React, { useState } from 'react';
import { Button } from '../ui';
import { useLocation, useNavigate } from 'react-router-dom';
import { GeneratedFilesView } from '../GeneratedFiles';

export default function FilesSectionSelector() {
  const navigate = useNavigate();
  const location = useLocation();
  let selectedPage = '/vector-stores';

  if (location.pathname.includes('vector-stores')) {
    selectedPage = '/vector-stores';
  }
  if (location.pathname.includes('files')) {
    selectedPage = '/files';
  }
  if (location.pathname.includes('generated')) {
    selectedPage = '/generated';
  }

  const darkButton = { backgroundColor: 'black', color: 'white' };
  const lightButton = { backgroundColor: '#f9f9f9', color: 'black' };

  return (
    <div>
      <div className="flex h-12 w-80 flex-row justify-center rounded border bg-white p-1">
        <div className="flex w-1/3 items-center pr-1">
          <Button
            className="w-full rounded rounded-lg border"
            style={selectedPage === '/vector-stores' ? darkButton : lightButton}
            onClick={() => {
              selectedPage = '/vector-stores';
              navigate('/d/vector-stores');
            }}
          >
            Vector Stores
          </Button>
        </div>
        <div className="flex w-1/3 items-center pr-1">
          <Button
            className="w-full rounded rounded-lg border"
            style={selectedPage === '/files' ? darkButton : lightButton}
            onClick={() => {
              selectedPage = '/files';
              navigate('/d/files');
            }}
          >
            Files
          </Button>
        </div>
        <div className="flex w-1/3 items-center">
          <Button
            className="w-full rounded rounded-lg border"
            style={selectedPage === '/generated' ? darkButton : lightButton}
            onClick={() => {
              selectedPage = '/generated';
              navigate('/d/generated');
            }}
          >
            Generated
          </Button>
        </div>
      </div>
      {selectedPage === '/generated' && <GeneratedFilesView />}
    </div>
  );
}
