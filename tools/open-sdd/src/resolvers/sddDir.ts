import path from 'node:path';

export type SddDirOptions = {
  flag?: string;
  config?: string;
};

export const defaultSddDir = '.sdd';

export const resolveSddDir = (opts: SddDirOptions = {}): string => {
  const candidate = opts.flag ?? opts.config ?? defaultSddDir;

  if (!candidate || typeof candidate !== 'string') {
    throw new Error('sddDir must be a non-empty string');
  }

  // Reject absolute paths
  if (path.isAbsolute(candidate)) {
    throw new Error('sddDir must be a repository-relative path');
  }

  // Allowed characters: alphanumeric, dot, underscore, hyphen, slash
  // No spaces or other special characters
  const allowed = /^[A-Za-z0-9._\/-]+$/;
  if (!allowed.test(candidate)) {
    throw new Error('sddDir contains disallowed characters');
  }

  // Reject parent directory traversal
  const segments = candidate.split(/[\\/]+/);
  if (segments.some((s) => s === '..')) {
    throw new Error('sddDir must not contain parent traversal (..)');
  }

  const trimmed = candidate.replace(/[\\/]+$/, '');

  const normalized = trimmed.replace(/\/{2,}/g, '/');

  if (!normalized) {
    throw new Error('sddDir must be a non-empty string');
  }

  return normalized;
};
