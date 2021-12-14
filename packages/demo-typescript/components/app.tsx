import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import Prism from 'prismjs';
import Home from './home';
// check if d.ts is correctly handled
import { Foo } from './types';

const foo: Foo = { a: 1 };
console.log(foo);

function App() {
  useEffect(function() {
    Prism.highlightAll();
  });

  return (
    <Home />
  );
}

ReactDOM.render(<App />, document.querySelector('#ReactApp'));
