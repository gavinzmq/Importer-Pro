/**
 * 导入向导 Modal（4 步：来源选择 → 文件管理 → 模板配置 → 进度执行）
 * 权威布局：.arcmesh/ui/layout.md（Step1 §3 / Step2 §4 / Step3 §5 / Step4 §6–7）
 * 文件选择平台抽象（IFilePicker + FilePickerFactory）：architecture §5 / §9.7
 * Step 2 单列表（会话+历史、路径引用）：decisions D66–D68
 */
import {
  App,
  FileSystemAdapter,
  Modal,
  Notice,
  SuggestModal,
  TFile,
  normalizePath
} from 'obsidian';
import { ImportService } from '../core/import-service';
import { TemplateScanner } from '../core/scanner/template-scanner';
import { ParserRegistry } from '../core/parser/registry';
import type { DataRecord, FileInfo, ImportHistoryEntry, ImportResult, PluginSettings } from '../types';
import { extOf } from '../utils/path';
import { PauseController } from '../core/pause-controller';
import { FilePickerFactory, pickOptionsForSource } from './platform';
import type { IFilePicker } from './platform/types';
import {
  applyTransform,
  autoMapColumns,
  ColumnFormatOp,
  ColumnMapping,
  ColumnProcessOp,
  DataTransformConfig,
  DERIVED_PRESETS,
  DerivedPreset,
  emptyTransform,
  formatCount,
  formatFileSize,
  formatTimeAgo,
  FORMAT_OP_LABELS,
  MAPPING_TYPE_LABELS,
  PROCESS_OP_LABELS,
  RowCleanFlag,
  unmappedColumns
} from './wizard-data';
import { dryRunStats, type DryRunSummary } from './wizard-data';

type Step = 1 | 2 | 3 | 4 | 'done';

/* ── Step 1 数据源（7 解析器：Excel/CSV/JSON/HTML/Enex/Notion/AppleNotes） ── */
interface SourceItem {
  format: string;
  icon: string;
  label: string;
  desc: string;
  tag: string;
}
const SOURCE_GROUPS: Array<{ group: string; icon: string; items: SourceItem[] }> = [
  {
    group: '笔记应用',
    icon: '📱',
    items: [
      { format: 'notes', icon: '📖', label: 'Apple Notes', desc: '从 Apple Notes 导入', tag: '.notes' },
      { format: 'enex', icon: '📓', label: 'Evernote', desc: '从 Evernote 导入', tag: '.enex' },
      { format: 'zip', icon: '📗', label: 'Notion', desc: '从 Notion 导入', tag: '.zip' }
    ]
  },
  {
    group: '文件格式',
    icon: '📂',
    items: [
      { format: 'xlsx', icon: '📊', label: 'Excel 文件', desc: '无需转换，直接读取', tag: '.xlsx / .xls' },
      { format: 'csv', icon: '📄', label: 'CSV / TSV', desc: '逗号/制表符分隔，编码自动检测', tag: '.csv / .tsv' },
      { format: 'json', icon: '🧾', label: 'JSON', desc: '数组或单对象', tag: '.json' },
      { format: 'html', icon: '🌐', label: 'HTML', desc: '网页正文导入', tag: '.html' }
    ]
  }
];

/* ── Step 2 会话条目（D66–D68：仅记录路径引用，不预加载内容） ── */
interface SessionEntry {
  id: string; // 去重键：Vault 内=相对路径；外部=绝对路径/移动端标识（去重含历史）
  file: FileInfo;
  vaultPath: string | null; // Vault 相对路径（可解析/导入）；null = 外部文件（本里程碑仅排队）
  selected: boolean;
}

/* ── Step 3 当前配置对象 ── */
interface Step3Target {
  vaultPath: string;
  label: string;
  isHistory: boolean;
  history?: ImportHistoryEntry;
}

export interface ImportModalDeps {
  service: ImportService;
  scanner: TemplateScanner;
  parsers: ParserRegistry;
  settings: () => PluginSettings;
  save: (s: PluginSettings) => Promise<void>;
}

/** 预设规则选择器（ui/layout.md §5.7） */
class PresetSuggestModal extends SuggestModal<DerivedPreset> {
  constructor(app: App, private onPick: (p: DerivedPreset) => void) {
    super(app);
  }
  getSuggestions(query: string): DerivedPreset[] {
    const q = query.trim().toLowerCase();
    return DERIVED_PRESETS.filter(
      (p) => q === '' || p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q)
    );
  }
  renderSuggestion(preset: DerivedPreset, el: HTMLElement): void {
    el.createDiv({ text: preset.label });
    el.createDiv({ cls: 'ipw-suggest-sub', text: preset.id });
  }
  onChooseSuggestion(preset: DerivedPreset): void {
    this.onPick(preset);
  }
}

/** 导入向导（4 步，ui/layout.md 权威布局） */
export class ImportModal extends Modal {
  private step: Step = 1;
  private format = '';
  private picker: IFilePicker | null = null;

  // Step 2 状态（D66：会话+历史合并单列表）
  private session: SessionEntry[] = [];
  private selectedId: string | null = null;
  private externalSelected = false; // 选中的是外部文件（仅排队，本里程碑不可解析/导入）

  // Step 3 状态
  private step3: Step3Target | null = null;
  private templates: { id: string; name: string }[] = [];
  private templateId = '';
  private templateName = '';
  private matchType: 'regex' | 'glob' | 'exact' = 'regex';
  private matchPattern = '';
  private sheetNames: string[] = [];
  private sheetName = '';
  private importAllSheets = false;
  private parsed: Record<string, unknown>[] = [];
  private parseError: string | null = null;
  private parsedInfo: FileInfo | null = null;
  private transform: DataTransformConfig = emptyTransform();

  // Step 4 状态（R10 Dry Run 确认 / R09 暂停恢复停止 / 断点续跑）
  private step4Phase: 'confirm' | 'run' = 'confirm';
  private step4Dry: DryRunSummary | null = null;
  private lastDryResult: ImportResult | null = null;
  private dryFilesTotal = 0;
  private runRecords: DataRecord[] = [];
  private pauseCtl = new PauseController();
  private runStopped = false;
  private runTotalNotes = 0; // 本次导入全部 note 数（首次写入进度时捕获）
  private writtenNotes = 0; // note 粒度已完成数（本次 run 内累计，含断点 base）
  private accNotes = 0; // 断点：跨 run 已完成的 note 数（续跑起点）
  private accResult: ImportResult | null = null; // 跨断点累计结果
  private abortCtl: AbortController | null = null;
  private lastResult: ImportResult | null = null;

  constructor(
    app: App,
    private deps: ImportModalDeps
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    this.modalEl.addClass('importer-pro-modal');
    await this.render();
  }

  override onClose(): void {
    // 向导被关闭（含运行中 Esc）：中止仍在后台运行的导入，保留已写入笔记（R09）
    if (this.abortCtl) {
      this.runStopped = true;
      this.pauseCtl.resume(); // 唤醒暂停等待 → 生成器随后检查 abort 退出
      this.abortCtl.abort();
    }
    super.onClose();
  }

  /* ── 顶层渲染：header / body / footer ─────────────────────── */

  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('ipw-content');

    const header = contentEl.createDiv({ cls: 'ipw-header' });
    const body = contentEl.createDiv({ cls: 'ipw-body' });
    const footer = contentEl.createDiv({ cls: 'ipw-footer' });

