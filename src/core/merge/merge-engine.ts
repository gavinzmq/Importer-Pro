import { MergeOptions, MergePreview } from '../../types';

/** 合并引擎（architecture §2.6 / glossary 合并模式） */
export interface IMergeEngine {
  readonly name: string;
  merge(oldContent: string, newContent: string, options: MergeOptions): Promise<string>;
  canMerge(_oldContent: string, _newContent: string): boolean;
  preview(oldContent: string, newContent: string, options: MergeOptions): Promise<MergePreview>;
}

export class MergeEngine implements IMergeEngine {
  readonly name = 'default';

  canMerge(): boolean {
    return true;
  }

  async merge(oldContent: string, newContent: string, options: MergeOptions): Promise<string> {
    switch (options.mode) {
      case 'frontmatter':
        return mergeFrontmatter(oldContent, newContent);
      case 'append':
        return `${oldContent.trimEnd()}\n\n---\n\n${newContent.trimStart()}`;
      case 'replace_sections': {
        const [open, close] = options.sectionMarkers ?? ['<!-- importer:section:', '-->'];
        return replaceSections(oldContent, newContent, open, close);
      }
      case 'smart':
      default:
        return mergeFrontmatter(oldContent, newContent);
    }
  }

  async preview(oldContent: string, newContent: string, options: MergeOptions): Promise<MergePreview> {
    const merged = await this.merge(oldContent, newContent, options);
    const additions = Math.max(0, merged.split('\n').length - oldContent.split('\n').length);
    const removals = Math.max(0, oldContent.split('\n').length - merged.split('\n').length);
    return { additions, removals, sections: [] };
  }
}

function mergeFrontmatter(oldContent: string, newContent: string): string {
  const oldFm = extractFrontmatter(oldContent);
  const newFm = extractFrontmatter(newContent);
  if (!oldFm && !newFm) return newContent;
  if (!oldFm) return newContent;
  if (!newFm) return oldContent + '\n' + stripFrontmatter(newContent);

  const merged: Record<string, any> = { ...oldFm.raw, ...newFm.raw };
  const fm = Object.entries(merged)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
  return `---\n${fm}\n---\n${stripFrontmatter(newContent)}`;
}

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
}

function extractFrontmatter(content: string): { raw: Record<string, string> } | null {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const raw: Record<string, string> = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) raw[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { raw };
}

/** 按标记替换段：旧内容中标记段被新内容同名段替换，新内容新段追加 */
function replaceSections(oldContent: string, newContent: string, open: string, close: string): string {
  const sectionRegex = new RegExp(`${escapeRegex(open)}([\\s\\S]*?)${escapeRegex(close)}[\\s\\S]*?(?=${escapeRegex(open)}|$)`, 'g');
  const oldSections = collectSections(oldContent, open, close);
  const newSections = collectSections(newContent, open, close);

  let result = oldContent;
  for (const [id, body] of newSections) {
    if (oldSections.has(id)) {
      const oldBlock = `${open}${id}${close}${oldSections.get(id)}`;
      result = result.replace(oldBlock, `${open}${id}${close}${body}`);
    } else {
      result = result.trimEnd() + `\n\n${open}${id}${close}${body}`;
    }
  }
  void sectionRegex;
  return result;
}

function collectSections(content: string, open: string, close: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = new RegExp(`${escapeRegex(open)}([\\s\\S]*?)${escapeRegex(close)}([\\s\\S]*?)(?=${escapeRegex(open)}|$)`, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    map.set(m[1], m[2]);
  }
  return map;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
