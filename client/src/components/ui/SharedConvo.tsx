import React from 'react';
import { useParams } from 'react-router-dom';

export default function SharedConvo() {
  const { conversationId } = useParams();

  return(
    <div>
      { conversationId }
    </div>
  );
}