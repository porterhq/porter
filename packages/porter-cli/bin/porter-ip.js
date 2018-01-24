#!/usr/bin/env node

'use strict'

const interfaces = require('os').networkInterfaces()
const addresses = []

function ip() {
  Object.keys(interfaces).forEach(function(name) {
    interfaces[name].forEach(function(node) {
      if (node.family === 'IPv4' && node.internal === false) {
        addresses.push(node)
      }
    })
  })

  // Might apply some algorithm to determin which addresss is the one accessable
  // by totoro server if there's multiple addresses found.
  //
  // Just use the one found first for now.
  if (addresses.length > 0) {
    return addresses[0].address
  }
}


console.log(ip())
