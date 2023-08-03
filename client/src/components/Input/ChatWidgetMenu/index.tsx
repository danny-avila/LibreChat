import React from 'react';
import WritingAssistant from './WritingAssistant';
import CodingAssistant from './CodingAssistant';

export default function ChatWidget() {
  return(
    <>
      <WritingAssistant />
      <CodingAssistant />
    </>
  );
}
