/**
 * 导入向导 Modal（4 步：来源选择 → 文件管理 → 模板配置 → 进度执行）
 * 权威布局：.arcmesh/ui/layout.md（Step1 §3 / Step2 §4 / Step3 §5 / Step4 §6–7）
 * 文件选择平台抽象（IFilePicker + FilePickerFactory）：architecture §5 / §9.7
 * Step 2 单列表（会话+历史、路径引用）：decisions D66–D68；外部文件端到端导入：D81（decisions/2026-09-03-external-file-e2e.md）
 */
import {
  App,
  FileSystemAdapter,
  Modal,
  Notice,
  TFile,
  normalizePath
} from 'obsidian';
import { ImportService } from '../core/import-service';
import { TemplateScanner } from '../core/scanner/template-scanner';
import { ParserRegistry } from '../core/parser/registry';
import type {
  ConflictStrategy,
  DataRecord,
  FileInfo,
  ImportHistoryEntry,
  ImportResult,
  IncrementalMode,
  NoteTypeConfig,
  ParseOptions,
  PluginSettings,
  ValidationRule
} from '../types';
import { ImporterProError } from '../utils/errors';
import { extOf } from '../utils/path';
import { PauseController } from '../core/pause-controller';
import { FilePickerFactory, pickOptionsForSource } from './platform';
import type { IFilePicker } from './platform/types';
import {
  autoMapColumns,
  ANY_COLUMN,
  applyWizardTransform,
  ColumnMapping,
  COMPUTE_ARITH_LABELS,
  COMPUTE_COMPARE_LABELS,
  COMPUTE_COND_LABELS,
  DerivedRuleId,
  MappingSetting,
  MappingType,
  countRowsAfterHeader,
  countRowsAfterSelection,
  DataTransformConfig,
  DERIVED_PRESETS,
  deriveFieldName,
  emptyTransform,
  formatCount,
  formatFileSize,
  formatTimeAgo,
  FORMAT_OP_LABELS,
  isPostscriptSetting,
  LINK_OP_LABELS,
  mappingSettingLabel,
  MAPPING_TYPE_LABELS,
  PROCESS_OP_LABELS,
  removeAutoMappings,
  resolvedHeader,
  rowFilterRuleLabel,
  ROW_FILTER_OP_LABELS,
  RowFilterRule,
  rowValidationBadge,
  settingParamSpec,
  unmappedColumns,
  upsertSegments,
  VALIDATION_TYPE_LABELS,
  validationRuleLabel
} from './wizard-data';
import type { ComputeCompareOp } from './wizard-data';
import { dryRunStats, type DryRunSummary } from './wizard-data';
import { TemplateEngine } from '../core/template/engine';

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

/* ── Step 2 会话条目（D66–D68：仅记录路径引用/句柄，不预加载内容；D81：外部文件 e2e） ── */
interface SessionEntry {
  id: string; // 去重键：Vault 内=相对路径；外部=绝对路径/移动端标识（去重含历史）
  file: FileInfo;
  vaultPath: string | null; // Vault 相对路径（可解析/导入）；null = 外部文件（携带 blob 句柄按需读取）
  selected: boolean;
}

/* ── Step 3 当前配置对象 ── */
interface Step3Target {
  vaultPath: string | null; // Vault 相对路径；null = 外部文件（解析经 file.blob，D81 起可端到端导入）
  label: string;
  isHistory: boolean;
  history?: ImportHistoryEntry;
  /** 数据源 FileInfo：Vault 内由 prepareParse 按 vaultPath 重建；外部文件沿用所选 FileInfo（含 blob 句柄） */
  file?: FileInfo;
}

export interface ImportModalDeps {
  service: ImportService;
  scanner: TemplateScanner;
  parsers: ParserRegistry;
  /** D98：Step 3 预览与 Step 4 导入统一走真实 renderPreprocess（模板引擎） */
  engine: TemplateEngine;
  settings: () => PluginSettings;
  save: (s: PluginSettings) => Promise<void>;
}

/** 导入向导（4 步，ui/layout.md 权威布局） */
export class ImportModal extends Modal {
  private step: Step = 1;
  private format = '';
  private picker: IFilePicker | null = null;

  // Step 2 状态（D66：会话+历史合并单列表）
  private session: SessionEntry[] = [];
  private selectedId: string | null = null;

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
  /** D123：上次解析的表头键（清洗+筛选后第一行列名 join，变化时自动补充映射） */
  private lastHeaderKey: string | null = null;
  private parsed: Record<string, unknown>[] = [];
  private parseError: string | null = null;
  private parsedInfo: FileInfo | null = null;
  private transform: DataTransformConfig = emptyTransform();
  /** D118：校验规则（区块 4「✅ 校验规则」卡；随 [💾 保存到模板] 写 frontmatter validation，预览/导入走真实校验语义） */
  private validation: ValidationRule[] = [];
  /** D94：输出位置及命名规则（区块 3，随模板保存；缺省取自设置/默认 `{{_hash}}`） */
  private outputFolder = '';
  private outputNoteName = '{{_hash}}';
  /** D121：输出策略（冲突/增量）与匹配优先级（区块 3，随 [💾 保存到模板] 写 frontmatter output/match） */
  private conflictStrategy: ConflictStrategy = 'overwrite';
  private incrementalMode: IncrementalMode = 'hash';
  private matchPriority = 0;
  /** D95：已回填配置的「模板+文件」键（Step3↔4 往返不重复回填，保留未保存编辑） */
  private s3ConfigKey: string | null = null;
  /** D117：展开「设置」面板的映射行下标集合（操作列 ⏵/⏷ 显隐；增删行后近似按新下标复位） */
  private mappingPanelsOpen = new Set<number>();
  /** D117/D119：待确认参数的「添加设置」草稿（下拉选中需参数步骤后显示；确认/取消即清空）。
   *  compute（算术/条件计算/条件警告）与 link（智能链接）各走专用草稿表单。 */
  private pendingSettingDraft:
    | { index: number; group: 'format' | 'process'; op: string }
    | { index: number; group: 'compute'; op: 'add' | 'subtract' | 'multiply' | 'divide' }
    | { index: number; group: 'compute'; op: 'condition' }
    | { index: number; group: 'compute'; op: 'warn' }
    | { index: number; group: 'link'; op: 'smartLink' }
    | null = null;

