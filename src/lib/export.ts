'use client';

// @ts-ignore - papaparse types are not properly declared
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const unparseAny = require('papaparse').unparse as any;

import type { ExportableRecord, FlattenedRecord, Cadence, ActionLog, Expense } from '@/lib/types';

const formatValue = (value: unknown): string | number | boolean | null => {
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value as string | number | boolean | null;
};

const flattenObject = (obj: ExportableRecord, prefix = ''): FlattenedRecord =>
  Object.keys(obj).reduce((acc, key) => {
    const newKey = prefix ? `${prefix}_${key}` : key;
    const value = obj[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(acc, flattenObject(value as ExportableRecord, newKey));
    } else { acc[newKey] = formatValue(value); }
    return acc;
  }, {} as FlattenedRecord);

export async function exportUserData(): Promise<string | null> {
  const cadences = await fetch('/api/cadences').then(r => r.json());
  if (!cadences?.length) return null;

  const allLogs: (ActionLog & { firm: string })[] = [], allExps: (Expense & { firm: string })[] = [];
  for (const c of cadences) {
    const [logs, exps] = await Promise.all([
      fetch(`/api/action-logs?cadenceId=${c.id}&limit=10000`).then(r=>r.json()),
      fetch(`/api/expenses?cadenceId=${c.id}`).then(r=>r.json()),
    ]);
    logs.forEach((l: ActionLog) => allLogs.push({ firm: c.firmName, ...l }));
    exps.forEach((e: Expense) => allExps.push({ firm: c.firmName, ...e }));
  }
  if (!allLogs.length && !allExps.length) return null;
  const parts: string[] = [];
  if (allLogs.length) { parts.push('--- Журнал дій ---'); parts.push(unparseAny(allLogs.map((r): FlattenedRecord => flattenObject(r as unknown as ExportableRecord)))); }
  if (allExps.length) { parts.push('\n--- Витрати ---'); parts.push(unparseAny(allExps.map((r): FlattenedRecord => flattenObject(r as unknown as ExportableRecord)))); }
  return parts.join('\n');
}
