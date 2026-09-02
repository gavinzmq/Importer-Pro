import { FileInfo } from '../../types';
import { IDataParser, ParserContext } from './parser';
import { ExcelParser } from './excel';
import { CSVParser } from './csv';
import { JSONParser } from './json';
import { HTMLParser } from './html';
import { EnexParser } from './enex';
import { NotionParser } from './notion';
import { AppleNotesParser } from './apple-notes';
import { ERROR_CODES, ImporterProError } from '../../utils/errors';

/** 解析器注册表：内置 7 类 + 外部扩展（registerParser） */
export class ParserRegistry {
  private parsers: IDataParser[] = [];

  constructor(ctx: ParserContext) {
    this.registerBuiltin(ctx);
  }

  private registerBuiltin(ctx: ParserContext): void {
    this.parsers.push(
      new ExcelParser(ctx),
      new CSVParser(ctx),
      new JSONParser(ctx),
      new HTMLParser(ctx),
      new EnexParser(ctx),
      new NotionParser(ctx),
      new AppleNotesParser(ctx)
    );
  }

  register(parser: IDataParser): void {
    this.parsers.unshift(parser);
  }

  list(): string[] {
    return this.parsers.map((p) => p.supportedFormats.join('/'));
  }

  getForFile(file: FileInfo): IDataParser {
    const parser = this.parsers.find((p) => p.canParse(file));
    if (!parser) {
      throw new ImporterProError(ERROR_CODES.PARSE_UNSUPPORTED, `不支持的文件格式: ${file.name}`);
    }
    return parser;
  }
}
