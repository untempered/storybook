import { handleADD, handleSTORYOF, patchNode, handleExportedName } from './parse-helpers';

const estraverse = require('estraverse');

export function splitSTORYOF(ast, source) {
  let lastIndex = 0;
  const parts = [source];

  estraverse.traverse(ast, {
    fallback: 'iteration',
    enter: node => {
      patchNode(node);

      if (node.type === 'CallExpression') {
        lastIndex = handleSTORYOF(node, parts, source, lastIndex);
      }
    },
  });

  return parts;
}
export function splitExports(ast, source) {
  const parts = [];
  let lastIndex = 0;

  estraverse.traverse(ast, {
    fallback: 'iteration',
    enter: node => {
      patchNode(node);
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration &&
        node.declaration.declarations &&
        node.declaration.declarations.length === 1 &&
        node.declaration.declarations[0].type === 'VariableDeclarator' &&
        node.declaration.declarations[0].id &&
        node.declaration.declarations[0].id.name &&
        node.declaration.declarations[0].init &&
        ['CallExpression', 'ArrowFunctionExpression', 'FunctionExpression'].includes(
          node.declaration.declarations[0].init.type
        )
      ) {
        const functionNode = node.declaration.declarations[0].init;
        parts.push(source.substring(lastIndex, functionNode.start - 1));
        parts.push(source.substring(functionNode.start, functionNode.end));
        lastIndex = functionNode.end;
      }
    },
  });

  if (source.length > lastIndex + 1) parts.push(source.substring(lastIndex + 1));
  if (parts.length === 1) return [source];
  return parts;
}

export function findAddsMap(ast, storiesOfIdentifiers) {
  const addsMap = {};
  const idsToFrameworks = {};

  estraverse.traverse(ast, {
    fallback: 'iteration',
    enter: (node, parent) => {
      patchNode(node);

      if (node.type === 'MemberExpression') {
        const { toAdd, idToFramework } = handleADD(node, parent, storiesOfIdentifiers);
        Object.assign(addsMap, toAdd);
        Object.assign(idsToFrameworks, idToFramework);
      }
    },
  });

  return { addsMap, idsToFrameworks };
}

export function findExportsMap(ast) {
  const addsMap = {};
  const idsToFrameworks = {};
  const metaDeclaration =
    ast &&
    ast.program &&
    ast.program.body &&
    ast.program.body.find(
      d =>
        d.type === 'ExportNamedDeclaration' &&
        d.declaration &&
        d.declaration.declarations &&
        d.declaration.declarations.length === 1 &&
        d.declaration.declarations[0].type === 'VariableDeclarator' &&
        d.declaration.declarations[0].id &&
        d.declaration.declarations[0].id.name === 'componentMeta' &&
        d.declaration.declarations[0].init &&
        d.declaration.declarations[0].init.type === 'ObjectExpression' &&
        d.declaration.declarations[0].init.properties
    );

  const titleProperty =
    metaDeclaration &&
    metaDeclaration.declaration.declarations[0].init.properties.find(
      p => p.key && p.key.name === 'title'
    );

  if (!titleProperty) {
    return { addsMap, idsToFrameworks };
  }
  const title = titleProperty.value.value;

  estraverse.traverse(ast, {
    fallback: 'iteration',
    enter: node => {
      patchNode(node);
      if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration &&
        node.declaration.declarations &&
        node.declaration.declarations.length === 1 &&
        node.declaration.declarations[0].type === 'VariableDeclarator' &&
        node.declaration.declarations[0].id &&
        node.declaration.declarations[0].id.name &&
        node.declaration.declarations[0].init &&
        ['CallExpression', 'ArrowFunctionExpression', 'FunctionExpression'].includes(
          node.declaration.declarations[0].init.type
        )
      ) {
        const toAdd = handleExportedName(
          title,
          node.declaration.declarations[0].id.name,
          node.declaration.declarations[0].init
        );
        Object.assign(addsMap, toAdd);
      }
    },
  });
  return { addsMap, idsToFrameworks };
}

export function findDependencies(ast) {
  const dependencies = [];
  const storiesOfIdentifiers = {};

  estraverse.traverse(ast, {
    fallback: 'iteration',
    enter: node => {
      patchNode(node);

      if (node.type === 'ImportDeclaration') {
        const candidateSpecifier = (node.specifiers || []).find(
          s => (s.imported || {}).name === 'storiesOf'
        );
        if (node.source.value.startsWith('@storybook/') && candidateSpecifier) {
          Object.assign(storiesOfIdentifiers, {
            [candidateSpecifier.local.name]: node.source.value,
          });
        }
        dependencies.push(node.source.value);
      }
    },
  });
  return { dependencies, storiesOfIdentifiers };
}
