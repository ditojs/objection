// select * from sysmessages where [error] in (2601, 2627, 515, 547, 241, 242, 8152, 245) and msglangid = 1033;

// Top level key is the severity
const codes = {
  16: new Set([241, 242, 245, 515, 547, 8152, 50000]),
  14: new Set([2601, 2627]),
};

export const mssqlErrorCodes = {
  has(code) {
    const set = codes[code.severity];

    if (set) {
      return set.has(code.errorCode);
    }

    return false;
  },
};
