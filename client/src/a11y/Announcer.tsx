import React, { useState, useEffect } from 'react';
import MessageBlock from './MessageBlock';

interface AnnouncerProps {
  politeMessage: string;
  politeMessageId: string;
  assertiveMessage: string;
  assertiveMessageId: string;
}

const Announcer: React.FC<AnnouncerProps> = ({
  politeMessage,
  politeMessageId,
  assertiveMessage,
  assertiveMessageId,
}) => {
  const [state, setState] = useState({
    assertiveMessage1: '',
    assertiveMessage2: '',
    politeMessage1: '',
    politeMessage2: '',
    setAlternatePolite: false,
    setAlternateAssertive: false,
  });

  useEffect(() => {
    setState((prevState) => ({
      ...prevState,
      politeMessage1: prevState.setAlternatePolite ? '' : politeMessage,
      politeMessage2: prevState.setAlternatePolite ? politeMessage : '',
      setAlternatePolite: !prevState.setAlternatePolite,
    }));
  }, [politeMessage, politeMessageId]);

  useEffect(() => {
    setState((prevState) => ({
      ...prevState,
      assertiveMessage1: prevState.setAlternateAssertive ? '' : assertiveMessage,
      assertiveMessage2: prevState.setAlternateAssertive ? assertiveMessage : '',
      setAlternateAssertive: !prevState.setAlternateAssertive,
    }));
  }, [assertiveMessage, assertiveMessageId]);

  return (
    <div>
      <MessageBlock aria-live="assertive" aria-atomic="true" message={state.assertiveMessage1} />
      <MessageBlock aria-live="assertive" aria-atomic="true" message={state.assertiveMessage2} />
      <MessageBlock aria-live="polite" aria-atomic="false" message={state.politeMessage1} />
      <MessageBlock aria-live="polite" aria-atomic="false" message={state.politeMessage2} />
    </div>
  );
};

export default Announcer;
