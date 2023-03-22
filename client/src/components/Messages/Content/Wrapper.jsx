import React from 'react';
import TextWrapper from './TextWrapper';
import Content from './Content';

const Wrapper = React.memo(({ text, generateCursor, isCreatedByUser, searchResult }) => {
  if (searchResult) {
    return (
      <Content
        content={text}
        generateCursor={generateCursor}
      />
    );
  } else if (!isCreatedByUser) {
    return (
      <TextWrapper
        text={text}
        generateCursor={generateCursor}
      />
    );
  } else if (isCreatedByUser) {
    return <>{text}</>;
  }
});

export default Wrapper;
