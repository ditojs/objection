import { DataError } from '../../../../errors/DataError.js';
import { getSqlStateClass } from '../../../../utils/sqlState.js';

export const dataErrorParser = {
  error: DataError,

  parse: (err) => {
    if (getSqlStateClass(err.code) === '22') {
      return {};
    } else {
      return null;
    }
  },

  subclassParsers: [],
};
