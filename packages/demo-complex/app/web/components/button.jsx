import React from 'react';

import styles from './button.module.less';

export default function Button(props) {
  return (
    <button className={styles.button}>{props.children}</button>
  );
}
