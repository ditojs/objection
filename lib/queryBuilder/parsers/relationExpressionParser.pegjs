{
  function addChild(node, expr) {
    if (isToken(expr.$relation)) {
      throwMisplacedToken(expr.$relation);
    }

    if (Object.prototype.hasOwnProperty.call(node, expr.$name)) {
      const err = new Error();
      err.duplicateRelationName = expr.$name;
      throw err;
    }

    node[expr.$name] = expr;
    node.$childNames.push(expr.$name);
  }

  // `*` and `^` end a relation path, without modifiers, aliases or relations
  // after them.
  function isToken(name) {
    return /^(\*|\^\d*)$/.test(name);
  }

  function assertPlainToken(expr) {
    if (expr.$childNames.length > 0 || expr.$modify.length > 0 || expr.$name !== expr.$relation) {
      throwMisplacedToken(expr.$relation);
    }
  }

  function throwMisplacedToken(token) {
    const err = new Error();
    err.misplacedToken = token;
    throw err;
  }

  function newNode() {
    return {
      $name: null,
      $relation: null,
      $modify: [],
      $recursive: false,
      $allRecursive: false,
      $childNames: []
    };
  }
}

start =
  expr:expression {
    const node = newNode()

    if (expr.$relation === '*') {
      assertPlainToken(expr);
      node.$allRecursive = true;
    } else {
      addChild(node, expr);
    }

    return node;
  }
  /
  list:listExpression {
    const node = newNode()

    list.forEach(expr => addChild(node, expr));

    return node;
  }

expression =
  name:name args:args? alias:alias? list:subListExpression {
    const node = newNode()

    node.$name = alias || name;
    node.$relation = name;
    node.$modify = args || [];

    list.forEach(expr => addChild(node, expr));

    return node;
  }
  /
  name:name args:args? alias:alias? expr:subExpression? {
    const node = newNode()

    node.$name = alias || name;
    node.$relation = name;
    node.$modify = args || [];

    if (expr) {
      if (expr.$relation === '*') {
        assertPlainToken(expr);
        node.$allRecursive = true;
      } else if (isToken(expr.$relation)) {
        assertPlainToken(expr);
        node.$recursive = expr.$relation === '^' ? true : parseInt(expr.$relation.slice(1), 10);
      } else {
        addChild(node, expr);
      }
    }

    return node;
  }

alias =
  ws+ "as" ws+ alias:name {
    return alias;
  }

name =
  name:char+ {
    return name.join('');
  }

char =
  [^\[\]\(\),\. \t\r\n]

args =
  ws* "(" args:argListItem* ws* ")" {
    return args;
  }

argListItem =
  ws* arg:name ws* ","? {
    return arg;
  }

ws =
  [ \t\r\n]

subListExpression =
  ws* "." list:listExpression {
    return list;
  }

listExpression =
  ws* "[" items:listExpressionItem* ws* "]" ws* {
    return items;
  }

listExpressionItem =
  ws* expr:expression ws* ","? {
    return expr;
  }

subExpression =
  ws* "." ws* sub:expression ws* {
    return sub;
  }
