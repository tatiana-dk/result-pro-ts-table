// main.ts

import { getProcessedData } from "./core.ts";
import { samplePaintings } from "./data.ts";
import { debounce, getCellValue } from "./utils.ts";
import type { Painting } from "./data.ts";
import type { ColumnId, Column, TableConfig } from "./types.ts";

// Типы и константы
const STORAGE_KEY = 'paintings-table-state' as const;
const PAGE_SIZE_DEFAULT: number = 20 as const;
const PAGE_SIZE_OPTIONS: number[] = [10, 20, 50, 100] as const;

const filterBindings: FilterBinding[] = [
  {
    id: "filter-artist",
    key: "artist",
    getValue: el => (el as HTMLInputElement).value.trim() || undefined,
    setValue: (el, v) => { el.value = typeof v === "string" ? v : ""; },
  },
  {
    id: "filter-year-min",
    key: "year",
    getValue: el => {
      const v = (el as HTMLInputElement).value;
      return v ? { min: String(v) } : undefined;
    },
    setValue: (el, v: { min?: string | number }) => {
      const min = v?.min;
      el.value = min != null ? String(min) : "";
    },
  },
  {
    id: "filter-year-max",
    key: "year",
    getValue: el => {
      const v = (el as HTMLInputElement).value;
      return v ? { max: String(v) } : undefined;
    },
    setValue: (el, v: { max?: string | number }) => {
      const max = v?.max;
      el.value = max != null ? String(max) : "";
    },
  },
  {
    id: "filter-public",
    key: "isPublicDomain",
    getValue: el => {
      const v = (el as HTMLSelectElement).value;
      if (v === "true") return true;
      if (v === "false") return false;
      return undefined;
    },
    setValue: (el, value) => {
      if (value === true) {
        el.value = "true";
      } else if (value === false) {
        el.value = "false";
      } else {
        el.value = "";
      }
    },
  },
] as const;

type RowType = Painting;

type FilterBinding = {
  id: string;
  key: ColumnId;
  getValue: (el: HTMLInputElement | HTMLSelectElement) => any;
  setValue: (el: HTMLInputElement | HTMLSelectElement, value: any) => void;
};
interface AppState {
  search: string;
  sort: { columnId: ColumnId | null; direction: "asc" | "desc" | null };
  filters: Record<ColumnId, any>;
  page: number;
  pageSize: number;
}

// Контекст приложения
const app = {
  state: {
    search: "",
    sort: { columnId: null, direction: null } as AppState["sort"],
    filters: {} as Record<ColumnId, any>,
    page: 1,
    pageSize: PAGE_SIZE_DEFAULT,
  } satisfies AppState,

  columns: [
    { id: "title", header: "Название", accessor: "title", searchable: true, sortable: true, filterable: { type: "text", mode: "contains" } },
    { id: "artist", header: "Художник", accessor: "artist", searchable: true, sortable: true, filterable: { type: "text", mode: "contains" } },
    { id: "year", header: "Год", accessor: "year", sortable: true, filterable: { type: "date", mode: "range" } },
    { id: "medium", header: "Техника", accessor: "medium", searchable: true, filterable: { type: "text", mode: "contains" } },
    { id: "isPublicDomain", header: "Public Domain", accessor: "isPublicDomain", sortable: true, filterable: { type: "boolean" } },
  ] as Column<RowType>[],

  config: {
    searchable: true,
    sortable: true,
    filterable: true,
    paginated: true,
    pageSizeOptions: PAGE_SIZE_OPTIONS,
  } satisfies TableConfig,
};

// ─── Хелперы ──────────────────────────────────────────────
function syncUIWithState() {
  // Поиск (отдельно, т.к. не фильтр по колонке)
  const searchInput = document.getElementById("search") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = app.state.search || "";
  }

  // Размер страницы (отдельно, т.к. не фильтр по колонке)
  const pageSizeInput = document.getElementById('page-size') as HTMLSelectElement | null;
  if (pageSizeInput) {
    pageSizeInput.value = String(app.state.pageSize) || "";
  }

  filterBindings.forEach(({ id, key, setValue }) => {
    const element = document.getElementById(id) as
      | HTMLInputElement
      | HTMLSelectElement
      | null;

    if (!element) {
      console.warn(`Элемент с id "${id}" не найден`);
      return;
    }

    const value = app.state.filters[key];
    setValue(
      element as HTMLInputElement | HTMLSelectElement,
      value
    );
  });
}

