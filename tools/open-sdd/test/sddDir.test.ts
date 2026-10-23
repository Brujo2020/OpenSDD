import { describe, it, expect } from 'vitest';
import { resolveSddDir, defaultSddDir } from '../src/resolvers/sddDir';

describe('resolveSddDir', () => {
  it('returns default when neither flag nor config is set', () => {
    expect(resolveSddDir({})).toBe(defaultSddDir);
  });

  it('prefers config over default', () => {
    expect(resolveSddDir({ config: 'docs/sdd' })).toBe('docs/sdd');
  });

  it('prefers flag over config', () => {
    expect(resolveSddDir({ flag: '.work/sdd', config: 'docs/sdd' })).toBe('.work/sdd');
  });

  it('trims trailing slashes', () => {
    expect(resolveSddDir({ flag: 'docs/sdd/' })).toBe('docs/sdd');
  });

  it('deduplicates consecutive slashes', () => {
    expect(resolveSddDir({ flag: '.sdd//specs//' })).toBe('.sdd/specs');
  });

  it('rejects absolute path', () => {
    expect(() => resolveSddDir({ flag: '/abs/path' })).toThrow();
  });

  it('rejects parent traversal', () => {
    expect(() => resolveSddDir({ flag: '../up' })).toThrow();
  });

  it('rejects disallowed characters', () => {
    expect(() => resolveSddDir({ flag: 'sdd bad' })).toThrow();
  });
});
