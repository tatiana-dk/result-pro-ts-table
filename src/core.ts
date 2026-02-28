// core.ts

import type { Column, TableConfig, TableState, ProcessedResult, ColumnId, Primitive } from "./types.ts";

/** 
 * Применяет глобальный поиск по всем searchable колонкам
 * - Пустой поиск → возвращает исходный массив без изменений
 * - Иначе оставляет только те строки, где хотя бы в одной searchable колонке 
 *   найдена подстрока (без учёта регистра)
 */
export function applyGlobalSearch<T>(
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
function getCellValue<T>(row: T, col: Column<T>): Primitive {
  if (typeof col.accessor === "function") {
    return col.accessor(row);
  }
  const value = row[col.accessor];
  return value as Primitive;
}

/**
 * Применяет все активные фильтры к строкам
 * Если фильтры выключены в конфиге — возвращает исходный массив без изменений
 */
export function applyFilters<T>(
  rows: T[],
  columns: Column<T>[],
  filters: Record<ColumnId, any>,
  filterable: boolean = true
): T[] {
  // Если фильтры полностью выключены в конфиге → ничего не делаем
  if (!filterable) {
    return rows;
  }

  // Если нет активных фильтров → тоже пропускаем
  if (Object.keys(filters).length === 0) {
    return rows;
  }

  return rows.filter((row) => {
    // Для каждой активной колонки с фильтром
    return Object.entries(filters).every(([colId, filterValue]) => {
      const column = columns.find((c) => c.id === colId);
      
      if (!column || !column.filterable) return true; // нет такой колонки или фильтр запрещён

      const cellValue = getCellValue(row, column);

      // Если значение в ячейке null/undefined → считаем не прошедшим фильтр
      if (cellValue == null) {
        return false;
      }

      switch (column.filterable.type) {
        case "text":
          if (column.filterable.mode !== "contains") return true;
          if (!filterValue || typeof filterValue !== "string") return true;

          const query = String(filterValue).trim().toLowerCase();
          if (!query) return true;

          return String(cellValue).toLowerCase().includes(query);

        case "number":
          if (column.filterable.mode !== "range") return true;

          const range = filterValue as { min?: number; max?: number } | undefined;
          if (!range) return true;

          const numValue = Number(cellValue);
          if (isNaN(numValue)) return false;

          let passes = true;

          if (range.min !== undefined && range.min !== null) {
            passes = passes && numValue >= range.min;
          }

          if (range.max !== undefined && range.max !== null) {
            passes = passes && numValue <= range.max;
          }

          return passes;

        case "boolean":
          if (typeof filterValue !== "boolean") return true;
          return cellValue === filterValue;

        case "date":
          if (!filterValue || typeof filterValue !== "object") return true;

          const dateValue = getCellValue(row, column);
          if (!dateValue || typeof dateValue !== "string") return false;

          // Ожидаем ISO-строку в ячейке, например "1894-01-01"
          const cellDate = new Date(dateValue);
          if (isNaN(cellDate.getTime())) return false; // неверная дата

          const mode = column.filterable.mode;

          if (mode === "before") {
            const before = filterValue.max ? new Date(filterValue.max) : null;
            if (!before || isNaN(before.getTime())) return true;
            return cellDate <= before;   // включаем сам день
          }

          if (mode === "after") {
            const after = filterValue.min ? new Date(filterValue.min) : null;
            if (!after || isNaN(after.getTime())) return true;
            return cellDate >= after;    // включаем сам день
          }

          if (mode === "range") {
            let ok = true;
            if (filterValue.min) {
              const after = new Date(filterValue.min);
              if (!isNaN(after.getTime())) ok = ok && cellDate >= after;
            }
            if (filterValue.max) {
              const before = new Date(filterValue.max);
              if (!isNaN(before.getTime())) ok = ok && cellDate <= before;
            }
            return ok;
          }

          return true;

        // case "select":  // можно добавить позже
        //   ...

        default:
          return true; // неизвестный тип фильтра — пропускаем
      }
    });
  });
}

/**
 * Применяет сортировку по одной колонке, если она включена
 * Использует стабильную сортировку (сохраняет порядок равных элементов)
 */
export function applySort<T>(
  rows: T[],
  columns: Column<T>[],
  sort: TableState["sort"]
): T[] {
  // Нет активной сортировки или сортировка выключена → возвращаем как есть
  if (!sort.columnId || !sort.direction) {
    return rows;
  }

  // Находим колонку
  const column = columns.find(c => c.id === sort.columnId);
  if (!column || !column.sortable) {
    return rows;
  }

  // Делаем копию, чтобы не мутировать исходный массив
  return [...rows].sort((a, b) => {
    const va = getCellValue(a, column);
    const vb = getCellValue(b, column);

    // Обработка null/undefined — считаем их меньше любых значений
    if (va == null && vb == null) return 0;
    if (va == null) return 1;   // null идёт в конец при asc
    if (vb == null) return -1;

    // Приведение к сравнимому виду
    let aVal = va;
    let bVal = vb;

    // Для строк — без учёта регистра
    if (typeof aVal === "string" && typeof bVal === "string") {
      aVal = aVal.toLowerCase();
      bVal = bVal.toLowerCase();
    }

    // Для чисел и дат — обычное сравнение
    // (даты как строки ISO уже сравниваются лексикографически корректно)

    if (aVal < bVal) return sort.direction === "asc" ? -1 : 1;
    if (aVal > bVal) return sort.direction === "asc" ? 1 : -1;
    return 0;
  });
}

export function applyPagination<T>(
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

export function getProcessedData<T>(
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

  if (config.sortable && state.sort.columnId && state.sort.direction) {
    result = applySort(result, columns, state.sort);
  }

  if (config.paginated) {
    const pageSize = state.pageSize || config.defaultPageSize || 20;
    const { pageRows, totalPages } = applyPagination(result, state.page, pageSize);

    // Если текущая страница больше, чем есть всего — переходим на последнюю
    const safePage = Math.min(state.page, totalPages);

    return {
      visibleRows: pageRows,
      totalPages,
      currentPage: safePage,
      pageSize,
    };
  }

  return {
    visibleRows: result,
    totalPages: 1,
    currentPage: 1,
    pageSize: state.pageSize || 20,
  };
}

// При клике на заголовок колонки с id = clickedColumnId
// function handleHeaderClick(clickedColumnId: ColumnId) {
//   setState(prev => {
//     const current = prev.sort;

//     // Если кликнули по уже активной колонке
//     if (current.columnId === clickedColumnId) {
//       if (current.direction === "asc") {
//         return { ...prev, sort: { columnId: clickedColumnId, direction: "desc" } };
//       }
//       if (current.direction === "desc") {
//         return { ...prev, sort: { columnId: null, direction: null } }; // сброс
//       }
//       return { ...prev, sort: { columnId: clickedColumnId, direction: "asc" } };
//     }

//     // Клик по новой колонке → сразу asc
//     return { ...prev, sort: { columnId: clickedColumnId, direction: "asc" } };
//   });
// }