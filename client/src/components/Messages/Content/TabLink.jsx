import React from 'react';

export default function TabLink(a) {
  return (
    <a
      href={a.href}
      title={a.title}
      className={a.className}
      target="_blank"
      rel="noopener noreferrer"
    >
      {a.children}
    </a>
  );
}
