'use client';

import { unparse } from 'papaparse';

const formatValue = (value: any): any => {
  if (Array.isArray(value)) return value.join('; ');
  if (typeof value === 'object' && value !== null) return JSON.stringify(value);
  return value;
};

const flattenObject = (obj: Record<string, any>, prefix = ''): Record<string, any> =>
  Object.keys(obj).reduce((acc, key) => {
    const newKey = prefix ? `${prefix}_${key}` : key;
    const value = obj[key];
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      Object.assign(acc, flattenObject(value, newKey));
    } else { acc[newKey] = formatValue(value); }
    return acc;
  }, {} as Record<string, any>);

export async function exportUserData(): Promise<string | null> {
  const cadences = await fetch('/api/cadences').then(r => r.json());
  if (!cadences?.length) return null;

  const allLogs: any[] = [], allExps: any[] = [];
  for (const c of cadences) {
    const [logs, exps] = await Promise.all([
      fetch(`/api/action-logs?cadenceId=${c.id}&limit=10000`).then(r=>r.json()),
      fetch(`/api/expenses?cadenceId=${c.id}`).then(r=>r.json()),
    ]);
    logs.forEach((l: any) => allLogs.push({ firm: c.firmName, ...l }));
    exps.forEach((e: any) => allExps.push({ firm: c.firmName, ...e }));
  }
  if (!allLogs.length && !allExps.length) return null;
  const parts: string[] = [];
  if (allLogs.length) { parts.push('--- Журнал дій ---'); parts.push(unparse(allLogs.map(r=>flattenObject(r)))); }
  if (allExps.length) { parts.push('\n--- Витрати ---'); parts.push(unparse(allExps.map(r=>flattenObject(r)))); }
  return parts.join('\n');
}
