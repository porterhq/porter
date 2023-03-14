use swc_core::ecma::ast::BlockStmtOrExpr;
use swc_core::plugin::{plugin_transform, proxies::TransformPluginProgramMetadata};
use swc_core::{
    common::{comments::Comments, util::take::Take, BytePos, DUMMY_SP},
    ecma::{
        ast::{
            AssignExpr, BinExpr, CallExpr, Callee, Decl, Expr, ExprOrSpread, ImportDecl, Lit,
            ModuleDecl, ModuleItem, Program, Stmt, Str, VarDeclarator,
        },
        atoms::JsWord,
        visit::{VisitMut, VisitMutWith},
    },
    plugin::proxies::PluginCommentsProxy,
};

pub fn deheredoc_transform<C>(comments: C) -> impl VisitMut
where
    C: Comments,
{
    Deheredoc { comments }
}

struct Deheredoc<C>
where
    C: Comments,
{
    comments: C,
}

impl<C> Deheredoc<C>
where
    C: Comments,
{
    fn is_heredoc_call(&self, e: &Expr) -> bool {
        if let Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            args,
            ..
        }) = e
        {
            if let Expr::Ident(id) = &**callee {
                return &*id.sym == "heredoc" && args.len() == 1;
            }
        }
        false
    }

    fn is_heredoc_require(&self, e: &Expr) -> bool {
        if let Expr::Call(CallExpr {
            callee: Callee::Expr(callee),
            args,
            ..
        }) = e
        {
            if let Expr::Ident(id) = &**callee {
                if &*id.sym != "require" {
                    return false;
                }
                if let Some(ExprOrSpread { expr, .. }) = args.get(0) {
                    if let Expr::Lit(Lit::Str(lit)) = &**expr {
                        if &lit.value == "heredoc" {
                            return true;
                        }
                    }
                }
            }
        }
        false
    }

    fn deindent(&self, text: String) -> String {
        let mut indent = usize::MAX;
        for line in text.lines(){
            if let Some(i) = line.find(|c: char| !c.is_whitespace()) {
                if indent > i { indent = i; }
            }
        }
        if indent == usize::MAX { return text; }
        let mut result = String::new();
        for line in text.lines() {
            if line.len() > indent {
                result.push_str(line.split_at(indent).1);
                result.push_str("\n");
            } else if result.len() > 0 {
                result.push_str(line);
                result.push_str("\n");
            }
        }
        result.trim_end().to_string()
    }

    fn extract_heredoc(&self, e: &mut Expr) -> Option<String> {
        if !self.is_heredoc_call(e) { return None; }
        if let Expr::Call(CallExpr { args, .. }) = e {
            if let Some(ExprOrSpread { expr, .. }) = args.get(0) {
                if let Expr::Fn(func) = &**expr {
                    for stmt in func.function.body.iter() {
                        let comments = self.comments.take_trailing(BytePos(stmt.span.lo.0 + 1));
                        if let Some(comments) = comments {
                            for comment in comments.iter() {
                                return Some(self.deindent(comment.text.to_string()));
                            }
                        }
                    }
                }
                if let Expr::Arrow(func) = &**expr {
                    match &*func.body {
                        BlockStmtOrExpr::BlockStmt(block) => {
                            let comments = self.comments.take_trailing(BytePos(block.span.lo.0 + 1));
                            if let Some(comments) = comments {
                                for comment in comments.iter() {
                                    return Some(self.deindent(comment.text.to_string()));
                                }
                            }
                        },
                        _ => {},
                    }
                }
            }
        }
        None
    }
}

impl<C> VisitMut for Deheredoc<C>
where
    C: Comments,
{
    // Implement necessary visit_mut_* methods for actual custom transform.
    // A comprehensive list of possible visitor methods can be found here:
    // https://rustdoc.swc.rs/swc_ecma_visit/trait.VisitMut.html
    // fn visit_mut_call_expr(&mut self, e: &mut CallExpr) {
    //     println!("{}", 1);
    // }

    // https://swc.rs/docs/plugin/ecmascript/cheatsheet#deleting-node
    fn visit_mut_stmt(&mut self, s: &mut Stmt) {
        s.visit_mut_children_with(self);

        match s {
            Stmt::Decl(Decl::Var(var)) => {
                if var.decls.is_empty() {
                    s.take();
                }
            }
            _ => {}
        }
    }

    fn visit_mut_stmts(&mut self, stmts: &mut Vec<Stmt>) {
        stmts.visit_mut_children_with(self);

        // We do same thing here.
        stmts.retain(|s| !matches!(s, Stmt::Empty(..)));
    }

    fn visit_mut_module_items(&mut self, stmts: &mut Vec<ModuleItem>) {
        stmts.visit_mut_children_with(self);

        // We do same thing here.
        stmts.retain(|s| {
            !matches!(s, ModuleItem::Stmt(Stmt::Empty(..)))
                && !matches!(
                    s,
                    ModuleItem::ModuleDecl(ModuleDecl::Import(ImportDecl { span: DUMMY_SP, .. }))
                )
        });
    }

    fn visit_mut_var_declarator(&mut self, v: &mut VarDeclarator) {
        v.visit_mut_children_with(self);

        if let VarDeclarator {
            init: Some(init), ..
        } = v
        {
            if let Some(text) = self.extract_heredoc(init) {
                v.init = Some(Box::new(Expr::Lit(Lit::Str(Str {
                    span: v.span,
                    value: JsWord::from(text),
                    raw: None,
                }))));
            } else if self.is_heredoc_require(init) {
                v.name.take();
            }
        }
    }

    fn visit_mut_var_declarators(&mut self, vars: &mut Vec<VarDeclarator>) {
        vars.visit_mut_children_with(self);

        vars.retain(|node| {
            // We want to remove the node, so we should return false.
            if node.name.is_invalid() {
                return false;
            }

            // Return true if we want to keep the node.
            true
        });
    }

    fn visit_mut_assign_expr(&mut self, e: &mut AssignExpr) {
        e.visit_mut_children_with(self);

        if let Some(text) = self.extract_heredoc(&mut *e.right) {
            e.right = Box::new(Expr::Lit(Lit::Str(Str {
                span: e.span,
                value: JsWord::from(text),
                raw: None,
            })));
        }
    }

    fn visit_mut_bin_expr(&mut self, e: &mut BinExpr) {
        e.visit_mut_children_with(self);

        if let Some(text) = self.extract_heredoc(&mut *e.right) {
            e.right = Box::new(Expr::Lit(Lit::Str(Str {
                span: e.span,
                value: JsWord::from(text),
                raw: None,
            })));
        }
    }

    fn visit_mut_call_expr(&mut self, e: &mut CallExpr) {
        e.visit_mut_children_with(self);

        for i in 0..e.args.len() {
            let arg = &mut e.args[i];
            if let Some(text) = self.extract_heredoc(&mut arg.expr) {
                arg.expr = Box::new(Expr::Lit(Lit::Str(Str {
                    span: e.span,
                    value: JsWord::from(text),
                    raw: None,
                })));
            }
        }
    }

    fn visit_mut_import_decl(&mut self, i: &mut ImportDecl) {
        i.visit_mut_children_with(self);

        if &*i.src.value == "heredoc" {
            i.take();
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
pub fn deheredoc_plugin(
    mut program: Program,
    _metadata: TransformPluginProgramMetadata,
) -> Program {
    program.visit_mut_with(&mut deheredoc_transform(PluginCommentsProxy));
    program
}
