import React from 'react';
import Button from './button';
// check if importing from js works
import greeting from './utils/greeting';

function Home() {
  function onClick() {
    greeting('Clicked!');
  }

  return (
    <div>
      <Button onClick={onClick}></Button>
    </div>
  );
}

export default Home;
