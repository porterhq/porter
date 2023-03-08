const files = import.meta.glob('../../data/**/*.json', { eager: true });
console.log(files);
