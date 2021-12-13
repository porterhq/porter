import ReactDOM from 'react-dom';
import React from 'react';

import './home_dep';
import 'cropper/dist/cropper.css';
import styles from './stylesheets/app.less';

function Home() {
  return (
    <div className={styles.page}>
      <h1>It works!</h1>
    </div>
  );
}

ReactDOM.render(<Home />, document.querySelector('#ReactApp'));
