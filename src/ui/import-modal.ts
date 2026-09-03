import { App, Modal, Setting, TFile, TFolder } from 'obsidian';
import { ImportService } from '../core/import-service';
import { TemplateScanner } from '../core/scanner/template-scanner';
import { FileInfo, TemplateInfo } from '../types';
import { ERROR_CODES, ImporterProError } from '../utils/errors';
import { FilePickerFactory, pickOptionsForSource } from './platform';
import type { IFilePicker } from './platform/types';

type Step = 1 | 2 | 3 | 4;

const SOURCES = [
  { label: '📊 Excel 文件', desc: '.xlsx / .xls 原生支持', format: 'xlsx' },
  { label: '📄 CSV / TSV', desc: '逗号/制表符分隔，编码自动检测', format: 'csv' },
  { label: '📗 JSON', desc: '数组或单对象', format: 'json' },
  { label: '📓 Evernote', desc: '.enex 导出文件', format: 'enex' },
  { label: '📕 Notion', desc: '.zip 导出文件', format: 'zip' },
  { label: '📖 Apple Notes', desc: '.notes 导出文件', format: 'notes' }
];

/** 导入向导（4 步：来源选择 → 文件管理 → 模板配置 → 进度执行，ui/layout.md 权威布局） */
export class ImportModal extends Modal {
  private step: Step = 1;
  private selectedFormat: string | null = null;
  private selectedFile: TFile | null = null;
  private templates: TemplateInfo[] = [];
  private selectedTemplateId = '';
  private outputFolder = '';
  /** 平台原生选择器实例（FilePickerFactory.create() 按平台惰性创建一次） */
  private picker: IFilePicker | null = null;
  /** 经平台选择器选中的外部文件（本里程碑不落库，仅 Step 2 回显） */
  private pickedFile: FileInfo | null = null;

  constructor(
    app: App,
    private service: ImportService,
    private scanner: TemplateScanner,
    private settings: () => { paths: { dataRoot: string; outputFolder: string } }
  ) {
    super(app);
  }

  override async onOpen(): Promise<void> {
    await this.render();
  }
  private async render(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('importer-pro-modal');

    if (this.step === 1) await this.renderStep1(contentEl);
    else if (this.step === 2) await this.renderStep2(contentEl);
    else if (this.step === 3) await this.renderStep3(contentEl);
    else await this.renderStep4(contentEl);
  }

  private async renderStep1(el: HTMLElement): Promise<void> {
    el.createEl('h4', { text: '选择数据来源' });
    for (const src of SOURCES) {
      const row = el.createEl('button', { cls: 'importer-pro-source' });
      row.createEl('strong', { text: src.label });
      row.createEl('div', { text: src.desc });
      row.addEventListener('click', () => {
        this.selectedFormat = src.format;
        this.step = 2;
        void this.render();
      });
    }
  }

  private async renderStep2(el: HTMLElement): Promise<void> {
    el.createEl('h4', { text: '文件管理' });

    // 平台原生文件选择（IFilePicker + FilePickerFactory，ui/layout.md §4；不落库里程碑仅回显）
    const pickRow = el.createEl('div', { cls: 'importer-pro-pick-row' });
    const pickBtn = pickRow.createEl('button', {
      text: '📁 选择文件',
      cls: 'importer-pro-pick-btn'
    });
    const pickStatus = pickRow.createEl('span', { cls: 'importer-pro-pick-status' });
    if (this.pickedFile) {
      pickStatus.setText(`已选择：${this.pickedFile.name}`);
      pickStatus.addClass('is-ok');
    }
    pickBtn.addEventListener('click', () => void this.pickWithPlatform(pickStatus));

    const paths = this.settings().paths; // 历史记录展示（简化：列出 dataRoot 内文件）
    el.createEl('div', { text: '─'.repeat(40) });
    el.createEl('div', { text: '最近使用的文件（数据根目录，可直接导入）' });
    const root = el.createEl('div');
    const folder = this.app.vault.getAbstractFileByPath(paths.dataRoot);
    const files =
      folder instanceof TFolder
        ? folder.children.filter(
            (c): c is TFile =>
              c instanceof TFile &&
              ['xlsx', 'xls', 'csv', 'tsv', 'json', 'enex', 'zip', 'notes'].includes(c.extension)
          )
        : [];
    for (const f of files.slice(0, 8)) {
      const row = root.createEl('div', { text: `📄 ${f.name}` });
      row.addEventListener('click', () => {
        this.selectedFile = f;
        this.pickedFile = null; // 与平台选择互斥，避免状态歧义
        this.step = 3;
        void this.render();
      });
    }
    const nav = el.createEl('div');
    this.addBackButton(nav);
  }