function saveStateToStorage() {
  const serializableState = {
    search: app.state.search,
    sort: app.state.sort,
    filters: app.state.filters,
    page: app.state.page,
    pageSize: app.state.pageSize,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializableState));
  } catch (err) {
    console.warn('Не удалось сохранить состояние в localStorage', err);
  }
}

function loadStateFromStorage(): Partial<AppState> | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);

    // Минимальная проверка структуры
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof parsed.page !== 'number' ||
      typeof parsed.pageSize !== 'number'
    ) {
      return null;
    }

    return {
      search: typeof parsed.search === 'string' ? parsed.search : "",
      sort: isValidSort(parsed.sort) ? parsed.sort : { columnId: null, direction: null },
      filters: isValidFilters(parsed.filters) ? parsed.filters : {},
      page: Math.max(1, Number(parsed.page) || 1),
      pageSize: PAGE_SIZE_OPTIONS.includes(Number(parsed.pageSize))
        ? Number(parsed.pageSize)
        : PAGE_SIZE_DEFAULT,
    };
  } catch (err) {
    console.warn('Ошибка чтения состояния из localStorage', err);
    return null;
  }
}

function isValidSort(sort: any): sort is AppState['sort'] {
  return (
    sort &&
    (sort.columnId === null || typeof sort.columnId === 'string') &&
    (sort.direction === null || sort.direction === 'asc' || sort.direction === 'desc')
  );
}

function isValidFilters(filters: any): filters is Record<string, any> {
  return typeof filters === 'object' && filters !== null;
}

// ─── Рендеринг ────────────────────────────────────────────
function renderHeaders(columns: Column<RowType>[]) {
  const theadRow = document.querySelector<HTMLTableRowElement>("#paintings thead tr")!;
  theadRow.innerHTML = "";

  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.header;
    th.dataset.col = col.id;

    if (col.sortable) {
      th.classList.add("sortable");
      th.addEventListener("click", () => handleSortClick(col.id));
    }

    // индикатор текущей сортировки
    if (app.state.sort.columnId === col.id && app.state.sort.direction) {
      th.classList.add(app.state.sort.direction);
    }

    theadRow.appendChild(th);
  });
}

function renderRows(visibleRows: RowType[], columns: Column<RowType>[]) {
  const tbody = document.getElementById("table-body")!;
  tbody.innerHTML = "";

  visibleRows.forEach((row) => {
    const tr = document.createElement("tr");

    columns.forEach((col) => {
      const td = document.createElement("td");
      const rawValue = getCellValue(row, col);

      if (col.id === "isPublicDomain") {
        td.textContent = rawValue ? "Да" : "Нет";
      } else if (col.id === "year" && typeof rawValue === "number") {
        td.textContent = String(rawValue);
      } else {
        td.textContent = rawValue != null ? String(rawValue) : "—";
      }

      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

// ─── Обработчики событий ──────────────────────────────────
const debouncedSearch = debounce((value: string) => {
  app.state.search = value.trim();
  runPipeline();
}, 350);

document.getElementById("search")!.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  debouncedSearch(input.value);
});

document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".filters input, .filters select").forEach((el) => {
  const debouncedUpdate = debounce(updateFilters, 300);
  el.addEventListener("input", debouncedUpdate);
  el.addEventListener("change", debouncedUpdate);
});

document.getElementById("clear-filters")!.addEventListener("click", () => {
  (document.querySelectorAll(".filters input, .filters select") as NodeListOf<HTMLInputElement | HTMLSelectElement>).forEach(
    (el) => (el.value = "")
  );
  app.state.filters = {};
  runPipeline();
});

document.getElementById("prev")!.addEventListener("click", () => {
  if (app.state.page > 1) {
    app.state.page--;
    runPipeline();
  }
});

document.getElementById("next")!.addEventListener("click", () => {
  const totalPages = getTotalPages();
  if (app.state.page < totalPages) {
    app.state.page++;
    runPipeline();
  }
});

document.getElementById("page-size")!.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  app.state.pageSize = Number(select.value);
  app.state.page = 1;
  runPipeline();
});

