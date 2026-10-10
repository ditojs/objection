function getSqlStateClass(sqlState) {
  return sqlState.substr(0, 2);
}

export { getSqlStateClass };
