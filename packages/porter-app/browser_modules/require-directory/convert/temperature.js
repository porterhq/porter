'use strict'

exports.fahrenheit = function(celsius) {
  return celsius * 9 / 5 + 32
}

exports.celcius = function(fahrenheit) {
  return (fahrenheit - 32) * 5 / 9
}
