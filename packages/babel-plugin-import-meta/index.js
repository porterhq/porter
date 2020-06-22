module.exports = function({ types: t }) {
  return {
    visitor: {
      MetaProperty(path) {
        const { node } = path
        if (node.meta && node.meta.name === 'import' &&
            node.property.name === 'meta') {
          path.replaceWithSourceString(`__module.meta`)
        }
      }
    }
  }
}
