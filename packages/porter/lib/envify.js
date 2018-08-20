'use strict'

const looseEnvify = require('loose-envify')

module.exports = function envify(fpath, code, env) {
  return new Promise(resolve => {
    const stream = looseEnvify(fpath, {
      BROWSER: true,
      NODE_ENV: process.env.NODE_ENV || 'development',
      ...env
    })
    let buf = ''
    stream.on('data', chunk => buf += chunk)
    stream.on('end', () => resolve(buf))
    stream.end(code)
  })
}
