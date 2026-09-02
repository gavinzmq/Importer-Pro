import Handlebars from 'handlebars';
import { registerBuiltinHelpers } from '../../helpers/builtin';
import { LinkIndex } from '../cache/provider';

/** 模板引擎（architecture §2.2）：Handlebars 双阶段渲染 */
export interface ITemplateEngine {
  render(template: string, data: any): Promise<string>;
  renderPreprocess(template: string, data: any): Promise<any>;
  registerHelper(name: string, fn: Handlebars.HelperDelegate): void;
  registerPartial(name: string, content: string): void;
  validate(template: string): { valid: boolean; errors: string[] };
}

export class TemplateEngine implements ITemplateEngine {
  private hb = Handlebars.create();
  private linkIndex?: LinkIndex;

  constructor() {
    registerBuiltinHelpers(this.hb, () => this.linkIndex);
  }

  setLinkIndex(index: LinkIndex | undefined): void {
    this.linkIndex = index;
  }

  async render(template: string, data: any): Promise<string> {
    const compiled = this.hb.compile(template, { noEscape: false, strict: false });
    return compiled(data);
  }

  /** 预处理阶段：以 data 为根上下文执行模板（set 修改根），返回转换后的数据 */
  async renderPreprocess(template: string, data: any): Promise<any> {
    const root: Record<string, any> = { ...data };
    const compiled = this.hb.compile(template, { noEscape: true, strict: false });
    compiled(root, { allowProtoMethodsByDefault: true, allowProtoPropertiesByDefault: true } as any);
    return root;
  }

  registerHelper(name: string, fn: Handlebars.HelperDelegate): void {
    this.hb.registerHelper(name, fn);
  }

  registerPartial(name: string, content: string): void {
    this.hb.registerPartial(name, content);
  }

  validate(template: string): { valid: boolean; errors: string[] } {
    try {
      this.hb.parse(template);
      return { valid: true, errors: [] };
    } catch (e) {
      return { valid: false, errors: [String(e)] };
    }
  }

  get handlebars(): typeof Handlebars {
    return this.hb;
  }
}
