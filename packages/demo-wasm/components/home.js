import 'regenerator-runtime'
import init, { greet } from '@cara/hello-wasm'

init().then(() => {
  greet('wasm')
})
