import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import TabLink from './TabLink';
import Markdown from 'markdown-to-jsx';
import Highlight from './Highlight';
import CodeBlock from './CodeBlock';
import Embed from './Embed';
// import { langSubset } from '~/utils/languages';

const mdOptions = {
  wrapper: React.Fragment,
  forceWrapper: true,
  overrides: {
    a: {
      component: TabLink
      // props: {
      //   className: 'foo'
      // }
    },
    pre: code,
    // code: {
    //   component: code
    // },
    // pre: {
    //   component: PreBlock
    // },
    p: {
      component: p
    }
  }
};

const Content = ({ content }) => {
  return (
    <>
      {/* <ReactMarkdown
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: false }]]}
        rehypePlugins={[
          [rehypeKatex, { output: 'mathml' }],
          [
            rehypeHighlight,
            {
              detect: true,
              ignoreMissing: true,
              subset: langSubset
            }
          ]
        ]}
        linkTarget="_new"
        components={{
          code,
          p
          // li,
          // ul,
          // ol
        }}
      >
        {content}
      </ReactMarkdown> */}
      <Markdown
        options={mdOptions}
      >
        {content}
      </Markdown>
    </>
  );
};

const PreBlock = ({children, ...rest}) => {
  console.log('pre', children);
  if ('type' in children && children ['type'] === 'code') {
    return code(children['props']);
  }
  return <pre {...rest}>{children}</pre>;
};

const code = (props) => {
  const { inline, className, children, ...rest } = props;

  if ('type' in children && children ['type'] === 'code') {
    // return code(children['props']);
    const match = /language-(\w+)/.exec(className || '');
    const lang = match && match[1];
    console.log('code', lang, children);
  
    if (inline) {
      return <code className={className}>{children}</code>;
    } else {
      return (
        <Embed
          language={lang}
          code={children}
          // matched={matched}
        >
          <Highlight
            language={lang}
            code={children}
          />
        </Embed>
      );
    }
  }
  return <pre {...rest}>{children}</pre>;

  const match = /language-(\w+)/.exec(className || '');
  const lang = match && match[1];
  console.log('code', lang, children);

  if (inline) {
    return <code className={className}>{children}</code>;
  } else {
    return (
      <Embed
        language={lang}
        code={children}
        // matched={matched}
      >
        <Highlight
          language={lang}
          code={children}
        />
      </Embed>
    );
  }
};

const p = (props) => {
  const regex = /^█$/;
  const match = regex.exec(props?.children || '');
  // if (match) {
  //   return (
  //     <p className="whitespace-pre-wrap ">
  //       {props?.children.slice(0, -1)}
  //       <span className="result-streaming">{'█'}</span>
  //     </p>
  //   );

  if (match) {
    return (
      <p className="whitespace-pre-wrap ">
        <span className="result-streaming">{'█'}</span>
      </p>
    );
  }

  return <p className="whitespace-pre-wrap ">{props?.children}</p>;
};

export default Content;
