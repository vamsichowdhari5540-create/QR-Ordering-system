import React from 'react';

export default function Spinner({ dark = false }) {
  return <span className={`spinner${dark ? ' on-dark' : ''}`} aria-hidden="true" />;
}
