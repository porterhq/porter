const files = {
    "../../data/a/bar.json": import("../../data/a/bar.json"),
    "../../data/b/baz.json": import("../../data/b/baz.json"),
    "../../data/foo.json": import("../../data/foo.json")
};
console.log(files);

let data;
data = {
    "../../data/a/bar.json": import("../../data/a/bar.json")
};
console.log(data);
