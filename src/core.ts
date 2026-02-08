// core.ts

import type { Column, TableConfig, TableState, ProcessedResult, Row, Primitive } from "./types.ts";
import { samplePaintings } from "./data.ts";

/** 
 * Применяет глобальный поиск по всем searchable колонкам
 * - Пустой поиск → возвращает исходный массив без изменений
 * - Иначе оставляет только те строки, где хотя бы в одной searchable колонке 
 *   найдена подстрока (без учёта регистра)
 */
export function applyGlobalSearch<T extends Row>(
  rows: T[],
  columns: Column<T>[],
  search: string
): T[] {
  const query = search.trim().toLowerCase();

  if (!query) {
    return rows;
  }

  return rows.filter((row) => {
    return columns.some((col) => {
      if (!col.searchable) return false;

      const value = getCellValue(row, col);

      if (value === null || value === undefined) return false;

      const strValue = String(value).toLowerCase();

      return strValue.includes(query);
    });
  });
}

/**
 * Вспомогательная функция: достаёт значение ячейки по колонке
 * Поддерживает как прямой ключ, так и функцию accessor
 */
function getCellValue<T extends Row>(row: T, col: Column<T>): Primitive {
  if (typeof col.accessor === "function") {
    return col.accessor(row);
  }
  return row[col.accessor];
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