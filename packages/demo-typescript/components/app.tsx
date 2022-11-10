import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import Prism from 'prismjs';
import { throttle } from 'lodash';
import Home from './home';
// check if d.ts is correctly handled
import { Foo } from './types';
import { IHome } from './store';

console.log(throttle);

const foo: Foo = { a: 1 };
console.log(foo);

const bar: IHome = {
  mortgage: 1024 * 1024,
};
console.log(bar);

import('./utils/math').then(({ add }) => {
  console.log(add(1, 2));
});

function App() {
  useEffect(function() {
    Prism.highlightAll();
  });

  return (
    <Home />
  );
}

ReactDOM.render(<App />, document.querySelector('#ReactApp'));
