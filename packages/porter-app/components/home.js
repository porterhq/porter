'use strict'

require('yen')
// require an extra entry to test package bundling
require('yen/events')
const Chart = require('chart.js')
const $ = require('jquery')
require('cropper')
const Prism = require('prismjs')

function htmlSafe(code) {
  return code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function intro() {
  var snippets = {
    node: `
const koa = require('koa')
const Porter = require('@cara/porter')
const app = koa()

app.use(new Porter().async())
`,
    browser: `
<link rel="stylesheet" href="/stylesheets/app.css">
<script src="/loader.js"></script>
<script>porter.import('home.js')</script>
`,
    component: `
// Requiring modules installed at node_modules. The component itself will be transform by babel.
const jquery = require('jquery')
const Preact = require('preact')

// Requiring modules by absolute uri. Though whether you can get the exports or not depends.
require('https://a1.alicdn.com/assets/qrcode.js')

// asynchronous require is supported too.
require.async('prismjs', function(Prism) {
  // use Prism
})
`,
    stylesheet: `
@import "./common/base.css";
@import "cropper/dist/cropper.css";

body { color: navy; }
`
  }

  for (var key in snippets) {
    $('#example-' + key).html(htmlSafe(snippets[key]).trim())
  }
}

function demoChart() {
  // http://www.chartjs.org/docs/latest/
  const ctx = document.getElementById('example-chart').getContext('2d')
  new Chart(ctx, {
      type: 'bar',
      data: {
          labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
          datasets: [{
              label: '# of Votes',
              data: [12, 19, 3, 5, 2, 3],
              backgroundColor: [
                  'rgba(255, 99, 132, 0.2)',
                  'rgba(54, 162, 235, 0.2)',
                  'rgba(255, 206, 86, 0.2)',
                  'rgba(75, 192, 192, 0.2)',
                  'rgba(153, 102, 255, 0.2)',
                  'rgba(255, 159, 64, 0.2)'
              ],
              borderColor: [
                  'rgba(255,99,132,1)',
                  'rgba(54, 162, 235, 1)',
                  'rgba(255, 206, 86, 1)',
                  'rgba(75, 192, 192, 1)',
                  'rgba(153, 102, 255, 1)',
                  'rgba(255, 159, 64, 1)'
              ],
              borderWidth: 1
          }]
      },
      options: {
          scales: {
              yAxes: [{
                  ticks: {
                      beginAtZero:true
                  }
              }]
          }
      }
  })
}

function demoCropper() {
  $('#example-cropper img').cropper({
    aspectRatio: 16 / 9,
    zoomOnWheel: false,
    crop: function(e) {
      console.log(e)
    }
  })
}

function demoRequireAsync() {
  require.async('yen', function(yen) {
    // amd style
    console.log(yen)
  })
}

function demoMap() {
  // test map
  const i18n = require('i18n')
  console.log(i18n.zh.hello())
}

function main() {
  intro()
  demoChart()
  demoCropper()
  demoRequireAsync()
  demoMap()
  Prism.highlightAll()
}

main()
