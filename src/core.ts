// core.ts

import type { Column, TableConfig, TableState, ProcessedResult, Row } from "./types.ts";
import { samplePaintings } from "./data.ts";

// ────────────────────────────────────────────────
// Функции обработки (пока заглушки)
// ────────────────────────────────────────────────

export function applyGlobalSearch<T extends Row>(
  rows: T[],
  columns: Column<T>[],
  search: string
): T[] {
  if (!search.trim()) return rows;
  // TODO: lower-case поиск по searchable колонкам
  return rows;
}

export function applyFilters<T extends Row>(
  rows: T[],
  columns: Column<T>[],
  filters: Record<string, any>
): T[] {
  // TODO: реализация фильтров
  return rows;
}

export function applySort<T extends Row>(
  rows: T[],
  columns: Column<T>[],
  sort: TableState["sort"]
): T[] {
  if (!sort.columnId || !sort.direction) return rows;
  // TODO: stable sort
  return rows;
}

export function applyPagination<T extends Row>(
  rows: T[],
  page: number,
  pageSize: number
): { pageRows: T[]; totalPages: number } {
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const pageRows = rows.slice(start, end);
  const totalPages = Math.ceil(rows.length / pageSize) || 1;

  return { pageRows, totalPages };
}

export function getProcessedData<T extends Row>(
  rows: T[],
  columns: Column<T>[],
  config: TableConfig,
  state: TableState
): ProcessedResult<T> {
  let result = [...rows];

  if (config.searchable && state.search) {
    result = applyGlobalSearch(result, columns, state.search);
  }

  if (config.filterable) {
    result = applyFilters(result, columns, state.filters);
  }

  if (config.sortable && state.sort.columnId) {
    result = applySort(result, columns, state.sort);
  }

  if (config.paginated) {
    const pageSize = config.pageSize ?? 20;
    const { pageRows, totalPages } = applyPagination(result, state.page, pageSize);
    return { visibleRows: pageRows, totalPages };
  }

  return { visibleRows: result, totalPages: 1 };
}