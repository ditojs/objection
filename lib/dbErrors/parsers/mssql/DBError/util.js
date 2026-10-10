export function getCode(error) {
  return {
    errorCode: error.number,
    severity: error.class,
  };
}

export function isCode(error, severity, errorCode) {
  const code = getCode(error);

  if (code) {
    return code.errorCode === errorCode && code.severity === severity;
  }

  return false;
}
