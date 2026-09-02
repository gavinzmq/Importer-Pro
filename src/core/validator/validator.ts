import { DataRecord, ValidationResult, ValidationRule, ValidatorFn } from '../../types';
import { isValidID } from '../../helpers/builtin';

/** 校验引擎（architecture §2.7 Validator） */
export interface IValidator {
  register(name: string, validator: ValidatorFn): void;
  list(): string[];
  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult;
}

export class Validator implements IValidator {
  private custom = new Map<string, ValidatorFn>();

  register(name: string, validator: ValidatorFn): void {
    this.custom.set(name, validator);
  }

  list(): string[] {
    return [...BUILTIN_RULES, ...this.custom.keys()];
  }

  validate(record: DataRecord, rules: ValidationRule[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    for (const rule of rules) {
      const value = record[rule.field];
      const valid = this.checkRule(rule, value, record);
      if (valid === false) {
        errors.push(rule.message || `${rule.field} 校验失败`);
      } else if (valid === 'warn') {
        warnings.push(rule.message || `${rule.field} 存在警告`);
      }
    }

    const data: DataRecord = {
      ...record,
      _valid: errors.length === 0,
      _errors: errors,
      _warnings: warnings,
      _status: errors.length > 0 ? 'error' : warnings.length > 0 ? 'warning' : 'valid'
    };
    return { valid: errors.length === 0, errors, warnings, data };
  }

  private checkRule(rule: ValidationRule, value: unknown, record: DataRecord): boolean | 'warn' {
    switch (rule.type) {
      case 'required':
        return value !== undefined && value !== null && value !== '';
      case 'unique':
        return true; // 唯一性在批次级校验（见 Pipeline）
      case 'id-card':
        return value === undefined || value === '' || isValidID(String(value));
      case 'email':
        return value === undefined || value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value));
      case 'phone':
        return value === undefined || value === '' || /^1[3-9]\d{9}$/.test(String(value));
      case 'date':
        return value === undefined || value === '' || !Number.isNaN(Date.parse(String(value)));
      case 'length': {
        const len = String(value ?? '').length;
        const min = Number(rule.options?.min ?? 0);
        const max = Number(rule.options?.max ?? Infinity);
        return len >= min && len <= max;
      }
      case 'range': {
        const n = Number(value);
        return n >= Number(rule.options?.min ?? -Infinity) && n <= Number(rule.options?.max ?? Infinity);
      }
      default: {
        const fn = this.custom.get(rule.type);
        if (fn) {
          const r = fn(record) as ValidationResult | boolean | Promise<ValidationResult>;
          if (typeof r === 'boolean') return r;
          if (r && typeof (r as Promise<ValidationResult>).then === 'function') return true;
          return (r as ValidationResult).valid;
        }
        return true;
      }
    }
  }
}

export const BUILTIN_RULES = ['required', 'unique', 'id-card', 'email', 'phone', 'date', 'length', 'range'];
