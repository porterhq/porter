'use strict'

const fs = require('fs')

const rsync = /Sync$/
Object.keys(fs).forEach(function(method) {
  if (rsync.test(method)) exports[method] = fs[method]
})

exports.readFile = function readFile(fpath, encoding) {
  return new Promise(function(resolve, reject) {
    fs.readFile(fpath, encoding, function(err, content) {
      if (err) reject(new Error(err))
      else resolve(content)
    })
  })
}

exports.writeFile = function writeFile(fpath, content) {
  return new Promise(function(resolve, reject) {
    fs.writeFile(fpath, content, function(err) {
      if (err) reject(new Error(err))
      else resolve()
    })
  })
}

exports.exists = function exists(fpath) {
  return new Promise(function(resolve) {
    fs.exists(fpath, resolve)
  })
}

exports.lstat = function lstat(fpath) {
  return new Promise(function(resolve, reject) {
    fs.lstat(fpath, function(err, stats) {
      if (err) reject(new Error(err))
      else resolve(stats)
    })
  })
}

exports.readdir = function readdir(dir) {
  return new Promise(function(resolve, reject) {
    fs.readdir(dir, function(err, entries) {
      if (err) reject(new Error(err))
      else resolve(entries)
    })
  })
}

exports.unlink = function unlink(fpath) {
  return new Promise(function(resolve, reject) {
    fs.unlink(fpath, function(err) {
      if (err) reject(new Error(err))
      else resolve()
    })
  })
}