document.getElementById("reset-all")!.addEventListener("click", () => {
  if (!confirm("Сбросить все настройки таблицы?")) return;

  localStorage.removeItem(STORAGE_KEY);

  // Возвращаем начальное состояние
  app.state = {
    search: "",
    sort: { columnId: null, direction: null },
    filters: {},
    page: 1,
    pageSize: PAGE_SIZE_DEFAULT,
  };

  // Очищаем поля ввода
  const searchInput = document.getElementById("search") as HTMLInputElement | null;
  if (searchInput) {
    searchInput.value = "";
  }
  
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".filters input, .filters select").forEach(el => {
    el.value = "";
  });

  // Сбрасываем размер страницы
  const pageSizeInput = document.getElementById('page-size') as HTMLSelectElement | null;
  if (pageSizeInput) {
    pageSizeInput.value = String(PAGE_SIZE_DEFAULT);
  }

  runPipeline();
});

// ─── Главный цикл ─────────────────────────────────────────
function updateFilters() {
  const newFilters: Record<ColumnId, any> = {};

  filterBindings.forEach(({ id, key, getValue }) => {
    const el = document.getElementById(id) as HTMLInputElement | HTMLSelectElement;
    const value = getValue(el);
    if (value !== undefined) {
      const isSecondYear = key in newFilters && typeof value === 'object';
      if (isSecondYear) {
        newFilters[key] = { ...newFilters[key], ...value };
      } else {
        newFilters[key] = value;
      }
    }
  });

  app.state.filters = newFilters;

  runPipeline();
}

function handleSortClick(colId: ColumnId) {
  const col = app.columns.find((c) => c.id === colId);
  if (!col?.sortable) return;

  if (app.state.sort.columnId === colId) {
    if (app.state.sort.direction === "asc") {
      app.state.sort.direction = "desc";
    } else if (app.state.sort.direction === "desc") {
      app.state.sort = { columnId: null, direction: null };
    } else {
      app.state.sort.direction = "asc";
    }
  } else {
    app.state.sort = { columnId: colId, direction: "asc" };
  }

  runPipeline();
}

function getTotalPages(): number {
  const processed = getProcessedData(samplePaintings, app.columns, app.config, app.state);
  return processed.totalPages;
}

function runPipeline() {
  const processed = computeVisibleData();
  updateUI(processed);
}

function computeVisibleData() {
  return getProcessedData(samplePaintings, app.columns, app.config, app.state);
}

function updateUI(processed: ReturnType<typeof getProcessedData>) {
  renderRows(processed.visibleRows as RowType[], app.columns);

  updateSortIndicators();
  updatePagination(processed);
  saveStateToStorage();
}

function updateSortIndicators() {
  document.querySelectorAll<HTMLTableCellElement>("th.sortable").forEach(th => {
    th.classList.remove("asc", "desc");
    if (th.dataset.col === app.state.sort.columnId && app.state.sort.direction) {
      th.classList.add(app.state.sort.direction);
    }
  });
}

function updatePagination(processed: any) {
  const info = document.getElementById("page-info")!;
  const prev = document.getElementById("prev") as HTMLButtonElement;
  const next = document.getElementById("next") as HTMLButtonElement;

  const page = processed.currentPage ?? app.state.page;
  const total = processed.totalPages;

  info.textContent = `Страница ${page} из ${total || 1}`;
  prev.disabled = page <= 1;
  next.disabled = page >= total;
}

// ─── Инициализация ────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  const savedState = loadStateFromStorage();

  if (savedState) {
    app.state = { ...app.state, ...savedState };
    
    // Дополнительная защита: если страница слишком большая — сбросим на 1
    // (будет скорректировано в runPipeline после вычисления totalPages)
    if (app.state.page < 1) app.state.page = 1;
  }

  syncUIWithState();

  renderHeaders(app.columns);
  runPipeline();
});