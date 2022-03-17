import React from 'react';

export default function Button(props) {
  return (
    <div className="porter-button">
      <button>{props.children}</button>
    </div>
  );
}
