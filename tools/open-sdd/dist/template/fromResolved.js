import { createTemplateContext } from './context.js';
export const contextFromResolved = (resolved) => createTemplateContext(resolved.lang, resolved.sddDir, resolved.layout);
