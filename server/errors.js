/** 业务校验失败：映射为 HTTP 400 */
export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = 'ValidationError';
    this.code = 'validation_error';
    this.field = field;
    this.status = 400;
  }
}

/** 资源不存在：映射为 HTTP 404 */
export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.code = 'not_found';
    this.status = 404;
  }
}

/** 业务冲突（例如重复标签）：映射为 HTTP 409 */
export class ConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConflictError';
    this.code = 'conflict';
    this.status = 409;
  }
}
