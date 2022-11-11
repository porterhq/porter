import './notfound_dep.coffee';
import './notfound.styl';

import('./editor').then(exports => {
  console.log(exports);
});
