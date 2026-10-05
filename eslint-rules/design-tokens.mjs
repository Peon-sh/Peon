const PALETTE =
  'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';

const OFF_SCALE = new RegExp(
  [
    'text-\\[[0-9.]+px\\]',
    '\\bfont-(bold|extrabold|black)\\b',
    `\\b(bg|text|border|ring|fill|stroke|from|to|via|divide|outline|shadow)-(${PALETTE})-\\d{2,3}\\b`,
  ].join('|'),
);

const rule = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow font sizes, weights, and colors outside the design scale.' },
    messages: {
      offScale: 'Off-scale class "{{cls}}". Use the type scale (text-xs..text-display), weights 400/500/600, and semantic color tokens.',
    },
    schema: [],
  },
  create(context) {
    function check(node, text) {
      const m = text.match(OFF_SCALE);
      if (m) context.report({ node, messageId: 'offScale', data: { cls: m[0] } });
    }
    function checkExpression(node) {
      if (!node) return;
      if (node.type === 'Literal' && typeof node.value === 'string') check(node, node.value);
      else if (node.type === 'TemplateLiteral') node.quasis.forEach((q) => check(q, q.value.raw));
      else if (node.type === 'ConditionalExpression') {
        checkExpression(node.consequent);
        checkExpression(node.alternate);
      } else if (node.type === 'LogicalExpression') {
        checkExpression(node.left);
        checkExpression(node.right);
      } else if (node.type === 'ArrayExpression') node.elements.forEach(checkExpression);
      else if (node.type === 'ObjectExpression') {
        node.properties.forEach((p) => {
          if (p.type === 'Property') {
            if (p.key.type === 'Literal') checkExpression(p.key);
            checkExpression(p.value);
          }
        });
      }
    }
    return {
      JSXAttribute(node) {
        if (node.name.name !== 'className' || !node.value) return;
        if (node.value.type === 'Literal') checkExpression(node.value);
        else if (node.value.type === 'JSXExpressionContainer') checkExpression(node.value.expression);
      },
      CallExpression(node) {
        const callee = node.callee;
        const name = callee.type === 'Identifier' ? callee.name : null;
        if (name === 'cn' || name === 'cva' || name === 'clsx') node.arguments.forEach(checkExpression);
      },
    };
  },
};

export default rule;
