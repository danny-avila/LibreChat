import React from 'react';
import { ImageResponse } from '@vercel/og';

export default function OgImage() {
  return new ImageResponse(
    <div className="flex flex-col w-full h-full items-center justify-center bg-white">
      <div className="bg-gray-50 flex w-full">
        <div className="flex flex-col md:flex-row w-full py-12 px-4 md:items-center justify-between p-8">
          <div className="flex flex-col">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 text-left">
          Chat Group: Make images of cats
            </span>
            <span className="text-indigo-600 block mt-2">
              <h2>Join this AI Chat Group to start chatting now. Accept crypto tips for your chat contributions.</h2>
            </span>
            <div className="mt-8 flex md:mt-0">
              <div className="flex rounded-md shadow">
                <a className="flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-5 py-3 text-base font-medium text-white">Join Chat Group</a>
              </div>
              <div className="ml-3 flex rounded-md shadow">
                <a className="flex items-center justify-center rounded-md border border-transparent bg-white px-5 py-3 text-base font-medium text-indigo-600">ChatGroups.com</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
  );
}
