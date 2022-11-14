import React, { useRef, useEffect } from 'react';
import ReactDOM from 'react-dom';
import heredoc from 'heredoc';

import './about.css';

function App() {
  const container = useRef<HTMLElement>();
  useEffect(function() {
    if (container.current == null) return;
    container.current.innerHTML = heredoc(function() {/*
      <h1>It works!</h1>
    */});
  }, [container.current]);
  return <div ref={container} />;
}

ReactDOM.render(<App />, document.querySelector('#ReactApp'));
