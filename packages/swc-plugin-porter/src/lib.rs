use swc_core::{ecma::{
    ast::{Program, MemberExpr, Expr, Ident, VarDeclarator, MemberProp},
    transforms::testing::test,
    visit::{as_folder, FoldWith, VisitMut, VisitMutWith},
}, common::DUMMY_SP};
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata};

pub fn porter_transform() -> impl VisitMut {
    PorterVisitor
}

pub struct PorterVisitor;

impl PorterVisitor {
    fn module_meta(&self) -> Expr {
        let obj = Expr::Ident(Ident{ span: DUMMY_SP, sym: "require".into(), optional: false });
        let prop = MemberProp::Ident(Ident { span: DUMMY_SP, sym: "meta".into(), optional: false });
        Expr::Member(MemberExpr { span: DUMMY_SP, obj: Box::new(obj), prop })
    }
}

impl VisitMut for PorterVisitor {
    // Implement necessary visit_mut_* methods for actual custom transform.
    // A comprehensive list of possible visitor methods can be found here:
    // https://rustdoc.swc.rs/swc_ecma_visit/trait.VisitMut.html
    fn visit_mut_member_expr(&mut self, n: &mut MemberExpr) {
        n.visit_mut_children_with(self);

        if let Expr::MetaProp(_obj) = &*n.obj {
            n.obj = Box::new(self.module_meta());
        }
    }

    fn visit_mut_var_declarator(&mut self, n: &mut VarDeclarator) {
        n.visit_mut_children_with(self);

        if let Some(init) = &n.init {
            if let Expr::MetaProp(_obj) = &**init {
                n.init = Some(Box::new(self.module_meta()));
            }
        }
    }
}

/// An example plugin function with macro support.
/// `plugin_transform` macro interop pointers into deserialized structs, as well
/// as returning ptr back to host.
///
/// It is possible to opt out from macro by writing transform fn manually
/// if plugin need to handle low-level ptr directly via
/// `__transform_plugin_process_impl(
///     ast_ptr: *const u8, ast_ptr_len: i32,
///     unresolved_mark: u32, should_enable_comments_proxy: i32) ->
///     i32 /*  0 for success, fail otherwise.
///             Note this is only for internal pointer interop result,
///             not actual transform result */`
///
/// This requires manual handling of serialization / deserialization from ptrs.
/// Refer swc_plugin_macro to see how does it work internally.
#[plugin_transform]
pub fn process_transform(program: Program, _metadata: TransformPluginProgramMetadata) -> Program {
    program.fold_with(&mut as_folder(PorterVisitor))
}

// An example to test plugin transform.
// Recommended strategy to test plugin's transform is verify
// the Visitor's behavior, instead of trying to run `process_transform` with mocks
// unless explicitly required to do so.
test!(
    Default::default(),
    |_| as_folder(PorterVisitor),
    boo,
    // Input codes
    r#"console.log("transform");"#,
    // Output codes after transformed with plugin
    r#"console.log("transform");"#
);
