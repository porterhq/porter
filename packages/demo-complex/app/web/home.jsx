import ReactDOM from 'react-dom';
import React from 'react';

import './home_dep';
import { greeting } from './utils';

import 'cropper/dist/cropper.css';
import './stylesheets/app.less';
import Button from './components/button';

greeting('Hi there!');

function Home() {
  return (
    <div className="page">
      <h1>It works!</h1>
      <Button>Submit</Button>
    </div>
  );
}

ReactDOM.render(<Home />, document.querySelector('#ReactApp'));
