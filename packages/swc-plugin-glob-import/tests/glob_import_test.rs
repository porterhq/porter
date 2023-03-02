use std::path::PathBuf;

use swc_core::ecma::{
    transforms::testing::{test, test_fixture},
    visit::as_folder,
};
use swc_plugin_glob_import::glob_import_transform;

// An example to test plugin transform.
// Recommended strategy to test pglollugin's transform is verify
// the Visitor's behavior, instead of trying to run `process_transform` with mocks
// unless explicitly required to do so.
// test!(
//     Default::default(),
//     |t: Tester| as_folder(glob_import_transform(t.comments.clone())),
//     boo,
//     r#"var foo = heredoc(function() {/* foobar */});"#,
//     r#"var foo = "foobar";"#
// );

#[testing::fixture("tests/fixture/**/input.js")]
fn fixture(input: PathBuf) {
    let output = input.parent().unwrap().join("output.js");
    println!("{} -> {}", input.to_str().unwrap(), output.to_str().unwrap());

    test_fixture(
        Default::default(),
        &|_| as_folder(glob_import_transform(input.to_str().unwrap().to_string())),
        &input,
        &output,
        Default::default(),
    );
}
