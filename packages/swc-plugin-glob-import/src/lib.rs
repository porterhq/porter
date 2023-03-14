use swc_core::{ecma::{
    ast::{Program, CallExpr, MemberExpr, MetaPropExpr, Callee, Expr, MetaPropKind, MemberProp, PropOrSpread, ExprOrSpread, Prop, KeyValueProp, PropName, Lit, AssignExpr, ObjectLit, Str, Import, VarDeclarator, Ident, ModuleItem, ModuleDecl, ImportDecl, ImportSpecifier, ImportDefaultSpecifier, ArrowExpr, BlockStmtOrExpr},
    visit::{as_folder, FoldWith, VisitMut, VisitMutWith},
    utils::prepend_stmts,
}, common::DUMMY_SP};
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata, metadata::TransformPluginMetadataContextKind};
use glob::glob;
use std::path::Path;

pub fn glob_import_transform(filepath: String) -> impl VisitMut {
    GlobImport { filepath, module_items: Vec::new(), glob_index: 0 }
}

pub struct GlobImport {
    filepath: String,
    module_items: Vec<(String, String)>,
    glob_index: i32,
}

impl GlobImport {
    fn is_glob_import(&self, n: &CallExpr) -> bool {
        if let Callee::Expr(expr) = &n.callee {
            if let Expr::Member(MemberExpr { obj, prop: MemberProp::Ident(id), .. }) = &**expr {
                if &*id.sym != "glob" { return false; }
                if let Expr::MetaProp(MetaPropExpr { kind, .. }) = &**obj {
                    if *kind == MetaPropKind::ImportMeta { return true; }
                }
            }
        }
        false
    }

    fn is_eager(&self, n: &ExprOrSpread) -> bool {
        if let Expr::Object(options) = &*n.expr {
            for prop in options.props.iter() {
                if let PropOrSpread::Prop(prop) = prop {
                    if let Prop::KeyValue(KeyValueProp { key: PropName::Ident(key), value }) = &**prop {
                        if &*key.sym == "eager" {
                            if let Expr::Lit(Lit::Bool(value)) = &**value {
                                return value.value;
                            }
                        }
                    }
                }
            }
        }
        false
    }

    fn import_decl(&self, local: &str, src: &str) -> ModuleItem {
       ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl {
            span: DUMMY_SP,
            specifiers: vec![
                ImportSpecifier::Default(
                    ImportDefaultSpecifier {
                        span: DUMMY_SP,
                        local: Ident { span: DUMMY_SP, sym: local.into(), optional: false },
                    }
                )
            ],
            src: Box::new(Str::from(src)),
            type_only: false,
            asserts: None,
        }))
    }

    fn dynamic_import(&self, specifier: &str) -> Expr {
        let callee = Callee::Import(Import { span: DUMMY_SP });
        let mut args = Vec::new();
        args.push(ExprOrSpread { spread: None, expr: Box::new(Expr::Lit(Lit::Str(Str::from(specifier)))) });
        let expr = CallExpr { callee, args, span: DUMMY_SP, type_args: None };
        let function = ArrowExpr {
            span: DUMMY_SP,
            params: Vec::new(),
            body: Box::new(BlockStmtOrExpr::Expr(Box::new(Expr::Call(expr)))),
            is_async: false,
            is_generator: false,
            type_params: None,
            return_type: None,
        };
        Expr::Arrow(function)
    }

    fn glob(&mut self, n: &CallExpr) -> Box<Expr> {
        let ExprOrSpread { expr, .. } = n.args.get(0).expect("pattern required!");
        let eager = match n.args.get(1) {
            Some(expr) => self.is_eager(expr),
            None => false,
        };
        let mut props: Vec<PropOrSpread> = Vec::new();
        if let Expr::Lit(Lit::Str(specifier)) = &**expr {
            let base = Path::new(&self.filepath).parent().unwrap();
            let fullpath = base.join(specifier.value.to_string());
            let pattern = fullpath.to_str().expect("pattern required!");
            let mut index = 0;
            for entry in glob(&pattern).expect("Failed to read glob pattern") {
                match entry {
                    Ok(path) => {
                        let filename = path.strip_prefix(base).unwrap().to_str().unwrap();
                        let specifier = if filename.starts_with(".") {
                            filename.to_string()
                        } else {
                            format!("./{filename}")
                        };
                        let value = if eager {
                            let local = format!("__glob_{}_{}", self.glob_index, index);
                            index += 1;
                            self.module_items.push((local.to_string(), specifier.to_string()));
                            Expr::Ident(Ident { span: DUMMY_SP, sym: local.into(), optional: false })
                        } else {
                            self.dynamic_import(&specifier)
                        };
                        let kv = KeyValueProp {
                            key: PropName::Str(Str::from(specifier)),
                            value: Box::new(value),
                        };
                        props.push(PropOrSpread::Prop(Box::new(Prop::KeyValue(kv))));
                    },
                    Err(e) => println!("{:?}", e),
                }
            }
        }
        Box::new(Expr::Object(ObjectLit { span: n.span, props }))
    }
}

impl VisitMut for GlobImport {

    // Implement necessary visit_mut_* methods for actual custom transform.
    // A comprehensive list of possible visitor methods can be found here:
    // https://rustdoc.swc.rs/swc_ecma_visit/trait.VisitMut.html
    fn visit_mut_assign_expr(&mut self, e: &mut AssignExpr) {
        e.visit_mut_children_with(self);

        if let Expr::Call(expr) = &*e.right {
            if self.is_glob_import(expr) {
                e.right = self.glob(expr);
            }
        }
    }

    fn visit_mut_var_declarator(&mut self, e: &mut VarDeclarator) {
        e.visit_mut_children_with(self);

        if let Some(expr) = &e.init {
            if let Expr::Call(expr) = &**expr {
                if self.is_glob_import(expr) {
                    e.init = Some(self.glob(expr));
                }
            }
        }
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        stmts.visit_mut_children_with(self);

        let imports = self.module_items.iter().map(|(local, specifier)| {
            self.import_decl(local, specifier)
        });

        prepend_stmts(stmts, imports.into_iter());
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
pub fn process_transform(program: Program, metadata: TransformPluginProgramMetadata) -> Program {
    let cwd = metadata.get_context(&TransformPluginMetadataContextKind::Cwd).expect("cwd required");
    let filename = metadata.get_context(&TransformPluginMetadataContextKind::Filename).expect("filename required");
    // cwd is exposed to wasi at /cwd
    // - https://github.com/kwonoj/swc/blob/main/crates/swc_plugin_runner/src/load_plugin.rs#L54
    let filepath = filename.replace(&cwd, "/cwd");
    program.fold_with(
        &mut as_folder(GlobImport {
            filepath,
            module_items: Vec::new(),
            glob_index: 0
        })
    )
}
