import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import Prism from 'prismjs';
import Home from './home';

function App() {
  useEffect(function() {
    Prism.highlightAll();
  });

  return (
    <Home />
  );
}

ReactDOM.render(<App />, document.querySelector('#ReactApp'));
