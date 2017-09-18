'use strict'

var heredoc = require('heredoc').strip
require('yen')
var Chart = require('chart.js')
var $ = require('jquery')
require('cropper')
var Prism = require('prismjs')


function htmlSafe(code) {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function intro() {
  var node = heredoc(function() {/*
    const oceanify = require('oceanify')
    app.use(oceanify())
  */})

  var browser = heredoc(function() {/*
    <link rel="stylesheet" href="/stylesheets/app.css">
    <script src="/loader.js"></script>
    <script>oceanify.import('home.js')</script>
  */})

  $('#example-node').html(htmlSafe(node.trim()))
  $('#example-browser').html(htmlSafe(browser.trim()))

  Prism.highlightAll()
}

function demoChart() {
  console.log(Chart)
}

function demoCropper() {

}

function demoRequireAsync() {
  require.async('yen', function(yen) {
    // amd style
    console.log(yen)
  })
}

function demoMap() {
  // test map
  var t = require('templates/1')
  console.log(t)
}


function main() {
  intro()
  demoChart()
  demoCropper()
  demoRequireAsync()
  demoMap()
}

main()
