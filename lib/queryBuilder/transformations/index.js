import { CompositeQueryTransformation } from './CompositeQueryTransformation.js';

import { WrapMysqlModifySubqueryTransformation } from './WrapMysqlModifySubqueryTransformation.js';

export const transformation = new CompositeQueryTransformation([
  new WrapMysqlModifySubqueryTransformation(),
]);
