/** 错误码目录（architecture §9.3） */
export const ERROR_CODES = {
  TEMPLATE_NOT_FOUND: 'TEMPLATE_001',
  TEMPLATE_PARSE_FAILED: 'TEMPLATE_002',
  TEMPLATE_NO_MATCH: 'TEMPLATE_003',
  TEMPLATE_CREATE_FAILED: 'TEMPLATE_004', // 模板引导创建失败（D92，architecture §9.3）
  PARSE_UNSUPPORTED: 'PARSE_001',
  PARSE_FAILED: 'PARSE_002',
  VALIDATE_FAILED: 'VALIDATE_001',
  CACHE_NOT_READY: 'CACHE_001',
  IO_WRITE_FAILED: 'IO_001',
  IO_READ_FAILED: 'IO_002', // 文件读取失败（ui/layout.md §4 文件选择交互）
  GENERATE_CONFLICT: 'GENERATE_001',
  MERGE_FAILED: 'MERGE_001',
  API_BAD_ARG: 'API_001',
  SECURITY_PATH_OUTSIDE: 'SECURITY_001'
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** 标准错误类（STANDARDS §5） */
export class ImporterProError extends Error {
  public readonly data?: any;

  constructor(
    public code: ErrorCode | string,
    message: string,
    data?: any
  ) {
    super(message);
    this.name = 'ImporterProError';
    this.data = data;
  }
}
