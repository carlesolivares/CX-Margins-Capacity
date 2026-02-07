import { useState, useMemo } from 'react';

export type SortDir = 'asc' | 'desc';

export interface SortConfig {
  key: string;
  dir: SortDir;
}

export function useSort<T>(data: T[], defaultKey?: string, defaultDir: SortDir = 'asc') {
  const [sort, setSort] = useState<SortConfig | null>(
    defaultKey ? { key: defaultKey, dir: defaultDir } : null,
  );

  const sorted = useMemo(() => {
    if (!sort) return data;
    const { key, dir } = sort;
    return [...data].sort((a, b) => {
      const av = (a as Record<string, unknown>)[key];
      const bv = (b as Record<string, unknown>)[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'number' && typeof bv === 'number') {
        return dir === 'asc' ? av - bv : bv - av;
      }
      const as = String(av).toLowerCase();
      const bs = String(bv).toLowerCase();
      return dir === 'asc' ? as.localeCompare(bs) : bs.localeCompare(as);
    });
  }, [data, sort]);

  const toggle = (key: string) => {
    setSort(prev => {
      if (prev?.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
      }
      return { key, dir: 'asc' };
    });
  };

  const sortIndicator = (key: string) => {
    if (sort?.key !== key) return ' ↕';
    return sort.dir === 'asc' ? ' ↑' : ' ↓';
  };

  return { sorted, sort, toggle, sortIndicator };
}
