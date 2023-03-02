const meta = import.meta;
const { url } = import.meta;
console.log(meta, url );
fetch(import.meta.resolve('./foo.json'));
