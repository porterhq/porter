'use strict';

const assert = require('assert').strict;
const request = require('supertest');
const app = require('../../demo-postcss/app');

describe('opts.postcssPlugins', () => {
  it('should recognize custom postcss plugins', async () => {
    const res = await new Promise((resolve, reject) => {
      request(app.callback())
        .get('/app.css')
        .expect(200)
        .end((err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
    });

    // should transform custom media query and custom selector
    assert(!res.text.includes('@custom-media'));
    assert(!res.text.includes('@custom-selector'));
  });
});
