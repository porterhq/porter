const files = import.meta.glob('../../data/**/*.json');
console.log(files);

let data;
data = import.meta.glob('../../data/a/*.json');
console.log(data);

function foo() {
  const bfiles = import.meta.glob('../../data/b/*.json', { eager: false });
  console.log(bfiles);
}
foo();
