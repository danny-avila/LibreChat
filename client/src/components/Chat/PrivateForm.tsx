import React from 'react';
import { Input } from '../ui';

export default function PrivateForm() {
  return (
    <div className="flex h-screen items-center justify-center">
      <Input className="w-1/2" placeholder="Room password" />
    </div>
  );
}
