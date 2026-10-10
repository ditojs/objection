class DBError extends Error {
  constructor(args) {
    super(args.message ?? args.nativeError.message);

    this.name = this.constructor.name;
    this.nativeError = args.nativeError;
    this.client = args.client;
  }
}

export { DBError };
