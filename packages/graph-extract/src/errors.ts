export class GraphExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphExtractError';
  }
}

export class ParseError extends GraphExtractError {
  constructor(
    message: string,
    public readonly rawResponse: string,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

export class ProviderError extends GraphExtractError {
  public readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = 'ProviderError';
    this.originalError = originalError;
  }
}
