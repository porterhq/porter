const meta = require.meta;
const { url } = require.meta;
console.log(meta, url );
fetch(require.meta.resolve('./foo.json'));