  // D91：Step 3 区块局部刷新——.ipw-body 容器持久，各区块仅重建自身内容（含滚动保持）
  // D94/D108 归类：template（模板元信息）/ rows（行配置）/ columns（列配置：格式化/处理/列映射·派生合并单表）
  private s3Body: HTMLElement | null = null;
  private s3Wrap: {
    template: HTMLElement | null;
    rows: HTMLElement | null;
    columns: HTMLElement | null;
  } = { template: null, rows: null, columns: null };
  /** footer「开始导入」按钮引用（Step 3 局部刷新后仅同步其启用态，不重建 footer，D91） */
  private footerNextBtn: HTMLButtonElement | null = null;

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
      this.footerNextBtn = next; // D91：局部刷新（如新建模板后）仅同步其禁用态，不重建 footer
      next.addEventListener('click', () => this.startImport());
      this.syncStep3Footer();
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
      else meta.createSpan({ cls: 'ipw-vault-path', text: '外部文件' });
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
      // 仅 Vault 内仍可访问的来源支持「直接导入/修改模板」；外部文件（句柄不跨会话）或原文件已删的历史仅保留记录
      const histFile = this.app.vault.getAbstractFileByPath(normalizePath(h.sourceFile));
      const importable = histFile instanceof TFile;
      if (!importable) {
        meta.createSpan({ cls: 'ipw-muted', text: '（外部文件/原文件不可用，请重新选择后导入）' });
      } else {
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
      }
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
      void this.render();
      return;
    }
    if (inHistory) {
      new Notice('该文件已在导入历史中，可直接「直接导入」或「修改模板」');
      void this.render();
      return;
    }

    // Vault 内文件映射为相对路径后不再携带 blob（解析走 Vault）；外部文件保留 blob 句柄（Step 3 按需解析）
    const entry: SessionEntry = {
      id,
      file: vaultPath ? { name: file.name, extension: file.extension, size: file.size, path: vaultPath } : file,
      vaultPath,
      selected: true
    };
    this.session.push(entry);
    this.selectedId = entry.id;
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
        return null; // Vault 外 → 外部文件（D81 起可端到端解析/导入，读取经 file.blob）
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
    } else {
      // 外部文件（D65/D66/D75 边界已解除，D81）：携带 blob 句柄进入 Step 3，可解析/预览并完成导入
      this.step3 = { vaultPath: null, file: sel.file, label: sel.file.name, isHistory: false };
    }
    this.step = 3;
    void this.render();
  }

  /** 来源标注：Vault 内=相对路径；外部=绝对路径（移动端无路径时回落文件名），供历史记录/日志使用 */
  private sourceLabelFor(t: Step3Target): string {
    if (t.vaultPath) return t.vaultPath;
    return t.file?.path || t.label;
  }

  /* ── Step 3：模板配置（区块 5 列映射·派生合并后共 6 区块，D108，ui/layout.md §5） ── */

  /** 进入 Step 3（步骤跳转，属页面结构切换，可全量渲染）：记录 body 容器并构建区块内容 */
  private async renderStep3(el: HTMLElement): Promise<void> {
    if (!this.step3) {
      el.createDiv({ cls: 'ipw-banner', text: '请先在 Step 2 选择一个可导入的文件。' });
      return;
    }
    // D91：.ipw-body 在整个 Step 3 内保持 DOM 身份不变，后续仅刷新其内部区块
    this.s3Body = el;
    await this.prepareParse(); // 解析当前文件（含表单/行数/列；Vault 内按路径读取，外部经 blob 句柄）
    await this.loadTemplates();
    // D95/D98：模板配置回填（覆盖默认值），模板即配置源；仅在首次进入/切换模板时回填，
    // Step3↔4 往返（⬅ 返回修改）保留未保存的编辑不重复回填。
    const cfgKey = `${this.templateId}::${this.step3.vaultPath ?? this.step3.label}`;
    if (this.s3ConfigKey !== cfgKey) {
      await this.applySelectedTemplateConfig();
      this.s3ConfigKey = cfgKey;
    }
    this.renderStep3Content();
    this.syncStep3Footer();
  }

  /**
   * D95/D98：把所选模板持久化的 Step 3 配置回填各区块（输出位置/命名、行/列/派生配置）。
   * 未选模板（空模板目录）时回落到设置默认输出目录。返回是否有模板配置被应用。
   */
  private async applySelectedTemplateConfig(): Promise<boolean> {
    if (!this.templateId) {
      this.outputFolder = this.deps.settings().paths.outputFolder ?? '';
      this.outputNoteName = '{{_hash}}';
      this.conflictStrategy = this.deps.settings().conflictStrategy;
      this.incrementalMode = this.deps.settings().incrementalMode;
      this.matchPriority = 0;
      this.validation = [];
      return false;
    }
    const snap = await this.deps.scanner.readTemplateConfig(this.templateId);
    if (!snap) return false;
    this.outputFolder = snap.outputFolder ?? '';
    this.outputNoteName = snap.outputNoteName || '{{_hash}}';
    // D121：输出策略/匹配优先级回填（读模板 frontmatter）
    this.conflictStrategy = snap.conflictStrategy || this.deps.settings().conflictStrategy || 'overwrite';
    this.incrementalMode = snap.incrementalMode || this.deps.settings().incrementalMode || 'hash';
    this.matchPriority = snap.matchPriority || 0;
    // D118：校验规则回填（模板 frontmatter validation）
    this.validation = Array.isArray(snap.validation) ? snap.validation : [];
    this.transform = snap.transform;
    return true;
  }

  /** 渲染 Step 3 body 全部区块内容（D91：仅重绘 .ipw-body 内部，header/footer/容器身份不变） */
  private renderStep3Content(): void {
    const el = this.s3Body;
    if (!el || !this.step3) return;
    el.empty();

    // 区块 1：文件信息条
    const info = el.createDiv({ cls: 'ipw-block ipw-file-bar' });
    const fname = this.parsedInfo?.name ?? this.step3.label;
    const rows = this.parsed.length;
    const sheetsTxt = this.sheetNames.length > 1 ? ` · ${this.sheetNames.length} 个工作表` : '';
    info.setText(`📄 ${fname} · ${formatCount(rows)} 行${sheetsTxt}`);

    if (this.parseError) {
      el.createDiv({ cls: 'ipw-banner is-error', text: this.parseError });
      this.resetStep3Wrap();
      return;
    }
    if (rows === 0) {
      // D86：0 行且无解析错误不再一刀切「返回重新选择」。
      // 表格类数据源（Excel/CSV）仍渲染表单选择引导切换表单；确无可解析内容时才提示返回重新选择。
      if (this.isTableSource()) {
        el.createDiv({
          cls: 'ipw-banner',
          text: '未解析到数据行：工作表可能为空，请切换表单；若确认无内容请返回重新选择文件。'
        });
        if (this.sheetNames.length > 1) {
          this.renderSheetBlock(el);
          el.createDiv({ cls: 'ipw-sep' });
        }
      } else {
        el.createDiv({ cls: 'ipw-banner', text: '未解析到数据行，请返回重新选择文件。' });
      }
      this.resetStep3Wrap();
      return;
    }

    el.createDiv({ cls: 'ipw-sep' });

    // 区块 2：数据表单选择（多 Sheet 时显示）
    if (this.sheetNames.length > 1) {
      this.renderSheetBlock(el);
      el.createDiv({ cls: 'ipw-sep' });
    }

    // 区块 3：模板元信息（模板级：名称/匹配规则/输出位置及命名/模板操作，D94）
    this.renderTemplateBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 4：行配置（行级：行清洗（空行·重复表头）/ 行筛选 / 校验，D94/D96/D122/D123/D124）
    this.renderRowsBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 5：列配置（列级：列格式化 / 列处理 / 列映射·派生合并单表，D94/D108）
    this.renderColumnsBlock(el);
    el.createDiv({ cls: 'ipw-sep' });

    // 区块 6：预览（结果；真实 Handlebars 渲染，D98）
    this.renderPreviewBlock(el);

    // D123：记录当前表头键（清洗+筛选后第一行列名），行配置变更时据此检测表头变化
    this.lastHeaderKey = this.isTableSource() ? resolvedHeader(this.parsed, this.transform).join('|') : '';
  }

  /** 区块全量重建后清理失效的局部引用（仅解析失败/0 行等无完整区块的状态） */
  private resetStep3Wrap(): void {
    this.s3Wrap.template = null;
    this.s3Wrap.rows = null;
    this.s3Wrap.columns = null;
    this.previewEl = null;
  }

  /** 是否处于 Step 3 且 body 仍挂载（向导关闭/切走后跳过刷新） */
  private isStep3Live(): boolean {
    return this.step === 3 && !!this.s3Body && this.s3Body.isConnected;
  }

  /**
   * D91 L2 区块内刷新：重建指定区块容器内容（renderXxxBlock 会重建该区块并更新 s3Wrap 引用），
   * 再按需刷新预览；全程保持 .ipw-body 滚动位置，不回顶、不闪烁。
   */
  private refreshStep3Blocks(kinds: Array<'template' | 'rows' | 'columns'>, withPreview = true): void {
    if (!this.isStep3Live()) return;
    const body = this.s3Body!;
    const top = body.scrollTop;
    for (const kind of kinds) this.rerenderStep3Block(kind);
    if (withPreview) this.refreshPreviewOnly();
    body.scrollTop = top;
  }

  private rerenderStep3Block(kind: 'template' | 'rows' | 'columns'): void {
    const body = this.s3Body;
    const old = this.s3Wrap[kind];
    if (!body || !old || !old.isConnected) return;
    const anchor = old.nextSibling; // 区块后的分隔线/下一区块，用于原位放回
    old.remove();
    this.buildStep3Block(kind);
    const fresh = this.s3Wrap[kind];
    if (fresh) {
      if (anchor && anchor.parentNode === body) body.insertBefore(fresh, anchor);
      else body.appendChild(fresh);
    }
  }

  private buildStep3Block(kind: 'template' | 'rows' | 'columns'): void {
    const body = this.s3Body;
    if (!body) return;
    switch (kind) {
      case 'template':
        this.renderTemplateBlock(body);
        break;
      case 'rows':
        this.renderRowsBlock(body);
        break;
      case 'columns':
        this.renderColumnsBlock(body);
        break;
    }
  }

  /**
   * D91 L3 数据源级刷新：重解析后按依赖链重建 Step 3 body 内容
   * （表单/表头行/文件等变更；列集合可能变化，映射→派生→预览均受影响）。
   * 保留 .ipw-body 身份与滚动位置。
   */
  private async rerenderStep3(): Promise<void> {
    if (!this.isStep3Live()) return;
    const body = this.s3Body!;
    const top = body.scrollTop;
    await this.prepareParse();
    await this.loadTemplates();
    this.renderStep3Content();
    body.scrollTop = top;
    this.syncStep3Footer();
  }

  /** footer「开始导入」启用态同步（D91：局部刷新后不重建 footer，仅更新按钮态） */
  private syncStep3Footer(): void {
    if (!this.footerNextBtn) return;
    const blocked = !this.templateId || !this.step3 || this.parseError !== null || this.parsed.length === 0;
    this.footerNextBtn.disabled = blocked;
  }

  /**
   * 列名（D123）：表格类 = 行清洗+行筛选后剩余第一行提升的表头（最终列名，供列映射/校验/笔记条件）；
   * 非表格类 = 解析后的键名。无剩余行时回落解析键（占位列名）。
   */
  private columns(): string[] {
    if (this.isTableSource()) {
      const h = resolvedHeader(this.parsed, this.transform);
      if (h.length > 0) return h;
    }
    const seen = new Set<string>();
    for (const r of this.parsed.slice(0, 20)) for (const k of Object.keys(r)) if (!k.startsWith('_')) seen.add(k);
    return Array.from(seen);
  }

  /** 行筛选列下拉选项（D123：表格类按占位列名 `列1..N` 匹配——表头确定前的列位置引用） */
  private filterColumns(): string[] {
    if (this.isTableSource()) {
      const seen = new Set<string>();
      for (const r of this.parsed.slice(0, 20)) for (const k of Object.keys(r)) if (!k.startsWith('_')) seen.add(k);
      return Array.from(seen);
    }
    return this.columns();
  }

  private async prepareParse(): Promise<void> {
    const t = this.step3;
    if (!t) return;
    this.parseError = null;
    const resetFail = (msg: string): void => {
      this.parseError = msg;
      this.parsed = [];
      this.parsedInfo = null;
      this.sheetNames = [];
      this.sheetName = '';
    };

    // 数据源 FileInfo：Vault 内按路径重建（读取走 Vault）；外部文件沿用所选 FileInfo（携带 blob 句柄，按需读取）
    let info: FileInfo | null = null;
    if (t.vaultPath) {
      const file = this.app.vault.getAbstractFileByPath(t.vaultPath);
      if (!(file instanceof TFile)) {
        resetFail('IO_002 文件读取失败：原文件不可访问，请返回重新选择。');
        return;
      }
      info = { path: file.path, name: file.name, extension: extOf(file.path), size: file.stat.size };
    } else if (t.file) {
      if (!t.file.blob) {
        resetFail('IO_002 文件读取失败：外部文件句柄不可用，请返回 Step 2 重新选择该文件。');
        return;
      }
      info = t.file;
    } else {
      resetFail('IO_002 文件读取失败：缺少可读取的数据源，请返回重新选择。');
      return;
    }
    this.parsedInfo = info;
    if (!info) return; // 防御：确保数据源非空后进入解析

    try {
      const parser = this.deps.parsers.getForFile(info);
      // 表单枚举（仅 Excel 提供，ui/layout.md §5.3）
      // ⚠ 必须成员调用保留 this：getSheetNames 内部访问 this.ctx；若先解构成局部函数再调用
      // （getSheets(info)）会丢 this → 抛 TypeError「Cannot read properties of undefined (reading 'ctx')」，
      // 即外部 Excel 第三步误报 IO_002 的根因。
      const withSheets = parser as unknown as { getSheetNames?: (f: FileInfo) => Promise<string[]> };
      this.sheetNames = typeof withSheets.getSheetNames === 'function' ? await withSheets.getSheetNames(info) : [];
      // D86：无条件校验 sheetName 属于当前文件表单（与表单数无关、切换文件即生效），
      // 否则旧表名残留 → sheet_to_json 对不存在 sheet 静默返回 [] → 误报「未解析到数据行」。
      if (this.sheetNames.length === 0) {
        this.sheetName = '';
      } else if (!this.sheetNames.includes(this.sheetName)) {
        this.sheetName = this.sheetNames[0];
      }
      if (this.importAllSheets && this.sheetNames.length > 1) {
        const all: Record<string, unknown>[] = [];
        for (const sn of this.sheetNames) {
          const rows = await parser.parse(info, this.parseOptionsFor(info, sn));
          for (const r of rows) all.push({ ...r, _sheet: sn });
        }
        this.parsed = all;
      } else {
        this.parsed = await parser.parse(info, this.parseOptionsFor(info));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // 错误分类：仅原生异常（blob/Vault 读取的 DOMException/TypeError 等）标 IO_002「文件读取失败」；
      // ImporterProError 保留其真实错误码（如 PARSE_001 不支持格式），避免把解析/格式问题误报为读取失败误导定位。
      if (e instanceof ImporterProError) {
        this.parseError = `${e.code} ${e.message}`;
      } else {
        this.parseError = `IO_002 文件读取失败：${msg}`;
      }
      this.parsed = [];
    }
  }

  /** 表格类数据源（Excel/CSV；D123 向导链路按 rawRows 解析、表头由清洗+筛选后第一行提升） */
  private isTableSource(info?: FileInfo | null): boolean {
    const f = info ?? this.parsedInfo;
    const ext = f ? (f.extension || extOf(f.path)).toLowerCase() : '';
    return ext === 'xlsx' || ext === 'xls' || ext === 'csv' || ext === 'tsv';
  }

  /** 当前 Step 3 的解析选项：sheetName + 表格类原始行模式（D123，占位列名 `列1..N`） */
  private parseOptionsFor(info: FileInfo, sheetName?: string): ParseOptions {
    const opts: ParseOptions = { sheetName: sheetName ?? (this.sheetName || undefined) };
    if (this.isTableSource(info)) opts.rawRows = true;
    return opts;
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
      void this.rerenderStep3(); // L3：重解析 + 按依赖链刷新（D91）
    });
    row.createSpan({ cls: 'ipw-muted', text: `行数: ${formatCount(this.parsed.length)}  列数: ${this.columns().length}` });

    const checkbox = wrap.createDiv({ cls: 'ipw-form-row' });
    const cb = checkbox.createEl('input', { type: 'checkbox' });
    cb.checked = this.importAllSheets;
    checkbox.createSpan({ text: ' 同时导入所有表单 (每个表单独立配置模板)' });
    cb.addEventListener('change', () => {
      this.importAllSheets = cb.checked;
      void this.rerenderStep3(); // L3（D91）
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

  /** 区块 3：模板元信息（模板级，D94）：名称 / 匹配规则与测试 / 输出位置及命名规则（含实时示例）/ 模板操作行 */
  private renderTemplateBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    this.s3Wrap.template = wrap; // D91：记录区块容器，供 L2 局部刷新原位重建
    wrap.createEl('h5', { text: '📋 模板元信息' });

    // 空态（D92）：无模板不再阻断——引导直接新建，创建后自动选中，无需重开向导
    if (this.templates.length === 0) {
      wrap.createDiv({ cls: 'ipw-banner', text: '未在模板目录发现模板，可直接新建（按当前文件名/列名生成骨架）。' });
      const row = wrap.createDiv({ cls: 'ipw-form-row' });
      const create = row.createEl('button', { cls: 'ipw-btn ipw-primary', text: '➕ 新建模板' });
      create.addEventListener('click', () => void this.handleCreateTemplate());
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
      void this.applyTemplateConfigAndRender();
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
      status.setText(ok ? '✅ 匹配当前文件' : '❌ 未匹配');
      status.removeClass('is-ok', 'is-error');
      status.addClass(ok ? 'is-ok' : 'is-error');
    });

    // D121：匹配优先级（数字，越大越优先；自动匹配/模板选择按优先级降序 + 先匹配先得）
    const row2b = wrap.createDiv({ cls: 'ipw-form-row' });
    row2b.createSpan({ cls: 'ipw-label', text: '优先级:' });
    const prioInput = row2b.createEl('input', { cls: 'ipw-input ipw-prio-input', type: 'number', value: `${this.matchPriority}` });
    prioInput.addEventListener('change', () => {
      const n = Math.max(0, Math.trunc(Number(prioInput.value)) || 0);
      this.matchPriority = n;
      prioInput.value = `${n}`;
    });
    row2b.createSpan({ cls: 'ipw-muted', text: '越大越优先（同命中率时先匹配先得）' });

    wrap.createDiv({ cls: 'ipw-sub ipw-sec-label', text: '📂 输出位置及命名规则（随模板保存）' });

    // 输出文件夹（Handlebars 表达式）
    const row3 = wrap.createDiv({ cls: 'ipw-form-row' });
    row3.createSpan({ cls: 'ipw-label', text: '输出文件夹:' });
    const folderInput = row3.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '如 人员档案 或 {{_folder}}（空 = Vault 根）' });
    folderInput.value = this.outputFolder;
    folderInput.addEventListener('input', () => {
      this.outputFolder = folderInput.value;
      this.renderOutputExample(outExample);
    });

    // 文件命名（Handlebars 表达式，实时示例）
    const row4 = wrap.createDiv({ cls: 'ipw-form-row' });
    row4.createSpan({ cls: 'ipw-label', text: '文件命名:' });
    const nameExpr = row4.createEl('input', {
      cls: 'ipw-input',
      type: 'text',
      placeholder: '{{_hash}}{{#if 姓名}}_{{姓名}}{{/if}}'
    });
    nameExpr.value = this.outputNoteName;
    nameExpr.addEventListener('input', () => {
      this.outputNoteName = nameExpr.value;
      this.renderOutputExample(outExample);
    });

    // D121：输出策略（冲突策略 / 增量模式，写 frontmatter output.conflict_strategy / incremental_mode）
    const row5 = wrap.createDiv({ cls: 'ipw-form-row' });
    row5.createSpan({ cls: 'ipw-label', text: '冲突策略:' });
    const conflictSel = row5.createEl('select', { cls: 'ipw-select' });
    for (const [v, l] of [
      ['overwrite', '覆盖'],
      ['append', '追加'],
      ['skip', '跳过'],
      ['rename', '重命名'],
      ['merge', '合并']
    ] as const) {
      conflictSel.createEl('option', { value: v, text: l });
    }
    conflictSel.value = this.conflictStrategy;
    conflictSel.addEventListener('change', () => {
      this.conflictStrategy = conflictSel.value as ConflictStrategy;
    });
    row5.createSpan({ cls: 'ipw-label ipw-label-gap', text: '增量模式:' });
    const incrSel = row5.createEl('select', { cls: 'ipw-select' });
    for (const [v, l] of [
      ['hash', '哈希'],
      ['timestamp', '时间戳']
    ] as const) {
      incrSel.createEl('option', { value: v, text: l });
    }
    incrSel.value = this.incrementalMode;
    incrSel.addEventListener('change', () => {
      this.incrementalMode = incrSel.value as IncrementalMode;
    });

    const outExample = wrap.createDiv({ cls: 'ipw-output-example ipw-muted' });

    // 模板操作行（D92 迁移，D94）：编辑模板代码 / 新建模板 / 保存到模板
    const ops = wrap.createDiv({ cls: 'ipw-form-row ipw-template-ops' });
    const bEdit = ops.createEl('button', { cls: 'ipw-link', text: '📝 编辑模板代码' });
    bEdit.addEventListener('click', () => void this.handleEditTemplate());
    const bNew = ops.createEl('button', { cls: 'ipw-link', text: '➕ 新建模板' });
    bNew.addEventListener('click', () => void this.handleCreateTemplate());
    const bSave = ops.createEl('button', { cls: 'ipw-btn ipw-primary ipw-save-btn', text: '💾 保存到模板' });
    bSave.disabled = !this.templateId;
    bSave.addEventListener('click', () => void this.handleSaveTemplate());

    this.renderOutputExample(outExample); // 初始示例（取预览首行数据）
  }

  /** 模板下拉切换：载入所选模板元信息 + 持久化配置回填（D95），随后整体重建 Step 3 内容 */
  private async applyTemplateConfigAndRender(): Promise<void> {
    if (!this.isStep3Live()) return;
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
    const body = this.s3Body!;
    const top = body.scrollTop;
    await this.applySelectedTemplateConfig();
    this.s3ConfigKey = `${this.templateId}::${this.step3?.vaultPath ?? this.step3?.label ?? ''}`;
    this.renderStep3Content();
    body.scrollTop = top;
    this.syncStep3Footer();
  }

  /** 输出位置及命名规则实时示例（取预览首行数据渲染完整相对路径，D94） */
  private renderOutputExample(target: HTMLElement): void {
    if (!target) return;
    target.empty();
    const folder = this.outputFolder.trim();
    const expr = this.outputNoteName.trim() || '{{_hash}}';
    // 取预览首行（如有）作为示例数据源，渲染 folder/note_name 表达式
    const row = this.parsed[0];
    const folderText = folder ? this.renderNameExpr(folder, row, '') : '';
    const nameText = this.renderNameExpr(expr, row, 'e10adc39');
    const illegal = /[\\/:*?"<>|]/.test(nameText);
    const full = folderText ? `${folderText}/${nameText}` : nameText;
    const span = target.createSpan({ cls: `ipw-example-path${illegal ? ' is-error' : ''}` });
    span.setText(`示例: ${full}.md  ${illegal ? '⚠ 含非法字符' : '✅ 合法'}`);
  }

  /** 用示例数据渲染单条 Handlebars 命名表达式（失败回落占位） */
  private renderNameExpr(expr: string, row: DataRecord | undefined, fallback: string): string {
    try {
      const ctx: Record<string, any> = { ...(row ?? {}), _hash: 'e10adc39', _folder: this.outputFolder };
      // 使用引擎真实渲染与 Step 4 同路径；引擎同步 compile 即可（无 await 需求）
      const out = this.deps.engine.handlebars.compile(expr, { noEscape: true })(ctx);
      const s = String(out ?? '').trim();
      return s === '' ? fallback : s;
    } catch {
      return fallback;
    }
  }

  /** 📝 编辑模板代码：打开所选模板文件（无模板时提示先新建） */
  private async handleEditTemplate(): Promise<void> {
    if (!this.templateId) {
      new Notice('当前无模板，请先点击「➕ 新建模板」');
      return;
    }
    const parsed = this.deps.scanner.getParsed(this.templateId);
    const file = parsed ? this.app.vault.getAbstractFileByPath(parsed.info.path) : null;
    if (file instanceof TFile) await this.app.workspace.getLeaf().openFile(file);
    else new Notice('模板文件不存在');
  }

  /** 当前 Step 3 全部配置 → 模板配置快照（D95/D98） */
  private buildSnapshot(): import('./wizard-data').Step3TemplateSnapshot {
    return {
      name: this.templateName,
      matchType: this.matchType,
      matchPattern: this.matchPattern,
      // D121：输出策略/匹配优先级随快照保存（写 frontmatter output/match）
      matchPriority: this.matchPriority || 0,
      outputFolder: this.outputFolder,
      outputNoteName: this.outputNoteName,
      conflictStrategy: this.conflictStrategy,
      incrementalMode: this.incrementalMode,
      // D118：校验规则随快照保存（写 frontmatter validation）
      validation: this.validation,
      transform: this.transform
    };
  }

  /** 💾 保存到模板：编译为 preprocess 标记段写回所选模板（模板即配置源，D95/D98） */
  private async handleSaveTemplate(): Promise<void> {
    if (!this.templateId) {
      new Notice('请先选择或新建一个模板再保存');
      return;
    }
    const btn = this.s3Body?.querySelector('.ipw-save-btn') as HTMLButtonElement | null;
    if (btn) btn.disabled = true;
    try {
      await this.deps.scanner.saveTemplateConfig(this.templateId, this.buildSnapshot());
      new Notice(`✅ 已把 Step 3 配置保存到模板「${this.templateNameOf(this.templateId)}」`);
    } catch (e) {
      const text =
        e instanceof ImporterProError ? `${e.code} ${e.message}` : `保存模板配置失败：${e instanceof Error ? e.message : String(e)}`;
      new Notice(`❌ ${text}`);
    } finally {
      if (btn && this.s3Body?.isConnected) btn.disabled = false;
    }
  }

  /** D92：按当前已配置选项创建模板（名称/匹配规则留空则按当前文件自动生成），创建后自动选中 */
  private async handleCreateTemplate(): Promise<void> {
    if (!this.isStep3Live() || !this.step3) return;
    const name = (this.templateName || '').trim() || this.defaultTemplateName();
    let matchType: 'regex' | 'glob' | 'exact' = this.matchType;
    let matchPattern = (this.matchPattern || '').trim();
    if (!matchPattern) {
      const d = this.defaultMatchRule();
      matchType = d.type;
      matchPattern = d.pattern;
    }
    try {
      const created = await this.deps.scanner.createTemplate({
        name,
        matchType,
        matchPattern,
        columns: this.columns()
      });
      this.templateId = created.id;
      this.templateName = created.name;
      this.matchType = matchType;
      this.matchPattern = matchPattern;
      const body = this.s3Body!;
      const top = body.scrollTop;
      await this.loadTemplates();
      this.s3ConfigKey = `${this.templateId}::${this.step3?.vaultPath ?? this.step3?.label ?? ''}`;
      this.renderStep3Content(); // 空态 → 完整区块（自动选中新模板）；新建不覆盖当前已配置内容
      body.scrollTop = top;
      this.syncStep3Footer();
      new Notice(`✅ 已创建模板「${created.name}」并自动选中，可直接开始导入`);
    } catch (e) {
      const text =
        e instanceof ImporterProError ? `${e.code} ${e.message}` : `创建模板失败：${e instanceof Error ? e.message : String(e)}`;
      new Notice(text);
    }
  }

  private defaultTemplateName(): string {
    const base = basenameOf(this.step3?.label ?? '');
    return base.replace(/\.[^.]+$/, '') || base || '新模板';
  }

  private defaultMatchRule(): { type: 'glob'; pattern: string } {
    const ext = (this.parsedInfo?.extension || extOf(this.parsedInfo?.path ?? '')).toLowerCase().replace(/^\./, '');
    return { type: 'glob', pattern: ext ? `*.${ext}` : '*' };
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

  /** 区块 4：行配置（行级，D94/D122/D123/D124）：行清洗（空行·重复表头）/ 行筛选 / 校验规则 */
  private renderRowsBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    this.s3Wrap.rows = wrap; // D91：记录区块容器，供 L2 局部刷新原位重建
    wrap.createEl('h5', { text: '🔀 行配置（行级预处理）' });
    const cols = this.columns();
    const filterCols = this.filterColumns();

    // ── 行清洗（D124：表格类 rawRows 顺序 = 过滤空行 → 行筛选 → 过滤重复表头[基准=筛选后首行]；
    //    非表格 = 过滤重复表头[值==列名] + 过滤空行一次完成；跨行引擎开关，不产编译段） ──
    const cleanCard = wrap.createDiv({ cls: 'ipw-card' });
    cleanCard.createDiv({ cls: 'ipw-card-title', text: '🧹 行清洗（空行 / 重复表头）' });
    const cleanCfg = this.transform.clean ?? (this.transform.clean = {});
    const toggleRow = cleanCard.createDiv({ cls: 'ipw-form-row ipw-checks' });

    const emptyCb = toggleRow.createEl('input', { type: 'checkbox' });
    emptyCb.checked = cleanCfg.removeEmpty === true;
    toggleRow.createSpan({ text: '过滤空行（含第一行）' });
    emptyCb.addEventListener('change', () => {
      cleanCfg.removeEmpty = emptyCb.checked || undefined;
      this.onRowConfigChanged(); // D124：空行先行（表格类表头/列名随清洗+筛选+重复表头后变化）
    });

    const dupCb = toggleRow.createEl('input', { type: 'checkbox' });
    dupCb.checked = cleanCfg.removeDuplicateHeader === true;
    toggleRow.createSpan({ text: '过滤重复表头行' });
    dupCb.addEventListener('change', () => {
      cleanCfg.removeDuplicateHeader = dupCb.checked || undefined;
      this.onRowConfigChanged(); // D124：表格类在行筛选后以筛选后首行为基准过滤重复表头
    });

    cleanCard.createDiv({
      cls: 'ipw-muted ipw-note',
      text: this.isTableSource()
        ? 'ⓘ 表头（列名）= 过滤空行 + 行筛选后剩余的第一行（其值成为列名，空值回落 列N）；「过滤重复表头行」在行筛选之后执行，以该将成为表头的行为基准删除其后逐值相同的行。'
        : 'ⓘ 表头已解析为列名；「过滤重复表头行」（值与列名完全相同）与「过滤空行」在行筛选前执行。'
    });

    // ── 行筛选（D96：Excel 式包含式，列下拉含「任意列」；D123 表格类按列位置（列1..N）匹配） ──
    let filterListBox: HTMLElement | null = null;
    const filterCard = wrap.createDiv({ cls: 'ipw-card' });
    filterCard.createDiv({ cls: 'ipw-card-title', text: '🔍 行筛选（保留全部规则均匹配的行）' });
    if (this.isTableSource()) {
      filterCard.createDiv({
        cls: 'ipw-muted ipw-note',
        text: 'ⓘ 表头由清洗+筛选后的第一行决定，筛选按列位置匹配（列1 / 列2 / …；任意列不受影响）。'
      });
    }
    const filterRow = filterCard.createDiv({ cls: 'ipw-form-row' });
    const fCol = filterRow.createEl('select', { cls: 'ipw-select' });
    fCol.createEl('option', { value: ANY_COLUMN, text: '任意列' });
    for (const c of filterCols) fCol.createEl('option', { value: c, text: c });
    const fOp = filterRow.createEl('select', { cls: 'ipw-select' });
    for (const o of ROW_FILTER_OP_LABELS) fOp.createEl('option', { value: o.value, text: o.label });
    const fVal = filterRow.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '比较值（为空/非空无需值）' });
    const syncValueVis = (): void => {
      const hide = fOp.value === 'empty' || fOp.value === 'notEmpty';
      fVal.style.display = hide ? 'none' : '';
      fVal.placeholder = fOp.value === 'regex' ? '正则表达式（大小写敏感）' : '比较值';
    };
    syncValueVis();
    fOp.addEventListener('change', syncValueVis);
    const fAdd = filterRow.createEl('button', { cls: 'ipw-mini', text: '➕ 添加' });
    fAdd.addEventListener('click', () => {
      if (!fCol.value || !fOp.value) return;
      if (fOp.value !== 'empty' && fOp.value !== 'notEmpty' && fVal.value.trim() === '') {
        new Notice('请输入比较值');
        return;
      }
      this.transform.filters.push({ column: fCol.value, op: fOp.value as RowFilterRule['op'], value: fVal.value.trim() });
      fVal.value = '';
      if (filterListBox) this.renderFilterList(filterListBox);
      this.onRowConfigChanged(); // D123：筛选结果影响表头
    });
    filterListBox = filterCard.createDiv({ cls: 'ipw-filter-list-box' });
    this.renderFilterList(filterListBox);

    // ── 校验规则（D118：字段 + 类型(Validator 内置 8 种) + 消息 + length/range 参数；写 frontmatter validation） ──
    const validCard = wrap.createDiv({ cls: 'ipw-card' });
    validCard.createDiv({ cls: 'ipw-card-title', text: '✅ 校验规则（随模板保存，预览行首显示状态徽标）' });
    const vRow = validCard.createDiv({ cls: 'ipw-form-row' });
    const vField = vRow.createEl('select', { cls: 'ipw-select' });
    vField.createEl('option', { value: '', text: '(选择字段)' });
    for (const c of cols) vField.createEl('option', { value: c, text: c });
    const vType = vRow.createEl('select', { cls: 'ipw-select' });
    for (const o of VALIDATION_TYPE_LABELS) vType.createEl('option', { value: o.value, text: o.label });
    const vMsg = vRow.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '消息（可空，默认按类型）' });
    const vMin = vRow.createEl('input', { cls: 'ipw-input ipw-param-input', type: 'number', value: '', attr: { placeholder: 'min' } });
    const vMax = vRow.createEl('input', { cls: 'ipw-input ipw-param-input', type: 'number', value: '', attr: { placeholder: 'max' } });
    const syncParamVis = (): void => {
      const need = vType.value === 'length' || vType.value === 'range';
      vMin.style.display = need ? '' : 'none';
      vMax.style.display = need ? '' : 'none';
    };
    syncParamVis();
    vType.addEventListener('change', syncParamVis);
    const vAdd = vRow.createEl('button', { cls: 'ipw-mini ipw-primary', text: '➕ 添加' });
    vAdd.addEventListener('click', () => {
      const field = vField.value;
      const type = vType.value;
      if (!field || !type) {
        new Notice('请选择校验字段与规则类型');
        return;
      }
      const rule: ValidationRule = { field, type, message: vMsg.value.trim(), options: undefined };
      if (type === 'length' || type === 'range') {
        const min = vMin.value.trim();
        const max = vMax.value.trim();
        if (min === '' && max === '') {
          new Notice('length/range 需填写 min 或 max');
          return;
        }
        rule.options = {};
        if (min !== '') rule.options.min = Number(min);
        if (max !== '') rule.options.max = Number(max);
      }
      this.validation = [...this.validation, rule];
      vField.value = '';
      vMsg.value = '';
      vMin.value = '';
      vMax.value = '';
      if (validationListBox) this.renderValidationList(validationListBox);
      this.refreshPreviewOnly(); // D91 L1（预览行首徽标即时更新）
    });
    if (cols.length === 0) vField.value = '';
    const validationListBox = validCard.createDiv({ cls: 'ipw-validation-list-box' });
    this.renderValidationList(validationListBox);
  }

  /** D118：仅重建「校验规则已配置」列表（不整块重建、不重置顶部控件） */
  private renderValidationList(container: HTMLElement): void {
    container.empty();
    const rules = this.validation;
    if (rules.length > 0) {
      container.createDiv({ cls: 'ipw-muted', text: '已配置:' });
      const list = container.createDiv({ cls: 'ipw-rule-list' });
      rules.forEach((r, i) => {
        const row = list.createDiv({ cls: 'ipw-rule-row' });
        row.createSpan({ cls: 'ipw-rule-text', text: `• ${validationRuleLabel(r)}` });
        if (r.type === 'unique') row.createSpan({ cls: 'ipw-rule-tag', text: '批次级唯一' });
        const del = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕' });
        del.addEventListener('click', () => {
          const next = [...this.validation];
          next.splice(i, 1);
          this.validation = next;
          this.renderValidationList(container);
          this.refreshPreviewOnly();
        });
      });
    } else {
      container.createDiv({ cls: 'ipw-muted ipw-note', text: '已配置: (无)——规则类型: 必填 / 身份证 / 邮箱 / 手机号 / 日期 / 长度 / 数值范围 / 唯一(批次级)' });
    }
  }

  /**
   * D124：预览/统计的「数据行数」——与真实执行同序（空行 → 行筛选 → 重复表头[基准=筛选后首行]），
   * 表格类再扣除被提升为表头的第一行（该行不产笔记）。
   */
  private dataRowCount(): number {
    if (this.isTableSource()) return countRowsAfterHeader(this.parsed, this.transform);
    return countRowsAfterSelection(this.parsed, this.transform);
  }

  /** D91/D96：仅重建「行筛选已配置」列表 + 统计行（不整块重建、不重置顶部控件） */
  private renderFilterList(container: HTMLElement): void {
    container.empty();
    const rules = this.transform.filters;
    if (rules.length > 0) {
      container.createDiv({ cls: 'ipw-muted', text: '已配置:' });
      const list = container.createDiv({ cls: 'ipw-rule-list' });
      rules.forEach((r, i) => {
        const row = list.createDiv({ cls: 'ipw-rule-row' });
        row.createSpan({ cls: 'ipw-rule-text', text: `• ${rowFilterRuleLabel(r)}` });
        const del = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕' });
        del.addEventListener('click', () => {
          const next = [...rules];
          next.splice(i, 1);
          this.transform.filters = next;
          this.renderFilterList(container);
          this.onRowConfigChanged(); // D123：筛选结果影响表头
        });
      });
    } else {
      container.createDiv({ cls: 'ipw-muted ipw-note', text: '已配置: (无)' });
    }
    // 统计行：行清洗（空行→重复表头，D124 顺序）+ 行筛选后的数据行数（表格类扣除表头行）
    const kept = this.dataRowCount();
    const stat = container.createDiv({ cls: 'ipw-muted ipw-note' });
    stat.setText(`保留「全部规则均匹配」的行（AND），筛选后 ${formatCount(kept)} / ${formatCount(this.parsed.length)} 行`);
  }

  /**
   * 区块 5：列映射（列级，D105/D108/D113 收敛，D117 统一管线 UI）：单一「列映射」表（映射与派生合并；
   * 「类型」= FrontMatter 类型；「添加设置」下拉 = 列格式化 / 列处理 / 列派生；行下设置面板可编辑/显隐。
   * 不再有独立列格式化/列处理卡；旧模板 column-format/column-process 段读取时折叠为行设置链）。
   */
  private renderColumnsBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    this.s3Wrap.columns = wrap; // D91：记录区块容器，供 L2 局部刷新原位重建
    wrap.createEl('h5', { text: '⚙️ 列映射（映射 / 派生 / 类型 + 输出到 + 添加设置链 + 多笔记）' });
    const cols = this.columns();

    const mapCard = wrap.createDiv({ cls: 'ipw-card' });
    mapCard.createDiv({
      cls: 'ipw-card-title',
      text: '📋 列映射与派生（「类型」= FrontMatter 类型；「输出到」= 字段归属笔记，D120；「添加设置」= 格式化/处理/派生/计算/链接）'
    });
    this.renderMappingCard(mapCard, cols);

    // D120：区块 5 底部「📑 笔记类型」面板（多笔记输出配置）
    this.renderNoteTypesPanel(wrap);
  }

  /**
   * D123：行清洗 / 行筛选配置变更后的统一刷新——表头 = 清洗+筛选后剩余第一行，
   * 表头（列名）变化时自动补充已配置映射（仅存在纯映射行时，D108 口径）并 L2 重建列映射区块；
   * 否则仅 L1 刷新预览。
   */
  private onRowConfigChanged(): void {
    const headerKey = this.isTableSource() ? resolvedHeader(this.parsed, this.transform).join('|') : '';
    if (
      headerKey !== '' &&
      this.lastHeaderKey !== null &&
      this.lastHeaderKey !== headerKey &&
      this.transform.mappings.some((m) => !m.rule)
    ) {
      this.transform.mappings = autoMapColumns(resolvedHeader(this.parsed, this.transform), this.transform.mappings);
      this.refreshStep3Blocks(['columns']);
    } else {
      this.refreshPreviewOnly(); // D91 L1
    }
    this.lastHeaderKey = headerKey;
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

  /**
   * 区块 5「列映射」卡片（D117 统一管线 UI）：列 = 来源 / 目标字段 / 类型(FrontMatter) / 添加设置(下拉) / 操作(⏵显隐设置 + ✕)。
   * 行模型 = cfg.mappings 统一行：rule 有值=派生（经「添加设置 · 列派生」下拉创建/切换）；settings = 格式化/处理设置链；
   * 「类型」= FrontMatter 类型（文本/数字/日期/布尔/忽略，数字·日期·布尔隐含转换）；origin='auto'=自动映射生成。
   * 每行下方「设置面板」列出已添加设置（派生预设 + 格式化/处理，可编辑参数/删除），由操作列 ⏵/⏷ 显隐。
   */
  private renderMappingCard(host: HTMLElement, cols: string[]): void {
    const head = host.createDiv({ cls: 'ipw-grid ipw-grid-head ipw-map-head' });
    head.createSpan({ text: '来源' });
    head.createSpan({ text: '目标字段' });
    head.createSpan({ text: '类型' });
    head.createSpan({ text: '输出到' });
    head.createSpan({ text: '添加设置' });
    head.createSpan({ text: '操作' });

    if (this.transform.mappings.length === 0) {
      host.createDiv({
        cls: 'ipw-muted ipw-note',
        text:
          '（暂无映射，将保留全部列；「添加设置」下拉可为行加入 列格式化 / 列处理 / 列派生 / 计算 / 链接 步骤——选「列派生」即成为派生计算行）'
      });
    }

    this.transform.mappings.forEach((m, i) => {
      const isDerived = !!m.rule;
      const preset = isDerived ? DERIVED_PRESETS.find((p) => p.id === m.rule) : undefined;
      const row = host.createDiv({ cls: 'ipw-grid ipw-map-row' });

      // ── 来源 ──
      const src = row.createEl('select', { cls: 'ipw-select' });
      if (isDerived) {
        // 派生行可重复读取任意列；无源预设（时间戳/年份）提供「(无来源)」
        if (preset && !preset.needsSource) src.createEl('option', { value: '', text: '(无来源)' });
        for (const c of cols) src.createEl('option', { value: c, text: c });
      } else {
        // 纯映射行仅可从「未消费源列」+ 自身当前来源中选
        for (const c of [...unmappedColumns(cols, this.transform.mappings), m.source]) {
          src.createEl('option', { value: c, text: c });
        }
      }
      if (src.options.length > 0) {
        src.value = m.source;
        if (src.value === '') {
          const fb = src.options[0].value;
          this.transform.mappings[i].source = fb;
          src.value = fb;
        }
      }
      src.addEventListener('change', () => {
        this.transform.mappings[i].source = src.value;
        this.refreshStep3Blocks(['columns']); // D91：L2 区块内重建（其余行可选来源随之变化）+ 预览刷新
      });

      // ── 目标字段 ──
      const target = row.createEl('input', {
        cls: 'ipw-input',
        type: 'text',
        placeholder: isDerived ? '产出字段名' : '模板字段名'
      });
      target.value = m.target;
      target.addEventListener('input', () => {
        this.transform.mappings[i].target = target.value;
        this.refreshPreviewOnly(); // D91 L1：目标字段名影响预览表头
      });

      // ── 类型（D117：FrontMatter 类型；数字/日期/布尔隐含转换；身份证移除→「添加设置·列格式化」） ──
      const typeSel = row.createEl('select', { cls: 'ipw-select' });
      for (const o of MAPPING_TYPE_LABELS) typeSel.createEl('option', { value: o.value, text: o.label });
      typeSel.value = m.type;
      typeSel.addEventListener('change', () => {
        const mp = this.transform.mappings[i];
        mp.type = typeSel.value as MappingType;
        this.refreshStep3Blocks(['columns']); // D91：L2 + 预览刷新（忽略=不产出）
      });

      // ── 输出到（D120：字段归属笔记类型下拉；主笔记 + 已定义附加类型） ──
      const noteSel = row.createEl('select', { cls: 'ipw-select' });
      noteSel.createEl('option', { value: '', text: '主笔记' });
      for (const t of this.transform.noteTypes ?? []) {
        noteSel.createEl('option', { value: t.id, text: t.name || t.id });
      }
      noteSel.value = m.noteType && m.noteType !== 'main' ? m.noteType : '';
      noteSel.addEventListener('change', () => {
        const mp = this.transform.mappings[i];
        const v = noteSel.value;
        mp.noteType = v === '' || v === 'main' ? undefined : v;
        this.refreshStep3Blocks(['columns']); // D91：L2（字段归属变化影响 note-output）+ 预览刷新
      });

      // ── 添加设置（D117 下拉：列格式化 / 列处理 / 列派生，选择即加入该行设置链） ──
      const addCell = row.createDiv({ cls: 'ipw-add-setting-cell' });
      this.renderMappingAddSelect(addCell, i);

      // ── 操作（独立单元格容器：⏵/⏷ 设置面板显隐 + 自动标记 + 删除行） ──
      const cellOps = row.createDiv({ cls: 'ipw-cell-ops' });
      if (m.origin === 'auto') {
        cellOps.createSpan({ cls: 'ipw-origin', text: '自动' });
      }
      const itemCount = (isDerived ? 1 : 0) + (m.settings?.length ?? 0);
      const open = this.mappingPanelsOpen.has(i);
      const toggle = cellOps.createEl('button', {
        cls: 'ipw-icon-btn',
        text: open ? '⏷' : '⏵',
        attr: { title: open ? '隐藏已添加设置' : '显示已添加设置' }
      });
      toggle.addEventListener('click', () => {
        if (this.mappingPanelsOpen.has(i)) this.mappingPanelsOpen.delete(i);
        else this.mappingPanelsOpen.add(i);
        this.refreshStep3Blocks(['columns']);
      });
      if (!open && itemCount > 0) {
        cellOps.createSpan({ cls: 'ipw-settings-count', text: `${itemCount}` });
      }
      const del = cellOps.createEl('button', {
        cls: 'ipw-icon-btn',
        text: '✕',
        attr: { title: isDerived ? '删除该派生行' : '删除该映射行' }
      });
      del.addEventListener('click', () => {
        this.transform.mappings.splice(i, 1);
        this.mappingPanelsOpen.delete(i);
        this.refreshStep3Blocks(['columns']); // D91：L2 区块内重建 + 预览刷新
      });

      // ── 行下设置面板（D117：已添加设置列表 + 参数编辑/删除；展开时渲染，grid-column 1/-1） ──
      if (open) {
        this.renderMappingSettingsPanel(row, m, i);
      }
    });

    // ── 按钮行：添加映射行 / 自动映射 / 删除所有自动映射 / 清除所有 ──
    const ops = host.createDiv({ cls: 'ipw-form-row' });
    const add = ops.createEl('button', { cls: 'ipw-mini', text: '➕ 添加映射行' });
    add.addEventListener('click', () => {
      const free = unmappedColumns(cols, this.transform.mappings);
      const source = free[0] ?? cols[0] ?? '';
      this.transform.mappings.push({ source, target: source, type: 'text', origin: 'manual' });
      this.refreshStep3Blocks(['columns']);
    });
    const auto = ops.createEl('button', { cls: 'ipw-mini', text: '🧹 自动映射' });
    auto.addEventListener('click', () => {
      this.transform.mappings = autoMapColumns(cols, this.transform.mappings);
      this.refreshStep3Blocks(['columns']);
    });
    const delAuto = ops.createEl('button', { cls: 'ipw-mini ipw-danger', text: '🗑 删除所有自动映射' });
    delAuto.addEventListener('click', () => {
      if (!this.transform.mappings.some((m) => m.origin === 'auto')) {
        new Notice('当前没有由「🧹 自动映射」生成的行');
        return;
      }
      if (!window.confirm('删除所有由「🧹 自动映射」生成的行？（手动添加/回填的行保留）')) return;
      this.transform.mappings = removeAutoMappings(this.transform.mappings);
      this.refreshStep3Blocks(['columns']);
    });
    const clear = ops.createEl('button', { cls: 'ipw-mini ipw-danger', text: '🗑 清除所有' });
    clear.addEventListener('click', () => {
      if (!window.confirm('清空全部列映射与派生字段？（仅清除本向导会话，已保存到模板的配置不受影响）')) return;
      this.transform.mappings = [];
      this.mappingPanelsOpen.clear();
      this.pendingSettingDraft = null;
      this.refreshStep3Blocks(['columns']);
    });

    const freeCols = unmappedColumns(cols, this.transform.mappings);
    host.createDiv({
      cls: 'ipw-muted ipw-note',
      text:
        `💡 可用源列: ${freeCols.join(' / ') || '(无未映射列)'}。` +
        `「类型」为目标字段的 FrontMatter 类型（数字/日期/布尔自动转换，忽略=不产出）；` +
        `「添加设置」下拉加入 列格式化/列处理/列派生/计算/链接 步骤（选「列派生」即按预设计算该字段；` +
        `计算=加减乘除/条件计算/条件警告，链接=智能链接，条件与链接仅适用于普通映射行）；` +
        `标记「自动」的行由 🧹自动映射 生成，「🗑 删除所有自动映射」仅删除此类行。`
    });
  }

  /* ── D120 多笔记输出：区块 5「📑 笔记类型」面板 ── */

  /** 模板引用下拉选项（模板目录 .md 的完整路径；D120） */
  private templateRefOptions(): Array<{ value: string; label: string }> {
    const opts: Array<{ value: string; label: string }> = [];
    for (const t of this.templates) {
      const p = this.deps.scanner.getParsed(t.id);
      if (p) opts.push({ value: p.info.path, label: t.name || basenameOf(p.info.path) });
    }
    return opts;
  }

  /** 下一个可用的附加笔记类型 id（`type1`/`type2`… 不与其他类型冲突） */
  private nextNoteTypeId(notes: NoteTypeConfig[]): string {
    let i = 1;
    while (notes.some((t) => t.id === `type${i}`)) i++;
    return `type${i}`;
  }

  /** 区块 5 底部「📑 笔记类型」面板（空态折叠提示；附加类型列表可增删/编辑字段/生成条件） */
  private renderNoteTypesPanel(host: HTMLElement): void {
    const wrap = host.createDiv({ cls: 'ipw-card' });
    wrap.createDiv({ cls: 'ipw-card-title', text: '📑 笔记类型（多笔记输出）' });
    wrap.createDiv({
      cls: 'ipw-muted ipw-note',
      text: '主笔记（固定，一条数据始终生成）：含全部「输出到 = 主笔记」的字段。附加类型经下方添加；在「输出到」列把字段指派给对应类型笔记。'
    });
    const notes = this.transform.noteTypes ?? [];
    const listHost = wrap.createDiv({ cls: 'ipw-note-types' });
    if (notes.length === 0) {
      listHost.createDiv({ cls: 'ipw-muted ipw-note', text: '（未定义附加类型，每条数据仅生成主笔记）' });
    } else {
      notes.forEach((t, idx) => this.renderNoteTypeRow(listHost, idx, t));
    }
    const addBtn = wrap.createEl('button', { cls: 'ipw-mini ipw-primary', text: '➕ 添加笔记类型' });
    addBtn.addEventListener('click', () => {
      const arr = this.transform.noteTypes ?? [];
      const id = this.nextNoteTypeId(arr);
      arr.push({ id, name: `笔记类型${arr.length + 1}` });
      this.transform.noteTypes = arr;
      this.refreshStep3Blocks(['columns']); // L2：重建区块（输出到列/面板同步）
    });
  }

  /** 渲染单个附加笔记类型行（名称/模板/文件夹/文件名后缀/生成条件） */
  private renderNoteTypeRow(host: HTMLElement, idx: number, t: NoteTypeConfig): void {
    const box = host.createDiv({ cls: 'ipw-note-type' });
    const row1 = box.createDiv({ cls: 'ipw-form-row' });
    const nameInput = row1.createEl('input', { cls: 'ipw-input', type: 'text', value: t.name, attr: { placeholder: '类型名称，如 联系方式' } });
    nameInput.addEventListener('input', () => {
      const cur = (this.transform.noteTypes ?? [])[idx];
      if (cur) cur.name = nameInput.value;
    });
    nameInput.addEventListener('change', () => this.refreshStep3Blocks(['columns'])); // 失焦同步到「输出到」列文本
    const tplSel = row1.createEl('select', { cls: 'ipw-select' });
    tplSel.createEl('option', { value: '', text: '模板: (不引用)' });
    for (const o of this.templateRefOptions()) tplSel.createEl('option', { value: o.value, text: o.label });
    tplSel.value = t.template ?? '';
    tplSel.addEventListener('change', () => {
      const cur = (this.transform.noteTypes ?? [])[idx];
      if (cur) {
        const v = tplSel.value;
        cur.template = v === '' ? undefined : v;
      }
      this.refreshStep3Blocks(['columns']);
    });
    const del = row1.createEl('button', { cls: 'ipw-mini ipw-danger', text: '🗑 删除类型' });
    del.addEventListener('click', () => {
      const arr = this.transform.noteTypes ?? [];
      const removed = arr[idx];
      arr.splice(idx, 1);
      this.transform.noteTypes = arr;
      // 删除后：引用该类型的映射行回落主笔记（避免字段归属悬空丢失）
      if (removed) {
        for (const m of this.transform.mappings) {
          if (m.noteType === removed.id) m.noteType = undefined;
        }
      }
      this.refreshStep3Blocks(['columns']);
    });

    const row2 = box.createDiv({ cls: 'ipw-form-row' });
    row2.createSpan({ cls: 'ipw-label', text: '输出文件夹:' });
    const folderInput = row2.createEl('input', { cls: 'ipw-input', type: 'text', value: t.folder ?? '', attr: { placeholder: '空 = 随主笔记文件夹' } });
    folderInput.addEventListener('input', () => {
      const cur = (this.transform.noteTypes ?? [])[idx];
      if (cur) cur.folder = folderInput.value.trim();
    });
    row2.createSpan({ cls: 'ipw-label ipw-label-gap', text: '文件名后缀:' });
    const nameSuffix = row2.createEl('input', { cls: 'ipw-input', type: 'text', value: t.noteName ?? '', attr: { placeholder: '如 _联系方式（缺省 _类型名）' } });
    nameSuffix.addEventListener('input', () => {
      const cur = (this.transform.noteTypes ?? [])[idx];
      if (cur) cur.noteName = nameSuffix.value.trim();
    });

    // 生成条件（复用行筛选 AND 语义；可选）
    const row3 = box.createDiv({ cls: 'ipw-form-row' });
    row3.createSpan({ cls: 'ipw-label', text: '生成条件:' });
    const cCol = row3.createEl('select', { cls: 'ipw-select' });
    cCol.createEl('option', { value: ANY_COLUMN, text: '任意列' });
    for (const c of this.columns()) cCol.createEl('option', { value: c, text: c });
    const cOp = row3.createEl('select', { cls: 'ipw-select' });
    for (const o of ROW_FILTER_OP_LABELS) cOp.createEl('option', { value: o.value, text: o.label });
    const cVal = row3.createEl('input', { cls: 'ipw-input', type: 'text', placeholder: '值（为空/非空无需）' });
    const cAdd = row3.createEl('button', { cls: 'ipw-mini', text: '➕ 条件' });
    cAdd.addEventListener('click', () => {
      const cur = (this.transform.noteTypes ?? [])[idx];
      if (!cur) return;
      if (cOp.value !== 'empty' && cOp.value !== 'notEmpty' && cVal.value.trim() === '') {
        new Notice('请填写比较值');
        return;
      }
      cur.condition = cur.condition ?? [];
      cur.condition.push({ column: cCol.value, op: cOp.value as RowFilterRule['op'], value: cVal.value.trim() });
      cVal.value = '';
      this.renderNoteTypeCondList(condBox, idx);
      this.refreshPreviewOnly();
    });
    const condBox = box.createDiv({ cls: 'ipw-note-type-cond' });
    this.renderNoteTypeCondList(condBox, idx);
  }

  /** 重建单个附加笔记类型的「生成条件」列表（不整块重建） */
  private renderNoteTypeCondList(container: HTMLElement, idx: number): void {
    container.empty();
    const t = (this.transform.noteTypes ?? [])[idx];
    const rules = t?.condition ?? [];
    if (rules.length === 0) {
      container.createDiv({ cls: 'ipw-muted ipw-note', text: '条件: (无——满足字段非空即生成？留空 = 每行均生成)' });
      return;
    }
    container.createDiv({ cls: 'ipw-muted', text: '条件:' });
    const list = container.createDiv({ cls: 'ipw-rule-list' });
    rules.forEach((r, j) => {
      const row = list.createDiv({ cls: 'ipw-rule-row' });
      row.createSpan({ cls: 'ipw-rule-text', text: `• ${rowFilterRuleLabel(r)}` });
      const del = row.createEl('button', { cls: 'ipw-icon-btn', text: '✕' });
      del.addEventListener('click', () => {
        const cur = (this.transform.noteTypes ?? [])[idx];
        if (!cur) return;
        const arr = [...(cur.condition ?? [])];
        arr.splice(j, 1);
        cur.condition = arr;
        this.renderNoteTypeCondList(container, idx);
        this.refreshPreviewOnly();
      });
    });
  }

  /** D117/D119：渲染行「添加设置」下拉（五组：列格式化 / 列处理 / 列派生 / 计算 / 链接）；参数类步骤进入面板草稿 */
  private renderMappingAddSelect(cell: HTMLElement, index: number): void {
    const sel = cell.createEl('select', { cls: 'ipw-select ipw-add-setting-sel' });
    sel.createEl('option', { value: '', text: '＋ 添加设置…' });
    const gFmt = sel.createEl('optgroup', { attr: { label: '列格式化' } });
    for (const o of FORMAT_OP_LABELS) gFmt.createEl('option', { value: o.value, text: o.label });
    const gPrc = sel.createEl('optgroup', { attr: { label: '列处理' } });
    for (const o of PROCESS_OP_LABELS) gPrc.createEl('option', { value: o.value, text: o.label });
    const gDer = sel.createEl('optgroup', { attr: { label: '列派生' } });
    for (const p of DERIVED_PRESETS) gDer.createEl('option', { value: p.id, text: p.label });
    const gCmp = sel.createEl('optgroup', { attr: { label: '计算' } });
    for (const o of COMPUTE_ARITH_LABELS) gCmp.createEl('option', { value: o.value, text: o.label });
    for (const o of COMPUTE_COND_LABELS) gCmp.createEl('option', { value: o.value, text: o.label });
    const gLnk = sel.createEl('optgroup', { attr: { label: '链接' } });
    for (const o of LINK_OP_LABELS) gLnk.createEl('option', { value: o.value, text: o.label });

    sel.addEventListener('change', () => {
      const val = sel.value;
      sel.value = ''; // 复位占位，允许再次选择
      if (!val) return;
      if (DERIVED_PRESETS.some((p) => p.id === val)) {
        this.applyDerivePreset(index, val as DerivedRuleId);
        return;
      }
      const mp = this.transform.mappings[index];
      const isDerived = !!mp.rule;
      // D119 计算·算术
      const arith = COMPUTE_ARITH_LABELS.find((o) => o.value === val);
      if (arith) {
        this.pendingSettingDraft = { index, group: 'compute', op: arith.value };
        this.mappingPanelsOpen.add(index);
        this.refreshStep3Blocks(['columns']);
        return;
      }
      // D119 条件计算 / 条件警告 / 智能链接（仅普通映射行——值管线 / 附言均以行源列值为比较对象）
      if (val === 'condition' || val === 'warn' || val === 'smartLink') {
        if (isDerived) {
          new Notice('条件计算 / 条件警告 / 智能链接仅适用于普通映射行（请选一条有来源的映射行）');
          return;
        }
        this.pendingSettingDraft =
          val === 'condition'
            ? { index, group: 'compute', op: 'condition' }
            : val === 'warn'
              ? { index, group: 'compute', op: 'warn' }
              : { index, group: 'link', op: 'smartLink' };
        this.mappingPanelsOpen.add(index);
        this.refreshStep3Blocks(['columns']);
        return;
      }
      const fmt = FORMAT_OP_LABELS.some((o) => o.value === val);
      const prc = PROCESS_OP_LABELS.some((o) => o.value === val);
      const group: 'format' | 'process' | null = fmt ? 'format' : prc ? 'process' : null;
      if (!group) return;
      const spec = settingParamSpec(
        ({ group, op: val, param: '', param2: '' } as unknown) as MappingSetting
      );
      if (spec.needParam) {
        // 需参数：打开设置面板并显示参数草稿
        this.pendingSettingDraft = { index, group, op: val };
        this.mappingPanelsOpen.add(index);
        this.refreshStep3Blocks(['columns']);
        return;
      }
      // 无参数：直接加入该行设置链
      mp.settings = mp.settings ?? [];
      const setting: MappingSetting =
        group === 'format'
          ? ({ group: 'format', op: val, param: '' } as unknown as MappingSetting)
          : ({ group: 'process', op: val, param: ',', param2: val === 'merge' ? ' ' : '' } as unknown as MappingSetting);
      mp.settings.push(setting);
      this.mappingPanelsOpen.add(index);
      this.refreshStep3Blocks(['columns']); // 追加设置项 + 预览刷新
    });
  }

  /** D117：把行设为/切换为派生预设（rule 行；目标默认产出名、无源预设清空来源；打开设置面板展示派生项） */
  private applyDerivePreset(index: number, presetId: DerivedRuleId): void {
    const mp = this.transform.mappings[index];
    const preset = DERIVED_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const wasDerivedDefault =
      !!mp.rule && !!mp.target && mp.target === deriveFieldName(mp.rule, mp.source || '');
    mp.rule = presetId;
    if (mp.type === 'ignore') mp.type = 'text'; // 忽略无法产出
    if (!preset.needsSource) mp.source = '';
    else if (!mp.source) mp.source = this.columns()[0] ?? '';
    if (!mp.target || mp.target === mp.source || wasDerivedDefault) {
      mp.target = deriveFieldName(presetId, mp.source || '');
    }
    this.mappingPanelsOpen.add(index);
    this.refreshStep3Blocks(['columns']); // D91：L2（来源/产出名变化）+ 预览刷新
  }

  /** D117：行下「设置」面板（已添加设置：派生预设项 + 格式化/处理项，可编辑参数/删除；含待确认草稿） */
  private renderMappingSettingsPanel(row: HTMLElement, m: ColumnMapping, index: number): void {
    const panel = row.createDiv({ cls: 'ipw-map-panel' });
    const count = (m.rule ? 1 : 0) + (m.settings?.length ?? 0);
    panel.createDiv({ cls: 'ipw-muted ipw-map-panel-title', text: `已添加设置 (${count})` });

    const draft = this.pendingSettingDraft;
    if (draft && draft.index === index) {
      this.renderPendingSettingDraft(panel, index, draft);
    }

    const list = panel.createDiv({ cls: 'ipw-map-settings-list' });
    if (m.rule) {
      const preset = DERIVED_PRESETS.find((p) => p.id === m.rule);
      const item = list.createDiv({ cls: 'ipw-map-setting-item' });
      const chip = item.createDiv({ cls: 'ipw-chip ipw-chip-derive', attr: { title: '该行由「列派生」预设计算产出' } });
      chip.createSpan({ text: `列派生 · ${preset?.label ?? m.rule}` });
      const x = chip.createEl('button', { cls: 'ipw-chip-x', text: '✕', attr: { title: '移除派生预设（回到普通映射行）' } });
      x.addEventListener('click', () => {
        const mp = this.transform.mappings[index];
        mp.rule = undefined;
        mp.type = 'text';
        if (!mp.target) mp.target = mp.source;
        this.refreshStep3Blocks(['columns']);
      });
    }
    (m.settings ?? []).forEach((s, j) => {
      const item = list.createDiv({ cls: 'ipw-map-setting-item' });
      const chip = item.createDiv({ cls: 'ipw-chip' });
      chip.createSpan({ text: mappingSettingLabel(s) });
      const spec = settingParamSpec(s);
      if (spec.needParam) {
        const edit = chip.createEl('button', { cls: 'ipw-chip-x', text: '✎', attr: { title: '编辑参数' } });
        edit.addEventListener('click', () => this.renderSettingEditForm(item, index, j, s));
      }
      const x = chip.createEl('button', { cls: 'ipw-chip-x', text: '✕', attr: { title: '删除该设置' } });
      x.addEventListener('click', () => {
        const mp = this.transform.mappings[index];
        mp.settings = (mp.settings ?? []).filter((_, k) => k !== j);
        this.refreshStep3Blocks(['columns']);
      });
    });
    if (!m.rule && (m.settings?.length ?? 0) === 0 && !(draft && draft.index === index)) {
      list.createDiv({
        cls: 'ipw-muted ipw-note',
        text: '（未添加任何设置——用上方「添加设置」下拉选择 列格式化 / 列处理 / 列派生 / 计算 / 链接）'
      });
    }
  }

  /** D117/D119：按草稿类型分发参数确认表单（format/process 通用单参；compute 算术/条件/警告与 link 专用） */
  private renderPendingSettingDraft(
    panel: HTMLElement,
    index: number,
    draft: NonNullable<ImportModal['pendingSettingDraft']>
  ): void {
    if (draft.group === 'format' || draft.group === 'process') {
      this.renderSettingDraftForm(panel, index, draft.group, draft.op);
      return;
    }
    if (draft.group === 'compute' && (draft.op === 'add' || draft.op === 'subtract' || draft.op === 'multiply' || draft.op === 'divide')) {
      this.renderComputeArithDraft(panel, index, draft.op);
      return;
    }
    if (draft.group === 'compute' && draft.op === 'condition') {
      this.renderConditionDraft(panel, index);
      return;
    }
    if (draft.group === 'compute' && draft.op === 'warn') {
      this.renderWarnDraft(panel, index);
      return;
    }
    if (draft.group === 'link' && draft.op === 'smartLink') {
      this.renderLinkDraft(panel, index);
      return;
    }
  }

  /** 复用：草稿区创建「比较符/操作数」行（条件计算 / 条件警告共用） */
  private draftCompareRow(
    host: HTMLElement
  ): { compareSel: HTMLSelectElement; operand: HTMLInputElement } {
    host.createSpan({ cls: 'ipw-muted', text: '比较:' });
    const compareSel = host.createEl('select', { cls: 'ipw-select' });
    for (const o of COMPUTE_COMPARE_LABELS) compareSel.createEl('option', { value: o.value, text: o.label });
    const operand = host.createEl('input', {
      cls: 'ipw-input',
      type: 'text',
      value: '',
      attr: { placeholder: '第二操作数（数字常数或列名）' }
    });
    return { compareSel, operand };
  }

  /** D119：计算·算术草稿（第二操作数 = 数字常数或列名） */
  private renderComputeArithDraft(panel: HTMLElement, index: number, op: 'add' | 'subtract' | 'multiply' | 'divide'): void {
    const label = COMPUTE_ARITH_LABELS.find((o) => o.value === op)?.label ?? op;
    const row = panel.createDiv({ cls: 'ipw-settings-editor' });
    row.createSpan({ cls: 'ipw-muted', text: `添加 计算·` });
    row.createSpan({ text: label });
    const operand = row.createEl('input', {
      cls: 'ipw-input',
      type: 'text',
      value: '',
      attr: { placeholder: '第二操作数：数字常数或列名' }
    });
    this.draftButtons(row, index, () => {
      const t = operand.value.trim();
      if (t === '') {
        new Notice('请填写第二操作数（数字常数或列名）');
        return null;
      }
      const mp = this.transform.mappings[index];
      mp.settings = mp.settings ?? [];
      mp.settings.push({ group: 'compute', op, operand: t });
      return true;
    });
  }

  /** D119：计算·条件计算草稿（比较当前行值 → 真/假值；整链替换式，清空其余值步骤） */
  private renderConditionDraft(panel: HTMLElement, index: number): void {
    const row = panel.createDiv({ cls: 'ipw-settings-editor' });
    row.createSpan({ cls: 'ipw-muted', text: '添加 计算·条件计算 ' });
    const { compareSel, operand } = this.draftCompareRow(row);
    const truthy = row.createEl('input', { cls: 'ipw-input', type: 'text', value: '', attr: { placeholder: '条件成立值' } });
    const falsy = row.createEl('input', { cls: 'ipw-input', type: 'text', value: '', attr: { placeholder: '条件不成立值' } });
    this.draftButtons(row, index, () => {
      const t = operand.value.trim();
      if (t === '') {
        new Notice('请填写第二操作数');
        return null;
      }
      const mp = this.transform.mappings[index];
      // 整链替换式：清空其余值管线步骤（保留附言 warn/link）
      mp.settings = (mp.settings ?? []).filter((s) => isPostscriptSetting(s));
      mp.settings.push({
        group: 'compute',
        op: 'condition',
        compare: compareSel.value as ComputeCompareOp,
        operand: t,
        truthy: truthy.value,
        falsy: falsy.value
      });
      return true;
    });
  }

  /** D119：计算·条件警告草稿（比较命中 → 追加 _warnings 附言） */
  private renderWarnDraft(panel: HTMLElement, index: number): void {
    const row = panel.createDiv({ cls: 'ipw-settings-editor' });
    row.createSpan({ cls: 'ipw-muted', text: '添加 计算·条件警告 ' });
    const { compareSel, operand } = this.draftCompareRow(row);
    const text = row.createEl('input', { cls: 'ipw-input', type: 'text', value: '', attr: { placeholder: '警告文本（命中时写入 _warnings）' } });
    this.draftButtons(row, index, () => {
      const t = operand.value.trim();
      if (t === '') {
        new Notice('请填写第二操作数');
        return null;
      }
      const mp = this.transform.mappings[index];
      mp.settings = mp.settings ?? [];
      mp.settings.push({
        group: 'compute',
        op: 'warn',
        compare: compareSel.value as ComputeCompareOp,
        operand: t,
        text: text.value
      });
      return true;
    });
  }

  /** D119：链接·智能链接草稿（目标文件夹 / 回退文件夹 → 行 set 后写 _link） */
  private renderLinkDraft(panel: HTMLElement, index: number): void {
    const row = panel.createDiv({ cls: 'ipw-settings-editor' });
    row.createSpan({ cls: 'ipw-muted', text: '添加 链接·智能链接 ' });
    const target = row.createEl('input', { cls: 'ipw-input', type: 'text', value: '人员档案', attr: { placeholder: '目标文件夹' } });
    const fallback = row.createEl('input', { cls: 'ipw-input', type: 'text', value: '待建档案', attr: { placeholder: '回退文件夹（未匹配时）' } });
    this.draftButtons(row, index, () => {
      const mp = this.transform.mappings[index];
      mp.settings = mp.settings ?? [];
      mp.settings.push({ group: 'link', op: 'smartLink', target: target.value.trim(), fallback: fallback.value.trim() });
      return true;
    });
  }

  /** 草稿区「添加/取消」按钮（提交回调返回 null = 校验失败不关闭；true = 写入后关闭刷新） */
  private draftButtons(host: HTMLElement, index: number, submit: () => boolean | null): void {
    const ok = host.createEl('button', { cls: 'ipw-mini ipw-primary', text: '添加' });
    ok.addEventListener('click', () => {
      const done = submit();
      if (done === null) return;
      this.pendingSettingDraft = null;
      this.mappingPanelsOpen.add(index);
      this.refreshStep3Blocks(['columns']);
    });
    const cancel = host.createEl('button', { cls: 'ipw-mini', text: '取消' });
    cancel.addEventListener('click', () => {
      this.pendingSettingDraft = null;
      this.refreshStep3Blocks(['columns']);
    });
  }

  /** D117：设置面板内渲染「添加设置」参数草稿（下拉选中需参数步骤后出现） */
  private renderSettingDraftForm(panel: HTMLElement, index: number, group: 'format' | 'process', op: string): void {
    const draftRow = panel.createDiv({ cls: 'ipw-settings-editor' });
    draftRow.createSpan({ cls: 'ipw-muted', text: `添加 ${group === 'format' ? '列格式化' : '列处理'}·` });
    const label =
      (group === 'format' ? FORMAT_OP_LABELS : PROCESS_OP_LABELS).find((o) => o.value === op)?.label ?? op;
    draftRow.createSpan({ text: label });
    const spec = settingParamSpec(({ group, op, param: '', param2: '' } as unknown) as MappingSetting);
    const param = draftRow.createEl('input', {
      cls: 'ipw-input',
      type: 'text',
      value: op === 'split' ? ',' : '',
      attr: { placeholder: spec.placeholder }
    });
    const ok = draftRow.createEl('button', { cls: 'ipw-mini ipw-primary', text: '添加' });
    ok.addEventListener('click', () => {
      const p = param.value.trim();
      if (spec.needParam && p === '') {
        new Notice('请填写参数');
        return;
      }
      const mp = this.transform.mappings[index];
      mp.settings = mp.settings ?? [];
      const setting: MappingSetting =
        group === 'format'
          ? ({ group: 'format', op, param: p } as unknown as MappingSetting)
          : ({ group: 'process', op, param: p || ',', param2: op === 'merge' ? ' ' : '' } as unknown as MappingSetting);
      mp.settings.push(setting);
      this.pendingSettingDraft = null;
      this.mappingPanelsOpen.add(index);
      this.refreshStep3Blocks(['columns']); // 追加设置项 + 预览刷新
    });
    const cancel = draftRow.createEl('button', { cls: 'ipw-mini', text: '取消' });
    cancel.addEventListener('click', () => {
      this.pendingSettingDraft = null;
      this.refreshStep3Blocks(['columns']);
    });
  }

  /** D117/D119：设置面板内编辑某设置参数（就地展开输入；保存后刷新）。仅 format/process 走通用单参编辑，
   *  compute/link 参数较多（compare/operand/truthy/falsy 等），采用「删除后重加」维护。 */
  private renderSettingEditForm(item: HTMLElement, index: number, j: number, s: MappingSetting): void {
    if (s.group === 'compute' || s.group === 'link') return;
    const editor = item.createDiv({ cls: 'ipw-map-edit' });
    const spec = settingParamSpec(s);
    const param = editor.createEl('input', {
      cls: 'ipw-input',
      type: 'text',
      value: s.param,
      attr: { placeholder: spec.placeholder }
    });
    const ok = editor.createEl('button', { cls: 'ipw-mini ipw-primary', text: '保存' });
    ok.addEventListener('click', () => {
      const mp = this.transform.mappings[index];
      const list = mp.settings ?? [];
      const cur = list[j];
      if (!cur) return;
      if (cur.group !== 'format' && cur.group !== 'process') return;
      const p = param.value.trim();
      if (spec.needParam && p === '') {
        new Notice('请填写参数');
        return;
      }
      const next: MappingSetting =
        cur.group === 'format'
          ? { group: 'format', op: cur.op, param: p }
          : { group: 'process', op: cur.op, param: p || ',', param2: cur.param2 };
      mp.settings = [...list.slice(0, j), next, ...list.slice(j + 1)];
      this.refreshStep3Blocks(['columns']);
    });
    const cancel = editor.createEl('button', { cls: 'ipw-mini', text: '取消' });
    cancel.addEventListener('click', () => this.refreshStep3Blocks(['columns']));
  }

  private previewEl: HTMLElement | null = null;

  private renderPreviewBlock(el: HTMLElement): void {
    const wrap = el.createDiv({ cls: 'ipw-block' });
    wrap.createEl('h5', { text: '👁️ 预览（前 3 行，真实 Handlebars 渲染）' });
    this.previewEl = wrap;
    void this.renderPreviewRows(wrap);
  }

  /** D98：真实渲染预览 = 对内存编译产物执行 renderPreprocess（与 Step 4 导入同一条 Handlebars 路径） */
  private async renderPreviewRows(container: HTMLElement): Promise<void> {
    if (!container.isConnected) return;
    const total = this.parsed.length;
    container.querySelector('.ipw-preview-head')?.remove();
    container.querySelector('.ipw-preview-grid-wrap')?.remove();

    // 筛选统计（行清洗 + 行筛选后保留，D122；表格类扣除被提升的表头行，D123）
    const kept = this.dataRowCount();
    const hasSel = this.hasRowSelection();
    const head = container.createDiv({ cls: 'ipw-muted ipw-note ipw-preview-head' });
    head.setText(hasSel ? `筛选后 ${formatCount(kept)} / ${formatCount(total)} 行` : `共 ${formatCount(total)} 行`);

    // D88：预览首列「#」为解析后原始行号（1-based，清洗/筛选后不重排）
    // D118：向导实时校验规则传入（真实校验语义回填 _valid/_errors/_warnings/_status → 行首徽标）
    // D123：表格类开启表头提升（清洗+筛选后剩余第一行提升为列名）
    const rows = await applyWizardTransform(
      this.deps.engine,
      this.parsed.slice(0, 20),
      this.transform,
      { rules: this.validation, promoteHeader: this.isTableSource() }
    );
    if (!container.isConnected) return; // 异步渲染期间向导已关闭/区块已重建
    const preview = rows.slice(0, 3);
    if (preview.length === 0) {
      const note = container.createDiv({ cls: 'ipw-muted ipw-note', text: '(无数据可预览：全部被删除/筛选或为空)' });
      note.addClass('ipw-preview-grid-wrap');
      return;
    }
    // 隐藏内部回填保留字段（行号/校验标记/哈希/链接等不展示为数据列）
    const IGNORED = new Set(['_index', '_valid', '_errors', '_warnings', '_status', '_hash', '_link', '_notes']);
    const cols = Object.keys(preview[0].row).filter((k) => !IGNORED.has(k));
    const hasValid = this.validation.length > 0;
    const grid = container.createDiv({ cls: 'ipw-preview-grid-wrap' });
    const gridEl = grid.createDiv({ cls: 'ipw-preview-grid' });
    gridEl.createDiv({ cls: 'ipw-cell is-head ipw-row-num', text: '#' });
    if (hasValid) gridEl.createDiv({ cls: 'ipw-cell is-head ipw-valid-col', text: '状态' });
    for (const c of cols) gridEl.createDiv({ cls: 'ipw-cell is-head', text: c, attr: { title: c } });
    for (const p of preview) {
      gridEl.createDiv({ cls: 'ipw-cell ipw-row-num', text: `${p.src}` });
      if (hasValid) {
        const badge = rowValidationBadge(p.row);
        const cell = gridEl.createDiv({ cls: 'ipw-cell ipw-valid-badge' });
        if (badge === 'err') cell.setText('❌ 失败');
        else if (badge === 'warn') cell.setText('⚠️ 警告');
        else if (badge === 'ok') cell.setText('✅ 通过');
        else cell.setText('—');
        cell.addClass(badge === 'err' ? 'is-err' : badge === 'warn' ? 'is-warn' : 'is-ok');
      }
      for (const c of cols) {
        const v = p.row[c];
        gridEl.createDiv({
          cls: 'ipw-cell',
          text: v === undefined || v === null ? '' : Array.isArray(v) ? v.join('、') : String(v)
        });
      }
    }

    // D120：多笔记展开——每源行下方折叠展开该行多笔记清单（主笔记 + N 个附加笔记条目）
    const hasNotes = preview.some((r) => Array.isArray(r.row._notes) && (r.row._notes as unknown[]).length > 0);
    if (hasNotes) {
      const notesHead = grid.createDiv({ cls: 'ipw-muted ipw-note', text: '📎 多笔记输出（每源行将生成以下笔记）' });
      void notesHead;
      for (const p of preview) {
        const notes = Array.isArray(p.row._notes) ? (p.row._notes as Record<string, any>[]) : [];
        if (notes.length === 0) continue;
        const box = grid.createDiv({ cls: 'ipw-preview-notes' });
        box.createSpan({ cls: 'ipw-muted', text: `#${p.src}:` });
        notes.forEach((n, k) => {
          const rec = n ?? {};
          const label = rec._noteLabel ? String(rec._noteLabel) : '主笔记';
          const folder = rec._folder ? String(rec._folder) : '';
          const fname = rec._fileName
            ? String(rec._fileName)
            : String(p.row._hash ?? `${p.src}-${k}`);
          const tpl = rec._template ? `   模板: ${String(rec._template)}` : '';
          const noteLine = box.createDiv({ cls: 'ipw-muted ipw-note' });
          noteLine.setText(` · ${label} → ${folder ? folder + '/' : ''}${fname}.md${tpl}`);
        });
      }
    }
  }

  /** 仅刷新预览区（区块 7），用于不改变结构的配置变更（D98 真实渲染） */
  private refreshPreviewOnly(): void {
    if (this.previewEl && this.previewEl.isConnected) {
      void this.renderPreviewRows(this.previewEl);
    }
  }

  /** 是否启用了行清洗 / 行筛选（预览「筛选后 X / Y 行」标题口径，D122/D123） */
  private hasRowSelection(): boolean {
    const clean = this.transform.clean;
    const cleanOn = !!clean && (clean.removeEmpty === true || clean.removeDuplicateHeader === true);
    return (this.transform.filters?.length ?? 0) > 0 || cleanOn;
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
      const dry = await this.deps.service.importRecords(this.templateId, await this.currentRecords(), {
        sourceLabel: this.sourceLabelFor(target),
        dryRun: true,
        preprocessOverride: this.importPreprocessOverride(),
        outputOverride: this.liveOutputOverride(),
        validation: this.validation
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

  /**
   * 当前 Step 3 配置下变换后的记录集（Dry Run 预检与正式导入共用，避免重复计算）。
   * D98：与预览同一条 Handlebars 执行路径（applyWizardTransform 真实渲染），不再调用 JS 变换函数。
   * D112：输出位置/命名不再在 UI 侧用样例 _hash 预渲染 _folder，改由 liveOutputOverride 传给
   * importRecords，经 DataPipeline.shard 对每条记录按真实数据（含 _hash）求值写 _folder/_fileName。
   */
  private async currentRecords(): Promise<DataRecord[]> {
    if (this.runRecords.length === 0) {
      // D118：与预览同规则（真实校验回填 _valid/_errors/_status），保证「预览 == 导入」；
      // D123：表格类同样开启表头提升（与预览同一条变换链）
      const rows = await applyWizardTransform(this.deps.engine, this.parsed, this.transform, {
        rules: this.validation,
        promoteHeader: this.isTableSource()
      });
      this.runRecords = rows.map((t) => t.row);
    }
    return this.runRecords;
  }

  /** D112：向导实时输出命名（未保存 UI 值，供 importRecords.outputOverride） */
  private liveOutputOverride(): { folder?: string; noteName?: string } {
    const out: { folder?: string; noteName?: string } = {};
    const folder = this.outputFolder.trim();
    if (folder !== '') out.folder = folder;
    const noteName = this.outputNoteName.trim();
    if (noteName !== '') out.noteName = noteName;
    return out;
  }

  /**
   * Step 4 导入时使用的 preprocess override：仅保留模板段外手写逻辑，
   * 去掉已保存的 Step 3 编译段（Step 3 变换已由 applyWizardTransform 在向导内存执行，
   * 避免「已保存段 + 当前未保存配置」双重应用，D98）。
   */
  private importPreprocessOverride(): string | undefined {
    if (!this.templateId) return undefined;
    const cfg = this.deps.scanner.getConfig(this.templateId);
    if (!cfg) return undefined;
    const stripped = upsertSegments(cfg.preprocess ?? '', {}); // 移除已知编译段，保留段外手写
    return stripped.trim() === '' ? undefined : stripped;
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
    const records = await this.currentRecords();
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

    const sourceLabel = this.sourceLabelFor(target); // Vault 相对路径 / 外部绝对路径（历史记录来源标注）
    if (startAt > 0) pushLog('info', `↩️ 已停止于第 ${formatCount(startAt)} 个笔记，本次从断点继续…`);
    pushLog('info', `开始导入 ${sourceLabel}，共 ${formatCount(records.length)} 条记录…`);

    const result = await this.deps.service.importRecords(this.templateId, records, {
      sourceLabel,
      abortSignal,
      pause: this.pauseCtl,
      startAt,
      preprocessOverride: this.importPreprocessOverride(),
      outputOverride: this.liveOutputOverride(),
      validation: this.validation,
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
    this.validation = []; // D118：直接导入不携带 Step 3 实时校验（走模板自身 frontmatter validation）
    this.sheetNames = [];
    this.sheetName = '';
    this.importAllSheets = false;
    this.lastHeaderKey = null;
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

