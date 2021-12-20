'use strict';

module.exports = function(api) {
  api && api.cache(true);

  return {
    presets: ['@babel/preset-react'],
    plugins: [
      '@babel/plugin-transform-react-jsx',
      '@babel/plugin-proposal-object-rest-spread',
      ['@babel/plugin-proposal-decorators', { 'legacy': true}],
      ['@babel/plugin-proposal-class-properties', { 'loose': false}],
      ['@babel/plugin-proposal-private-methods', { 'loose': false }]
    ]
  };
};
