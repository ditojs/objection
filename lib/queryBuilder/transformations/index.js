import { CompositeQueryTransformation } from './CompositeQueryTransformation.js';

import { WrapMysqlModifySubqueryTransformation } from './WrapMysqlModifySubqueryTransformation.js';

const transformation = new CompositeQueryTransformation([
  new WrapMysqlModifySubqueryTransformation(),
]);

export { transformation };