    this.renderHeader(header);
    if (this.step === 1) await this.renderStep1(body);
    else if (this.step === 2) await this.renderStep2(body);
    else if (this.step === 3) await this.renderStep3(body);
    else if (this.step === 4) await this.renderStep4(body);
    else await this.renderDone(body);
    this.renderFooter(footer);
  }

  private renderHeader(el: HTMLElement): void {
    const left = el.createDiv({ cls: 'ipw-header-left' });
    if (this.step !== 1 && this.step !== 4 && this.step !== 'done') {
      const back = left.createEl('button', { cls: 'ipw-back', text: '← 返回' });
      back.addEventListener('click', () => {
        if (this.step === 3) this.step = 2;
        else this.step = ((this.step as number) - 1) as Step;
        void this.render();
      });
    }
    const center = el.createDiv({ cls: 'ipw-header-title' });
    if (this.step === 'done') center.setText(this.runStopped ? '⏹ 导入已停止' : '✅ 导入完成');
    else if (typeof this.step === 'number') center.setText(`Step ${this.step}/4 · ${STEP_LABELS[this.step]}`);
  }

  private renderFooter(el: HTMLElement): void {
    if (this.step === 4 || this.step === 'done') return; // 运行中/完成页的操作由自身提供

    const cancel = el.createEl('button', { cls: 'ipw-btn', text: '取消' });
    cancel.addEventListener('click', () => this.close());

    const actions = el.createDiv({ cls: 'ipw-footer-actions' });
    if (typeof this.step === 'number' && this.step > 1) {
      const back = actions.createEl('button', { cls: 'ipw-btn', text: '上一步' });
      back.addEventListener('click', () => {
        if (this.step === 3) this.step = 2;
        else this.step = ((this.step as number) - 1) as Step;
        void this.render();
      });
    }

    if (this.step === 1) return;

    if (this.step === 2) {
      const next = actions.createEl('button', { cls: 'ipw-btn ipw-primary', text: '下一步 →' });
      next.disabled = !this.hasSelection();
      next.addEventListener('click', () => this.goStep3FromSelection());
      return;
    }
    if (this.step === 3) {
      const next = actions.createEl('button', { cls: 'ipw-btn ipw-primary', text: '🚀 开始导入' });
      const blocked = !this.templateId || !this.step3 || this.parseError !== null || this.parsed.length === 0;
      next.disabled = blocked;
      next.addEventListener('click', () => this.startImport());
      return;
    }
  }

  /* ── Step 1：来源选择（纵向分组列表） ─────────────────────── */

  private async renderStep1(el: HTMLElement): Promise<void> {
    el.createEl('h4', { text: '选择数据来源' });
    el.createEl('div', { cls: 'ipw-sub', text: '选择你要导入的数据格式或来源设备' });

    for (const g of SOURCE_GROUPS) {
      el.createDiv({ cls: 'ipw-group', text: `${g.icon} ${g.group}` });
      for (const item of g.items) {
        const row = el.createEl('button', { cls: 'ipw-source' });
        row.createSpan({ cls: 'ipw-source-icon', text: item.icon });
        const mid = row.createDiv({ cls: 'ipw-source-main' });
        mid.createDiv({ cls: 'ipw-source-title', text: item.label });
        mid.createDiv({ cls: 'ipw-source-desc', text: item.desc });
        mid.createDiv({ cls: 'ipw-source-tag', text: item.tag });
        row.createSpan({ cls: 'ipw-source-arrow', text: '➜' });
        row.addEventListener('click', () => {
          this.format = item.format;
          this.step = 2;
          void this.render();
        });
      }
    }
  }

  /* ── Step 2：文件管理（会话 + 历史 单列表，D66–D68） ─────── */

  private get historyEntries(): ImportHistoryEntry[] {
    return this.deps.settings().importHistory ?? [];
  }

  private hasSelection(): boolean {
    return this.session.some((e) => e.selected);
  }

  private sessionIdFor(file: FileInfo, vaultPath: string | null): string {
    if (vaultPath) return normalizePath(vaultPath);
    return file.path || `ext:${file.name}`;
  }

  private async renderStep2(el: HTMLElement): Promise<void> {
    el.createEl('h4', { text: '文件管理' });

    // 选择文件（IFilePicker + FilePickerFactory）
    const pickRow = el.createDiv({ cls: 'ipw-pick-row' });
    const pickBtn = pickRow.createEl('button', { cls: 'ipw-pick-btn', text: '📁 选择文件' });
    const pickHint = pickRow.createSpan({ cls: 'ipw-pick-hint' });
    pickHint.setText(`支持格式: ${(pickOptionsForSource(this.format).accept ?? []).map((e) => `.${e}`).join(', ')}`);
    pickBtn.addEventListener('click', () => void this.pickAndAdd(pickRow));

    el.createDiv({ cls: 'ipw-sep' });

    // 合并后的单一文件列表
    const count = this.session.length + this.historyEntries.length;
    el.createDiv({ cls: 'ipw-list-heading', text: `文件列表 (共 ${count} 个)` });

    if (count === 0) {
      el.createDiv({ cls: 'ipw-empty', text: '请选择文件或从历史记录快速导入' });
      return;
    }

    const list = el.createDiv({ cls: 'ipw-files' });

    // 会话条目（本次选择，未导入自动删除 / 导入成功转历史）
    for (const s of this.session) {
      const row = list.createDiv({ cls: `ipw-file-row ipw-session${s.selected ? ' is-selected' : ''}` });
      row.createSpan({ cls: 'ipw-select-mark', text: s.selected ? '▶' : '○' });
      row.createSpan({ cls: 'ipw-file-icon', text: '📄' });
      const main = row.createDiv({ cls: 'ipw-file-main' });
      main.createDiv({ cls: 'ipw-file-name', text: s.file.name });
      const meta = main.createDiv({ cls: 'ipw-file-meta' });
      if (s.file.size > 0) meta.createSpan({ text: formatFileSize(s.file.size) });
      if (s.file.extension) meta.createSpan({ cls: 'ipw-file-ext', text: `.${s.file.extension}` });
      meta.createSpan({ cls: 'ipw-pending', text: '[待导入]' });
      if (s.vaultPath) meta.createSpan({ cls: 'ipw-vault-path', text: s.vaultPath });
      const remove = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕', attr: { title: '移除' } });
      remove.addEventListener('click', (ev) => {
        ev.stopPropagation();
        this.session = this.session.filter((x) => x.id !== s.id);
        if (this.selectedId === s.id) this.selectedId = null;
        void this.render();
      });
      row.addEventListener('click', () => {
        const nowSelected = !s.selected;
        this.session.forEach((x) => (x.selected = false));
        if (nowSelected) {
          s.selected = true;
          this.selectedId = s.id;
        } else {
          this.selectedId = null;
        }
        void this.render();
      });
    }

    // 历史条目（直接导入 / 修改模板 / 删除）
    for (const h of this.historyEntries) {
      const row = list.createDiv({ cls: 'ipw-file-row ipw-history' });
      row.createSpan({ cls: 'ipw-file-icon', text: '📄' });
      const main = row.createDiv({ cls: 'ipw-file-main' });
      main.createDiv({ cls: 'ipw-file-name', text: basenameOf(h.sourceFile) || h.sourceFile });
      const meta = main.createDiv({ cls: 'ipw-file-meta' });
      const tplName = this.templateNameOf(h.templateId);
      meta.createSpan({ text: `模板: ${tplName}` });
      meta.createSpan({ cls: 'ipw-count', text: `${formatCount(h.succeeded)} 条` });
      meta.createSpan({ text: formatTimeAgo(h.startedAt) });
      const ops = row.createDiv({ cls: 'ipw-row-ops' });
      const bImport = ops.createEl('button', { cls: 'ipw-mini', text: '🔄 直接导入' });
      bImport.addEventListener('click', () => void this.importHistoryDirect(h));
      const bEdit = ops.createEl('button', { cls: 'ipw-mini', text: '📝 修改模板' });
      bEdit.addEventListener('click', () => {
        this.step3 = {
          vaultPath: normalizePath(h.sourceFile),
          label: basenameOf(h.sourceFile) || h.sourceFile,
          isHistory: true,
          history: h
        };
        this.templateId = h.templateId;
        this.step = 3;
        void this.render();
      });
      const bDel = ops.createEl('button', { cls: 'ipw-mini ipw-danger', text: '🗑 删除' });
      bDel.addEventListener('click', () => {
        if (!window.confirm(`从导入历史中删除「${basenameOf(h.sourceFile)}」？`)) return;
        const s = this.deps.settings();
        s.importHistory = s.importHistory.filter((x) => x.id !== h.id);
        void this.deps.save(s);
        void this.render();
      });
    }
  }

  private templateNameOf(templateId: string): string {
    const t = this.templates.find((x) => x.id === templateId);
    if (t) return t.name;
    return this.deps.scanner.getConfig(templateId)?.name ?? templateId;
  }

  private async pickAndAdd(pickRow: HTMLElement): Promise<void> {
    pickRow.querySelector('.ipw-pick-status')?.remove();
    const status = pickRow.createSpan({ cls: 'ipw-pick-status' });
    try {
      const picker = this.picker ?? (this.picker = FilePickerFactory.create());
      const file = await picker.pickFile(pickOptionsForSource(this.format));
      if (!file) return; // 取消：不改向导状态
      status.remove();
      await this.addSessionFile(file);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status.setText(`⚠ IO_002 文件读取失败：${msg}，可重新选择`);
      status.addClass('is-error');
    }
  }

  /** 将选择结果加入会话列表（去重含历史，仅选中不新增；自动选中） */
  private async addSessionFile(file: FileInfo): Promise<void> {
    const vaultPath = await this.resolveVaultPath(file);
    const id = this.sessionIdFor(file, vaultPath);

    // 已存在于历史（同一去重键）→ 仅提示，不新增
    const inHistory =
      vaultPath !== null && this.historyEntries.some((h) => h.sourceFile === normalizePath(vaultPath));

    this.session.forEach((s) => (s.selected = false));
    const existing = this.session.find((s) => s.id === id);
    if (existing) {
      existing.selected = true;
      this.selectedId = existing.id;
      this.externalSelected = existing.vaultPath === null;
      void this.render();
      return;
    }
    if (inHistory) {
      new Notice('该文件已在导入历史中，可直接「直接导入」或「修改模板」');
      void this.render();
      return;
    }

    const entry: SessionEntry = {
      id,
      file: vaultPath ? { ...file, path: vaultPath } : file,
      vaultPath,
      selected: true
    };
    this.session.push(entry);
    this.selectedId = entry.id;
    this.externalSelected = vaultPath === null;
    void this.render();
  }

  /** 外部绝对路径 → Vault 相对路径（仅在路径位于 Vault 根内时）；否则视为外部文件 */
  private resolveVaultPath(file: FileInfo): string | null {
    if (!file.path) return null;
    if (/^[a-zA-Z]:[\\/]/.test(file.path) || file.path.startsWith('/')) {
      const adapter = this.app.vault.adapter;
      if (!(adapter instanceof FileSystemAdapter)) return null;
      const base = adapter.getBasePath().replace(/[\\/]+$/, '');
      const normBase = base.replace(/\\/g, '/').toLowerCase();
      const normPath = file.path.replace(/\\/g, '/');
      if (!normPath.toLowerCase().startsWith(normBase + '/') && normPath.toLowerCase() !== normBase) {
        return null; // Vault 外 → 外部文件（本里程碑仅排队，e2e 待 R01）
      }
      const rel = normPath.slice(base.length).replace(/^\/+/, '');
      const resolved = this.app.vault.getAbstractFileByPath(normalizePath(rel));
      return resolved instanceof TFile ? normalizePath(rel) : null;
    }
    // 已是 Vault 相对路径（如移动端/测试构造的 FileInfo）
    const f = this.app.vault.getAbstractFileByPath(normalizePath(file.path));
    return f instanceof TFile ? normalizePath(file.path) : null;
  }

  private goStep3FromSelection(): void {
    const sel = this.session.find((s) => s.selected);
    if (!sel) return;
    if (sel.vaultPath) {
      this.step3 = { vaultPath: sel.vaultPath, label: sel.file.name, isHistory: false };
      this.externalSelected = false;
    } else {
      // 外部文件：仅排队，本里程碑不支持解析/预览（D65/D66 边界，e2e 待 R01）
      this.step3 = null;
      this.externalSelected = true;
    }
    this.step = 3;
    void this.render();
  }

  /* ── Step 3：模板配置（7 区块，ui/layout.md §5） ─────────── */

  private async renderStep3(el: HTMLElement): Promise<void> {
    // 外部文件仅排队 → 直接给出引导，不进入配置
    if (this.externalSelected || (!this.step3 && this.selectedId)) {
      el.createDiv({
        cls: 'ipw-banner',
        text: '该文件为 Vault 外的外部文件（路径引用）。本里程碑支持排队与选中，端到端解析/导入将随 roadmap R01 提供。请选择 Vault 内文件或从历史记录快速导入。'
      });
      return;
    }
    if (!this.step3) {
      el.createDiv({ cls: 'ipw-banner', text: '请先在 Step 2 选择一个可导入的文件。' });
      return;
    }

    await this.prepareParse(); // 解析当前文件（含表单/行数/列）
    await this.loadTemplates();

    // 区块 1：文件信息条
    const info = el.createDiv({ cls: 'ipw-block ipw-file-bar' });
    const fname = this.parsedInfo?.name ?? this.step3.label;
    const rows = this.parsed.length;
    const sheetsTxt = this.sheetNames.length > 1 ? ` · ${this.sheetNames.length} 个工作表` : '';
    info.setText(`📄 ${fname} · ${formatCount(rows)} 行${sheetsTxt}`);

    if (this.parseError) {
      el.createDiv({ cls: 'ipw-banner is-error', text: this.parseError });
      return;
    }
    if (rows === 0) {
      el.createDiv({ cls: 'ipw-banner', text: '未解析到数据行，请返回重新选择文件。' });
      return;
    }

    el.createDiv({ cls: 'ipw-sep' });

    // 区块 2：数据表单选择（多 Sheet 时显示）
    if (this.sheetNames.length > 1) {
      this.renderSheetBlock(el);
      el.createDiv({ cls: 'ipw-sep' });
    }

    // 区块 3：模板元信息
    this.renderTemplateBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 4：数据处理（列格式化 / 行清洗 / 列处理）
    this.renderProcessBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 5：列映射
    this.renderMappingBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 6：派生字段
    this.renderDerivedBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 7：预览
    this.renderPreviewBlock(el);
  }

  private columns(): string[] {
    const seen = new Set<string>();
    for (const r of this.parsed.slice(0, 20)) for (const k of Object.keys(r)) seen.add(k);
    return Array.from(seen);
  }

  private async prepareParse(): Promise<void> {
    const t = this.step3;
    if (!t) return;
    this.parseError = null;
    const file = this.app.vault.getAbstractFileByPath(t.vaultPath);
    if (!(file instanceof TFile)) {
      this.parseError = 'IO_002 文件读取失败：原文件不可访问，请返回重新选择。';
      this.parsed = [];
      this.parsedInfo = null;
      this.sheetNames = [];
      this.sheetName = '';
      return;
    }
    const info: FileInfo = {
      path: file.path,
      name: file.name,
      extension: extOf(file.path),
      size: file.stat.size
    };
    this.parsedInfo = info;
    try {
      const parser = this.deps.parsers.getForFile(info);
      // 表单枚举（仅 Excel 提供，ui/layout.md §5.3）
      const getSheets = (parser as unknown as { getSheetNames?: (f: FileInfo) => Promise<string[]> }).getSheetNames;
      this.sheetNames = getSheets ? await getSheets(info) : [];
      if (this.sheetNames.length > 1 && !this.sheetNames.includes(this.sheetName)) {
        this.sheetName = this.sheetNames[0];
      }
      if (this.importAllSheets && this.sheetNames.length > 1) {
        const all: Record<string, unknown>[] = [];
        for (const sn of this.sheetNames) {
          const rows = await parser.parse(info, { sheetName: sn });
          for (const r of rows) all.push({ ...r, _sheet: sn });
        }
        this.parsed = all;
      } else {
        this.parsed = await parser.parse(info, { sheetName: this.sheetName || undefined });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.parseError = `IO_002 文件读取失败：${msg}`;
      this.parsed = [];
    }
  }

  private renderSheetBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '📋 选择数据表单' });
    wrap.createDiv({ cls: 'ipw-sub', text: `文件包含 ${this.sheetNames.length} 个工作表，请选择要导入的数据` });

    const row = wrap.createDiv({ cls: 'ipw-form-row' });
    row.createSpan({ cls: 'ipw-label', text: '当前:' });
    const sel = row.createEl('select', { cls: 'ipw-select' });
    for (const sn of this.sheetNames) sel.createEl('option', { value: sn, text: sn });
    sel.value = this.sheetName;
    sel.addEventListener('change', () => {
      this.sheetName = sel.value;
      this.importAllSheets = false;
      void this.render();
    });
    row.createSpan({ cls: 'ipw-muted', text: `行数: ${formatCount(this.parsed.length)}  列数: ${this.columns().length}` });

    const checkbox = wrap.createDiv({ cls: 'ipw-form-row' });
    const cb = checkbox.createEl('input', { type: 'checkbox' });
    cb.checked = this.importAllSheets;
    checkbox.createSpan({ text: ' 同时导入所有表单 (每个表单独立配置模板)' });
    cb.addEventListener('change', () => {
      this.importAllSheets = cb.checked;
      void this.render();
    });
  }

  private async loadTemplates(): Promise<void> {
    const list = await this.deps.scanner.listTemplates();
    this.templates = list.map((t) => ({ id: t.id, name: t.name }));
    if (!this.templateId && this.templates.length > 0) {
      // 按文件名自动匹配
      const auto = this.step3 ? await this.deps.scanner.findTemplate(this.step3.label) : null;
      this.templateId = auto?.id ?? this.templates[0].id;
    }
    const cfg = this.deps.scanner.getConfig(this.templateId);
    if (cfg) {
      this.templateName = this.templateName || cfg.name;
      const p = this.deps.scanner.getParsed(this.templateId);
      const m = p?.info.matchRules?.[0];
      if (m) {
        this.matchType = m.type;
        this.matchPattern = m.pattern;
      }
    }
  }

  private renderTemplateBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '🧩 模板元信息' });

    if (this.templates.length === 0) {
      wrap.createDiv({
        cls: 'ipw-banner',
        text: '未在模板目录发现模板。请先创建模板（frontmatter 含 template_id/name，正文含 preprocess 与 content 两个 handlebars 代码块），再重新打开向导。'
      });
      return;
    }

    // 模板下拉
    const row0 = wrap.createDiv({ cls: 'ipw-form-row' });
    row0.createSpan({ cls: 'ipw-label', text: '使用模板:' });
    const tpl = row0.createEl('select', { cls: 'ipw-select' });
    for (const t of this.templates) tpl.createEl('option', { value: t.id, text: t.name });
    tpl.value = this.templateId || this.templates[0].id;
    tpl.addEventListener('change', () => {
      this.templateId = tpl.value;
      const cfg = this.deps.scanner.getConfig(this.templateId);
      this.templateName = cfg?.name ?? '';
      const p = this.deps.scanner.getParsed(this.templateId);
      const m = p?.info.matchRules?.[0];
      if (m) {
        this.matchType = m.type;
        this.matchPattern = m.pattern;
      } else {
        this.matchPattern = '';
      }
      void this.render();
    });

    // 模板名称
    const row1 = wrap.createDiv({ cls: 'ipw-form-row' });
    row1.createSpan({ cls: 'ipw-label', text: '模板名称:' });
    const nameInput = row1.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '如 员工档案模板' });
    nameInput.value = this.templateName;
    nameInput.addEventListener('input', () => (this.templateName = nameInput.value));

    // 匹配规则 + 测试
    const row2 = wrap.createDiv({ cls: 'ipw-form-row' });
    row2.createSpan({ cls: 'ipw-label', text: '匹配规则:' });
    const typeSel = row2.createEl('select', { cls: 'ipw-select ipw-sel-type' });
    for (const [v, l] of [
      ['regex', '正则'],
      ['glob', '通配'],
      ['exact', '精确']
    ] as const) {
      typeSel.createEl('option', { value: v, text: l });
    }
    typeSel.value = this.matchType;
    typeSel.addEventListener('change', () => {
      this.matchType = typeSel.value as typeof this.matchType;
    });
    const pat = row2.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: this.matchType === 'regex' ? '^员工.*\\.xlsx$' : '*.xlsx' });
    pat.value = this.matchPattern;
    pat.addEventListener('input', () => (this.matchPattern = pat.value));
    const test = row2.createEl('button', { cls: 'ipw-btn', text: '测试' });
    const status = row2.createSpan({ cls: 'ipw-test-status' });
    test.addEventListener('click', () => {
      const ok = this.testMatch();
      status.setText(ok ? '✅ 匹配成功' : '❌ 未匹配');
      status.removeClass('is-ok', 'is-error');
      status.addClass(ok ? 'is-ok' : 'is-error');
    });

    wrap.createDiv({
      cls: 'ipw-muted ipw-note',
      text: '模板名称与匹配规则预填自所选模板；如需新建/修改模板，请直接编辑模板目录下的模板文件。'
    });
  }

  private testMatch(): boolean {
    if (!this.matchPattern || !this.step3) return false;
    const name = this.step3.label;
    try {
      if (this.matchType === 'exact') return name === this.matchPattern;
      if (this.matchType === 'glob') {
        const re = new RegExp('^' + this.matchPattern.split('*').map(escapeRe).join('.*') + '$');
        return re.test(name);
      }
      return new RegExp(this.matchPattern).test(name);
    } catch {
      return false;
    }
  }

  private renderProcessBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '🧹 数据清洗与预处理' });
    const cols = this.columns();

    // ── 列格式化 ──
    const fmtCard = wrap.createDiv({ cls: 'ipw-card' });
    fmtCard.createDiv({ cls: 'ipw-card-title', text: '📐 列格式化' });
    const fmtRow = fmtCard.createDiv({ cls: 'ipw-form-row' });
    const fCol = this.addColumnSelect(fmtRow, cols, '选择列');
    const fOp = fmtRow.createEl('select', { cls: 'ipw-select' });
    for (const o of FORMAT_OP_LABELS) fOp.createEl('option', { value: o.value, text: o.label });
    const fParam = fmtRow.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '参数（可选）' });
    const fAdd = fmtRow.createEl('button', { cls: 'ipw-mini', text: '➕ 添加' });
    fAdd.addEventListener('click', () => {
      if (!fCol.value) return;
      this.transform.formats.push({ column: fCol.value, op: fOp.value as ColumnFormatOp, param: fParam.value });
      void this.render();
    });
    this.renderRuleList(fmtCard, this.transform.formats.map((r) => formatRuleLabel(r.column, r.op, r.param)), (i) => {
      this.transform.formats.splice(i, 1);
      void this.render();
    });

    // ── 行清洗 ──
    const cleanCard = wrap.createDiv({ cls: 'ipw-card' });
    cleanCard.createDiv({ cls: 'ipw-card-title', text: '🧹 行清洗' });
    const cleanRow = cleanCard.createDiv({ cls: 'ipw-form-row ipw-checks' });
    const flags: Array<[string, RowCleanFlag]> = [
      ['去除空行', 'removeEmpty'],
      ['去重', 'dedupe'],
      ['过滤无效数据', 'filterInvalid']
    ];
    for (const [label, flag] of flags) {
      const cb = cleanRow.createEl('input', { type: 'checkbox' });
      cb.checked = this.transform.clean.includes(flag);
      cleanRow.createSpan({ text: label });
      cb.addEventListener('change', () => {
        this.transform.clean = cb.checked
          ? [...this.transform.clean, flag]
          : this.transform.clean.filter((f) => f !== flag);
        this.refreshPreviewOnly();
      });
    }

    // ── 列处理 ──
    const procCard = wrap.createDiv({ cls: 'ipw-card' });
    procCard.createDiv({ cls: 'ipw-card-title', text: '⚙️ 列处理' });
    const procRow = procCard.createDiv({ cls: 'ipw-form-row' });
    const pCol = this.addColumnSelect(procRow, cols, '选择列');
    const pOp = procRow.createEl('select', { cls: 'ipw-select' });
    for (const o of PROCESS_OP_LABELS) pOp.createEl('option', { value: o.value, text: o.label });
    const pParam = procRow.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '分隔符/连接符/正则' });
    const pAdd = procRow.createEl('button', { cls: 'ipw-mini', text: '➕ 添加' });
    pAdd.addEventListener('click', () => {
      if (!pCol.value) return;
      this.transform.processes.push({ column: pCol.value, op: pOp.value as ColumnProcessOp, param: pParam.value, param2: '' });
      void this.render();
    });
    this.renderRuleList(procCard, this.transform.processes.map((r) => processRuleLabel(r.column, r.op, r.param)), (i) => {
      this.transform.processes.splice(i, 1);
      void this.render();
    });
  }

  private addColumnSelect(container: HTMLElement, cols: string[], placeholder: string): HTMLSelectElement {
    const sel = container.createEl('select', { cls: 'ipw-select' });
    if (cols.length === 0) {
      sel.createEl('option', { value: '', text: '(无列)' });
      return sel;
    }
    sel.createEl('option', { value: '', text: placeholder });
    for (const c of cols) sel.createEl('option', { value: c, text: c });
    return sel;
  }

  private renderRuleList(card: HTMLElement, rules: string[], onRemove: (i: number) => void): void {
    if (rules.length === 0) {
      card.createDiv({ cls: 'ipw-muted ipw-note', text: '已配置: (无)' });
      return;
    }
    card.createDiv({ cls: 'ipw-muted', text: '已配置:' });
    const list = card.createDiv({ cls: 'ipw-rule-list' });
    rules.forEach((text, i) => {
      const row = list.createDiv({ cls: 'ipw-rule-row' });
      row.createSpan({ cls: 'ipw-rule-text', text: `• ${text}` });
      const del = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕' });
      del.addEventListener('click', () => onRemove(i));
    });
  }

  private renderMappingBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '📋 列映射 (只映射需要的列，未映射的列将被忽略)' });
    const cols = this.columns();

    const head = wrap.createDiv({ cls: 'ipw-grid ipw-grid-head ipw-map-head' });
    head.createSpan({ text: '源列名' });
    head.createSpan({ text: '目标字段' });
    head.createSpan({ text: '类型' });
    head.createSpan({ text: '操作' });

    if (this.transform.mappings.length === 0) {
      wrap.createDiv({ cls: 'ipw-muted ipw-note', text: '（暂无映射，将保留全部列）' });
    }
    this.transform.mappings.forEach((m, i) => {
      const row = wrap.createDiv({ cls: 'ipw-grid ipw-map-row' });
      const src = row.createEl('select', { cls: 'ipw-select' });
      for (const c of [...unmappedColumns(cols, this.transform.mappings), m.source]) {
        src.createEl('option', { value: c, text: c });
      }
      src.value = m.source;
      src.addEventListener('change', () => {
        this.transform.mappings[i].source = src.value;
        void this.render();
      });
      const target = row.createEl('input', { cls: 'ipw-input', type: 'text' });
      target.value = m.target;
      target.addEventListener('input', () => (this.transform.mappings[i].target = target.value));
      const type = row.createEl('select', { cls: 'ipw-select' });
      for (const o of MAPPING_TYPE_LABELS) type.createEl('option', { value: o.value, text: o.label });
      type.value = m.type;
      type.addEventListener('change', () => {
        this.transform.mappings[i].type = type.value as ColumnMapping['type'];
      });
      const del = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕', attr: { title: '删除映射行' } });
      del.addEventListener('click', () => {
        if (this.transform.mappings.length <= 1) {
          this.transform.mappings = [];
        } else {
          this.transform.mappings.splice(i, 1);
        }
        void this.render();
      });
    });

    const ops = wrap.createDiv({ cls: 'ipw-form-row' });
    const add = ops.createEl('button', { cls: 'ipw-mini', text: '➕ 添加映射行' });
    add.addEventListener('click', () => {
      const free = unmappedColumns(cols, this.transform.mappings);
      const source = free[0] ?? cols[0] ?? '';
      this.transform.mappings.push({ source, target: source, type: 'text' });
      void this.render();
    });
    const auto = ops.createEl('button', { cls: 'ipw-mini', text: '🧹 自动映射' });
    auto.addEventListener('click', () => {
      this.transform.mappings = autoMapColumns(cols, this.transform.mappings);
      void this.render();
    });
    const clear = ops.createEl('button', { cls: 'ipw-mini ipw-danger', text: '🗑 清空所有' });
    clear.addEventListener('click', () => {
      if (!window.confirm('清空全部列映射？')) return;
      this.transform.mappings = [];
      void this.render();
    });

    wrap.createDiv({
      cls: 'ipw-muted ipw-note',
      text: `💡 可用源列: ${unmappedColumns(cols, this.transform.mappings).join(' / ') || '(全部已映射)'} (仅显示未映射的列)`
    });
  }

  private renderDerivedBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '🧩 派生字段' });
    const cols = this.columns();

    const head = wrap.createDiv({ cls: 'ipw-grid ipw-grid-head ipw-derive-head' });
    head.createSpan({ text: '字段名' });
    head.createSpan({ text: '规则' });
    head.createSpan({ text: '来源' });
    head.createSpan({ text: '操作' });

    this.transform.derived.forEach((d, i) => {
      const row = wrap.createDiv({ cls: 'ipw-grid ipw-derive-row' });
      const field = row.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '目标字段' });
      field.value = d.field;
      field.addEventListener('input', () => (this.transform.derived[i].field = field.value));
      const rule = row.createEl('select', { cls: 'ipw-select' });
      for (const p of DERIVED_PRESETS) rule.createEl('option', { value: p.id, text: p.label });
      rule.value = d.rule;
      rule.addEventListener('change', () => {
        this.transform.derived[i].rule = rule.value;
        const p = DERIVED_PRESETS.find((x) => x.id === rule.value);
        if (p && !p.needsSource) this.transform.derived[i].source = '';
      });
      const source = row.createEl('select', { cls: 'ipw-select' });
      source.createEl('option', { value: '', text: '(无需来源)' });
      for (const c of cols) source.createEl('option', { value: c, text: c });
      source.value = d.source;
      source.addEventListener('change', () => (this.transform.derived[i].source = source.value));
      const del = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕' });
      del.addEventListener('click', () => {
        this.transform.derived.splice(i, 1);
        void this.render();
      });
    });

    const ops = wrap.createDiv({ cls: 'ipw-form-row' });
    const add = ops.createEl('button', { cls: 'ipw-mini', text: '+ 添加派生字段' });
    add.addEventListener('click', () => {
      this.transform.derived.push({ field: '', rule: DERIVED_PRESETS[0].id, source: cols[0] ?? '' });
      void this.render();
    });
    const presetBtn = ops.createEl('button', { cls: 'ipw-mini', text: '📋 预设规则' });
    presetBtn.addEventListener('click', () => {
      new PresetSuggestModal(this.app, (p) => {
        this.transform.derived.push({
          field: deriveDefaultFieldName(p.id, cols[0] ?? ''),
          rule: p.id,
          source: p.needsSource ? cols[0] ?? '' : ''
        });
        void this.render();
      }).open();
    });
  }

  private previewEl: HTMLElement | null = null;

  private renderPreviewBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '👁️ 预览 (前 3 行，已应用数据处理和派生规则)' });
    this.previewEl = wrap;
    this.renderPreviewRows(wrap);
  }

  private renderPreviewRows(container: HTMLElement): void {
    container.querySelector('.ipw-preview-grid-wrap')?.remove();
    container.querySelector('.ipw-preview-actions')?.remove();

    const transformed = applyTransform(this.parsed.slice(0, 20), this.transform).slice(0, 3);
    if (transformed.length === 0) {
      const note = container.createDiv({ cls: 'ipw-muted ipw-note', text: '(无数据可预览)' });
      note.addClass('ipw-preview-grid-wrap');
      return;
    }
    const cols = Object.keys(transformed[0]);
    const wrapEl = container.createDiv({ cls: 'ipw-preview-grid-wrap' });
    wrapEl.addClass('ipw-preview-grid-wrap');
    const grid = wrapEl.createDiv({ cls: 'ipw-preview-grid' });
    for (const c of cols) grid.createDiv({ cls: 'ipw-cell is-head', text: c, attr: { title: c } });
    for (const r of transformed) {
      for (const c of cols) {
        const v = r[c];
        grid.createDiv({ cls: 'ipw-cell', text: v === undefined || v === null ? '' : (Array.isArray(v) ? v.join('、') : String(v)) });
      }
    }
    const actions = container.createDiv({ cls: 'ipw-form-row ipw-preview-actions' });
    const edit = actions.createEl('button', { cls: 'ipw-link', text: '📝 编辑模板代码' });
    edit.addEventListener('click', () => {
      if (!this.templateId) {
        new Notice('请先选择模板');
        return;
      }
      const parsed = this.deps.scanner.getParsed(this.templateId);
      const file = parsed ? this.app.vault.getAbstractFileByPath(parsed.info.path) : null;
      if (file instanceof TFile) void this.app.workspace.getLeaf().openFile(file);
      else new Notice('模板文件不存在');
    });
  }

  /** 仅刷新预览区（区块 7），用于不改变结构的配置变更 */
  private refreshPreviewOnly(): void {
    if (this.previewEl && this.previewEl.isConnected) {
      const oldGrid = this.previewEl.querySelector('.ipw-preview-grid-wrap');
      oldGrid?.remove();
      this.previewEl.querySelector('.ipw-preview-actions')?.remove();
      this.renderPreviewRows(this.previewEl);
    }
  }

  /* ── Step 4：预检确认（R10 Dry Run）→ 进度执行（R09 暂停/恢复/停止/断点续跑） ── */

  private async renderStep4(el: HTMLElement): Promise<void> {
    const target = this.step3;
    const tplName = this.templateNameOf(this.templateId) || this.templateId;
    const infoBar = el.createDiv({ cls: 'ipw-file-bar' });
    infoBar.setText(target ? `📄 ${target.label}  模板: ${tplName}` : `模板: ${tplName}`);

    if (!target || !this.templateId || !this.parsedInfo) {
      el.createDiv({ cls: 'ipw-banner is-error', text: '缺少文件或模板，请返回。' });
      return;
    }
    if (this.step4Phase === 'confirm') {
      await this.renderStep4Confirm(el);
    } else {
      await this.runImport(el);
    }
  }

  private startImport(): void {
    // R10：进入 Step 4 先做 Dry Run 预检确认，不直接写入
    this.step4Phase = 'confirm';
    this.step4Dry = null;
    this.lastDryResult = null;
    this.dryFilesTotal = 0;
    this.runRecords = [];
    this.runStopped = false;
    this.runTotalNotes = 0;
    this.writtenNotes = 0;
    this.accNotes = 0;
    this.accResult = null;
    this.step = 4;
    void this.render();
  }

  /** R10：Dry Run 预检确认页（不写入任何文件） */
  private async renderStep4Confirm(el: HTMLElement): Promise<void> {
    const target = this.step3;
    if (!target || !this.templateId) return;

    if (this.step4Dry === null) {
      const status = el.createDiv({ cls: 'ipw-run-status', text: '🔍 正在预检（Dry Run），计算将新建/更新/跳过…' });
      const dry = await this.deps.service.importRecords(this.templateId, this.currentRecords(), {
        sourceLabel: target.vaultPath,
        dryRun: true
      });
      if (!this.contentEl.isConnected) return; // 向导已关闭，放弃后续渲染
      this.lastDryResult = dry;
      this.dryFilesTotal = dry.files.length;
      this.step4Dry = dryRunStats(dry.files);
      status.setText('✅ 预检完成');
      await this.render();
      return;
    }

    const s = this.step4Dry;
    const total = this.dryFilesTotal;
    const warn =
      total > 0 && s.created === 0 && s.updated === 0
        ? '本次预检未检测到需要新建/更新的内容，确认后将继续执行（全部跳过）。'
        : '';

    const cards = el.createDiv({ cls: 'ipw-stats ipw-dry-stats' });
    const mk = (label: string, value: string, cls = ''): void => {
      const c = cards.createDiv({ cls: `ipw-stat-card ${cls}` });
      c.createDiv({ cls: 'ipw-stat-num', text: value });
      c.createDiv({ cls: 'ipw-stat-label', text: label });
    };
    mk('将新建', `${formatCount(s.created)} 篇`, s.created > 0 ? 'is-ok' : '');
    mk('将更新', `${formatCount(s.updated)} 篇`, s.updated > 0 ? 'is-ok' : '');
    mk('将跳过', `${formatCount(s.skipped)} 篇`);
    mk('将失败', `${formatCount(s.failed)} 条`, s.failed > 0 ? 'is-err' : '');
    el.createDiv({ cls: 'ipw-muted ipw-note', text: `🔍 Dry Run 预估（未写入任何文件），共 ${formatCount(total)} 个待处理笔记。` });
    if (warn) el.createDiv({ cls: 'ipw-banner', text: warn });
    if (s.failed > 0 && this.lastDryResult && this.lastDryResult.errors.length > 0) {
      el.createDiv({ cls: 'ipw-muted ipw-note', text: `❌ 预检失败 ${formatCount(s.failed)} 条，详情：` });
      const errBox = el.createDiv({ cls: 'ipw-log is-compact' });
      for (const e of this.lastDryResult.errors.slice(0, 20)) {
        errBox.createDiv({ cls: 'ipw-log-line err', text: `❌ ${e.code} ${e.message}` });
      }
    }

    const ops = el.createDiv({ cls: 'ipw-form-row ipw-run-ops' });
    const back = ops.createEl('button', { cls: 'ipw-btn', text: '⬅ 返回修改' });
    back.addEventListener('click', () => {
      this.step = 3;
      void this.render();
    });
    const go = ops.createEl('button', { cls: 'ipw-btn ipw-primary', text: '🚀 确认导入' });
    go.disabled = s.failed > 0 && s.created === 0 && s.updated === 0; // 全部预检失败时禁止直接写入
    go.addEventListener('click', () => {
      this.step4Phase = 'run';
      void this.render();
    });
  }

  /** 当前 Step 3 配置下变换后的记录集（Dry Run 预检与正式导入共用，避免重复计算） */
  private currentRecords(): DataRecord[] {
    if (this.runRecords.length === 0) this.runRecords = applyTransform(this.parsed, this.transform);
    return this.runRecords;
  }

  /** ⏹ 停止后的「从断点继续」：回到 Step 4 运行页，以 accNotes 为起点续跑 */
  private resumeImport(): void {
    this.runStopped = false;
    this.step4Phase = 'run';
    this.step = 4;
    void this.render();
  }

  private async runImport(container: HTMLElement): Promise<void> {
    const target = this.step3;
    if (!target || !this.templateId || !this.parsedInfo) {
      container.createDiv({ cls: 'ipw-banner is-error', text: '缺少文件或模板，请返回。' });
      return;
    }
    const records = this.currentRecords();
    const startAt = this.accNotes; // 断点续跑：跨 run 已完成的 note 数

    const box = container.createDiv({ cls: 'ipw-run-box' });
    const status = box.createDiv({ cls: 'ipw-run-status', text: '正在准备…' });
    const barWrap = box.createDiv({ cls: 'ipw-bar' });
    const bar = barWrap.createDiv({ cls: 'ipw-bar-fill' });
    const counts = box.createDiv({ cls: 'ipw-run-counts', text: '成功: 0    失败: 0    跳过: 0' });
    const opsRow = box.createDiv({ cls: 'ipw-form-row ipw-run-ops' });
    const pauseBtn = opsRow.createEl('button', { cls: 'ipw-btn', text: '⏸ 暂停' });
    const stopBtn = opsRow.createEl('button', { cls: 'ipw-btn ipw-danger', text: '⏹ 停止' });

    const logBox = container.createDiv({ cls: 'ipw-log' });
    const pushLog = (cls: string, text: string): void => {
      if (logBox.children.length >= 50) logBox.firstChild?.remove();
      logBox.createDiv({ cls: `ipw-log-line ${cls}`, text });
      logBox.scrollTop = logBox.scrollHeight;
    };

    this.runStopped = false;
    this.pauseCtl = new PauseController();
    this.abortCtl = new AbortController();
    const abortSignal = this.abortCtl.signal;

    pauseBtn.addEventListener('click', () => {
      if (this.pauseCtl.paused) {
        this.pauseCtl.resume();
        pauseBtn.setText('⏸ 暂停');
        status.setText(this.runStopped ? '⏹ 已停止' : '正在继续写入…');
      } else {
        this.pauseCtl.pause();
        pauseBtn.setText('▶ 继续');
        status.setText('⏸ 已暂停（将在当前笔记写入后暂停）');
      }
    });
    stopBtn.addEventListener('click', () => {
      this.runStopped = true;
      this.pauseCtl.resume(); // 唤醒暂停等待 → 交由 abort 终止
      this.abortCtl?.abort();
      stopBtn.disabled = true;
      pauseBtn.disabled = true;
      status.setText('⏹ 正在停止…（保留已写入的笔记）');
    });

    const sourceLabel = target.vaultPath;
    if (startAt > 0) pushLog('info', `↩️ 已停止于第 ${formatCount(startAt)} 个笔记，本次从断点继续…`);
    pushLog('info', `开始导入 ${sourceLabel}，共 ${formatCount(records.length)} 条记录…`);

    const result = await this.deps.service.importRecords(this.templateId, records, {
      sourceLabel,
      abortSignal,
      pause: this.pauseCtl,
      startAt,
      onProgress: (p) => {
        if (p.phase === 'parse') {
          status.setText(`正在解析 ${p.done}/${p.total}…`);
          return;
        }
        // note 粒度进度（含断点 base，由生成器上报累计值）
        this.writtenNotes = p.done;
        if (this.runTotalNotes === 0) this.runTotalNotes = p.total;
        const pct = p.total > 0 ? Math.round((p.done / p.total) * 100) : 0;
        bar.style.width = `${pct}%`;
        counts.setText(`进度: 已处理 ${formatCount(p.done)} / ${formatCount(p.total)} 个笔记`);
        if (this.pauseCtl.paused) status.setText(`⏸ 已暂停（已写入 ${formatCount(p.done)} 个笔记）`);
        else status.setText(`正在写入第 ${formatCount(p.done)} / ${formatCount(p.total)} 个笔记...`);
      }
    });
    if (!this.contentEl.isConnected) return; // 向导已关闭（中止），不再渲染

    // 汇总日志（仅本次 run 的文件/错误，最多保留 50 条）
    for (const f of result.files.slice(0, 50)) {
      if (f.status === 'created') pushLog('ok', `✅ 已导入: ${f.path}`);
      else if (f.status === 'updated') pushLog('ok', `🔄 已更新: ${f.path}`);
      else if (f.status === 'skipped_unchanged') pushLog('skip', `⏭️ 跳过(未变更): ${f.path}`);
      else if (f.status === 'skipped_conflict') pushLog('skip', `⏭️ 跳过(冲突): ${f.path}`);
      else pushLog('err', `❌ ${f.path}: ${f.error ?? '失败'}`);
    }
    for (const e of result.errors.slice(0, 20)) pushLog('err', `❌ ${e.code} ${e.message}`);

    // 跨断点累计结果
    this.accResult = this.mergeRunResult(this.accResult, result);
    this.lastResult = this.accResult;
    this.accNotes = this.writtenNotes > 0 ? this.writtenNotes : this.accNotes + result.files.length;
    const merged = this.accResult;

    counts.setText(
      `成功: ${formatCount(merged.succeeded)}    失败: ${formatCount(merged.failed)}    跳过: ${formatCount(merged.skipped)}`
    );

    if (this.runStopped) {
      const pct = this.runTotalNotes > 0 ? Math.min(100, Math.round((this.accNotes / this.runTotalNotes) * 100)) : 100;
      bar.style.width = `${pct}%`;
      status.setText(`⏹ 导入已停止（保留已写入的 ${formatCount(merged.succeeded)} 篇笔记）`);
      pushLog('info', `⏹ 已停止。已写入 ${formatCount(merged.succeeded)} 篇，可「从断点继续」剩余记录。`);
      this.step = 'done';
      void this.render();
      return;
    }

    status.setText(result.success ? '✅ 导入完成' : '❌ 导入完成（存在失败）');
    bar.style.width = '100%';
    pushLog('info', `⏱️ 耗时 ${(merged.duration / 1000).toFixed(1)} 秒`);
    this.step = 'done';
    void this.render();
  }

  /** 跨断点累计结果合并（停止后继续时叠加统计） */
  private mergeRunResult(prev: ImportResult | null, next: ImportResult): ImportResult {
    if (!prev) return next;
    return {
      success: prev.failed === 0 && next.failed === 0,
      templateId: next.templateId,
      totalRecords: next.totalRecords,
      succeeded: prev.succeeded + next.succeeded,
      skipped: prev.skipped + next.skipped,
      failed: prev.failed + next.failed,
      files: [...prev.files, ...next.files],
      errors: [...prev.errors, ...next.errors],
      startTime: prev.startTime,
      endTime: next.endTime,
      duration: next.endTime - prev.startTime
    };
  }

  private async importHistoryDirect(h: ImportHistoryEntry): Promise<void> {
    // 🔄 直接导入：以历史模板 + 原文件立即执行
    const file = this.app.vault.getAbstractFileByPath(normalizePath(h.sourceFile));
    if (!(file instanceof TFile)) {
      new Notice(`IO_002 原文件不可访问：${h.sourceFile}`);
      return;
    }
    this.step3 = { vaultPath: file.path, label: file.name, isHistory: true, history: h };
    this.templateId = h.templateId;
    this.transform = emptyTransform(); // 直接导入不复用旧的 Step 3 配置
    this.sheetNames = [];
    this.sheetName = '';
    this.importAllSheets = false;
    this.lastResult = null;
    this.accResult = null;
    this.accNotes = 0;
    this.writtenNotes = 0;
    this.runTotalNotes = 0;
    this.runRecords = [];
    this.runStopped = false;
    this.step4Dry = null;
    this.dryFilesTotal = 0;
    await this.prepareParse();
    if (this.parseError || this.parsed.length === 0) {
      new Notice(this.parseError ?? '未能解析文件，无法直接导入。');
      return;
    }
    this.step4Phase = 'run'; // 历史「直接导入」跳过 Dry Run 确认，立即执行
    this.step = 4;
    await this.render();
  }

  /* ── 完成页（ui/layout.md §7） ───────────────────────────── */

  private renderDone(el: HTMLElement): void {
    const r = this.lastResult;
    if (!r) {
      el.createDiv({ text: '没有导入结果。' });
      return;
    }
    if (this.runStopped) {
      el.createDiv({
        cls: 'ipw-banner',
        text: '⏹ 导入已停止：本次已写入的笔记均已保留。可「从断点继续」处理剩余记录，或直接完成关闭。'
      });
    }
    const cards = el.createDiv({ cls: 'ipw-stats' });
    const mk = (label: string, value: string, cls = ''): void => {
      const c = cards.createDiv({ cls: `ipw-stat-card ${cls}` });
      c.createDiv({ cls: 'ipw-stat-num', text: value });
      c.createDiv({ cls: 'ipw-stat-label', text: label });
    };
    mk('总记录数', `${formatCount(r.totalRecords)} 条`);
    mk('成功导入', `${formatCount(r.succeeded)} 篇`, 'is-ok');
    mk('导入失败', `${formatCount(r.failed)} 条`, r.failed > 0 ? 'is-err' : '');
    mk('跳过记录', `${formatCount(r.skipped)} 条`);
    el.createDiv({ cls: 'ipw-muted ipw-note', text: `⏱️ 耗时: ${(r.duration / 1000).toFixed(1)} 秒` });

    if (r.errors.length > 0) {
      el.createDiv({ cls: 'ipw-done-errors', text: `❌ 错误详情 (${r.errors.length} 条):` });
      const box = el.createDiv({ cls: 'ipw-log is-compact' });
      for (const e of r.errors.slice(0, 50)) box.createDiv({ cls: 'ipw-log-line err', text: `❌ ${e.code} ${e.message}` });
    }

    const ops = el.createDiv({ cls: 'ipw-form-row ipw-done-ops' });
    const exportBtn = ops.createEl('button', { cls: 'ipw-btn', text: '📥 导出错误报告' });
    exportBtn.addEventListener('click', () => void this.exportErrorReport(r));
    if (r.files.length > 0) {
      const open = ops.createEl('button', { cls: 'ipw-btn', text: '📂 打开导入笔记' });
      open.addEventListener('click', () => {
        const first = r.files.find((f) => f.status === 'created' || f.status === 'updated');
        const file = first ? this.app.vault.getAbstractFileByPath(first.path) : null;
        if (file instanceof TFile) void this.app.workspace.getLeaf().openFile(file);
        else new Notice('没有可打开的新笔记');
      });
    }
    if (this.runStopped) {
      const resume = ops.createEl('button', { cls: 'ipw-btn ipw-primary', text: '▶ 从断点继续' });
      resume.addEventListener('click', () => this.resumeImport());
    }
    const finish = ops.createEl('button', { cls: 'ipw-btn', text: '✅ 完成' });
    finish.addEventListener('click', () => {
      // 会话条目：导入成功 → 转历史（由 importRecords 记录）；未导入自动丢弃
      this.session = [];
      this.selectedId = null;
      this.close();
    });
  }

  private async exportErrorReport(r: ImportResult): Promise<void> {
    const folder = this.deps.settings().paths.outputFolder || '';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const name = `importer-error-report-${stamp}.md`;
    const lines = ['# 导入错误报告', '', `- 时间: ${new Date(r.endTime).toLocaleString()}`, `- 模板: ${this.templateNameOf(r.templateId)}`, ''];
    for (const e of r.errors.slice(0, 200)) lines.push(`- ❌ \`${e.code}\`: ${e.message}`);
    const path = folder ? normalizePath(`${folder}/${name}`) : name;
    try {
      await this.app.vault.create(path, lines.join('\n'));
      new Notice(`错误报告已导出: ${path}`);
    } catch (e) {
      new Notice(`导出失败: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

/* ── 模块级小工具 ─────────────────────────────────────────── */

const STEP_LABELS: Record<number, string> = {
  1: '来源选择',
  2: '文件管理',
  3: '模板配置',
  4: '进度执行'
};

function basenameOf(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deriveDefaultFieldName(presetId: string, source: string): string {
  if (!source) return presetId;
  switch (presetId) {
    case 'genderFromID':
      return '性别';
    case 'birthFromID':
      return '生日';
    case 'md5Short':
      return `${source}_hash`;
    default:
      return presetId;
  }
}

function formatRuleLabel(column: string, op: string, param: string): string {
  const label = FORMAT_OP_LABELS.find((o) => o.value === op)?.label ?? op;
  return `${column} → ${label}${param ? ` (${param})` : ''}`;
}

function processRuleLabel(column: string, op: string, param: string): string {
  const label = PROCESS_OP_LABELS.find((o) => o.value === op)?.label ?? op;
  return `${column} → ${label}${param ? ` (${param})` : ''}`;
}

