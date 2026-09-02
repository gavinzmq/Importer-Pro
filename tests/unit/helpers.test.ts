import { describe, expect, it } from 'vitest';
import { isValidID } from '../../src/helpers/builtin';

describe('身份证 Helper', () => {
  it('should validate 18-digit ID', () => {
    expect(isValidID('110101199003071234')).toBe(true);
    expect(isValidID('11010119900307123X')).toBe(false);
  });

  it('should reject invalid ID', () => {
    expect(isValidID('123')).toBe(false);
    expect(isValidID('11010119900307123A')).toBe(false);
  });
});