  /**
   * 经 FilePickerFactory 调用平台原生文件选择（D64）：
   * - 成功 → 回显 FileInfo（accept 已按 Step 1 数据源过滤）
   * - 取消(null) → 不改向导状态，停留 Step 2
   * - 读取失败 → 错误码 IO_002 内联提示，允许重选
   * 外部文件本里程碑不落库（Vault 写入属后续里程碑），故不自动进入 Step 3。
   */
  private async pickWithPlatform(status: HTMLElement): Promise<void> {
    try {
      const picker = this.picker ?? (this.picker = FilePickerFactory.create());
      const file = await picker.pickFile(pickOptionsForSource(this.selectedFormat));
      if (!file) return; // 取消：向导状态不变，停留 Step 2
      this.pickedFile = file;
      this.selectedFile = null;
      status.removeClass('is-error');
      status.setText(`已选择：${file.name}${file.path ? `（${file.path}）` : ''}`);
      status.addClass('is-ok');
    } catch (e) {
      const code = e instanceof ImporterProError ? e.code : ERROR_CODES.IO_READ_FAILED;
      const detail = e instanceof Error ? e.message : String(e);
      status.removeClass('is-ok');
      status.setText(`⚠ ${code} 文件读取失败：${detail}，可重新选择`);
      status.addClass('is-error');
    }
  }

  private async renderStep3(el: HTMLElement): Promise<void> {
    el.createEl('h4', { text: '模板配置' });
    el.createEl('div', { text: `文件: ${this.selectedFile?.name ?? ''}` });

    this.templates = await this.scanner.listTemplates();
    new Setting(el)
      .setName('模板')
      .addDropdown((d) => {
        for (const t of this.templates) d.addOption(t.id, t.name);
        if (this.templates.length > 0) d.setValue(this.templates[0].id);
        d.onChange((v) => (this.selectedTemplateId = v));
      });
    this.selectedTemplateId = this.templates[0]?.id ?? '';

    new Setting(el)
      .setName('输出目录（留空使用默认）')
      .addText((t) =>
        t
          .setValue(this.settings().paths.outputFolder)
          .onChange((v) => (this.outputFolder = v))
      );

    const btn = el.createEl('button', { text: '🚀 开始导入' });
    btn.addEventListener('click', () => {
      this.step = 4;
      void this.render();
    });
    const nav = el.createEl('div');
    this.addBackButton(nav);
  }

  private async renderStep4(el: HTMLElement): Promise<void> {
    el.createEl('h4', { text: '进度执行' });
    const status = el.createEl('div', { text: '准备导入…' });
    const file = this.selectedFile;
    if (!file || !this.selectedTemplateId) {
      status.setText('缺少文件或模板，请返回');
      return;
    }

    const result = await this.service.importFile(this.selectedTemplateId, file.path, {
      onProgress: (p) => {
        status.setText(`正在处理 ${p.done}/${p.total}…`);
      }
    });

    el.empty();
    el.createEl('h4', { text: result.success ? '✅ 导入完成' : '❌ 导入失败' });
    el.createEl('div', {
      text: `共 ${result.totalRecords} 条 · 成功 ${result.succeeded} · 跳过 ${result.skipped} · 失败 ${result.failed}`
    });
    el.createEl('div', { text: `⏱️ 耗时: ${(result.duration / 1000).toFixed(1)} 秒` });
    if (result.errors.length > 0) {
      el.createEl('div', { text: '错误详情:' });
      for (const e of result.errors) el.createEl('div', { text: `❌ ${e.message}` });
    }
    const close = el.createEl('button', { text: '✅ 完成' });
    close.addEventListener('click', () => this.close());
  }

  private addBackButton(el: HTMLElement): void {
    const back = el.createEl('button', { text: '← 返回' });
    back.addEventListener('click', () => {
      this.step = (this.step - 1) as Step;
      void this.render();
    });
  }
}
