// main.ts

import { getProcessedData } from "./core.ts";
import { samplePaintings } from "./data.ts";
import { debounce, getCellValue } from "./utils.ts";
import type { Painting } from "./data.ts";
import type { ColumnId, Column, TableConfig } from "./types.ts";

const STORAGE_KEY = 'paintings-table-state';

function saveStateToStorage() {
  const serializableState = {
    search: state.search,
    sort: state.sort,
    filters: state.filters,
    page: state.page,
    pageSize: state.pageSize,
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
      pageSize: [10, 20, 50, 100].includes(Number(parsed.pageSize))
        ? Number(parsed.pageSize)
        : 20,
    };
  } catch (err) {
    console.warn('Ошибка чтения состояния из localStorage', err);
    return null;
  }
}

// Вспомогательные проверки
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

function syncUIWithState() {
  // Поиск
  const searchInput = document.getElementById("search") as HTMLInputElement;
  searchInput.value = state.search || "";

  // Фильтры — художник
  const artistInput = document.getElementById("filter-artist") as HTMLInputElement;
  artistInput.value = (state.filters.artist as string) || "";

  // Фильтры — год (диапазон)
  const yearMinInput = document.getElementById("filter-year-min") as HTMLInputElement;
  const yearMaxInput = document.getElementById("filter-year-max") as HTMLInputElement;

  const yearFilter = state.filters.year as { min?: number; max?: number } | undefined;

  yearMinInput.value = yearFilter?.min != null ? String(yearFilter.min) : "";
  yearMaxInput.value = yearFilter?.max != null ? String(yearFilter.max) : "";

  // Фильтр — public domain
  const pubSelect = document.getElementById("filter-public") as HTMLSelectElement;
  if (state.filters.isPublicDomain === true) {
    pubSelect.value = "true";
  } else if (state.filters.isPublicDomain === false) {
    pubSelect.value = "false";
  } else {
    pubSelect.value = "";
  }
}

interface AppState {
  search: string;
  sort: { columnId: ColumnId | null; direction: "asc" | "desc" | null };
  filters: Record<ColumnId, any>;
  page: number;
  pageSize: number;
}

let state: AppState = {
  search: "",
  sort: { columnId: null, direction: null },
  filters: {},
  page: 1,
  pageSize: 20,
};

const columns: Column<typeof samplePaintings[number]>[] = [
  { id: "title", header: "Название", accessor: "title", searchable: true, sortable: true, filterable: { type: "text", mode: "contains" } },
  { id: "artist", header: "Художник", accessor: "artist", searchable: true, sortable: true, filterable: { type: "text", mode: "contains" } },
  { id: "year", header: "Год", accessor: "year", sortable: true, filterable: { type: "date", mode: "range" } },
  { id: "medium", header: "Техника", accessor: "medium", searchable: true, filterable: { type: "text", mode: "contains" } },
  { id: "isPublicDomain", header: "Public Domain", accessor: "isPublicDomain", sortable: true, filterable: { type: "boolean" } },
];

let config: TableConfig = {
  searchable: true,
  sortable: true,
  filterable: true,
  paginated: true,
  pageSizeOptions: [10, 20, 50, 100],
};

function renderHeaders(columns: Column<Painting>[]) {
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
    if (state.sort.columnId === col.id && state.sort.direction) {
      th.classList.add(state.sort.direction);
    }

    theadRow.appendChild(th);
  });
}

function renderRows(visibleRows: Painting[], columns: Column<Painting>[]) {
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

const debouncedSearch = debounce((value: string) => {
  state.search = value.trim();
  runPipeline();
}, 350);

document.getElementById("search")!.addEventListener("input", (e) => {
  const input = e.target as HTMLInputElement;
  debouncedSearch(input.value);
});

function updateFilters() {
  state.filters = {};

  const artistInput = document.getElementById("filter-artist") as HTMLInputElement;
  if (artistInput.value.trim()) {
    state.filters.artist = artistInput.value.trim();
  }

  const minYear = (document.getElementById("filter-year-min") as HTMLInputElement).value;
  const maxYear = (document.getElementById("filter-year-max") as HTMLInputElement).value;

  if (minYear || maxYear) {
    state.filters.year = {};
    if (minYear) state.filters.year.min = String(minYear);
    if (maxYear) state.filters.year.max = String(maxYear);
  }

  const pubSelect = document.getElementById("filter-public") as HTMLSelectElement;
  const pubValue = pubSelect.value;
  if (pubValue === "true") state.filters.isPublicDomain = true;
  if (pubValue === "false") state.filters.isPublicDomain = false;

  runPipeline();
}

document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".filters input, .filters select").forEach((el) => {
  const debouncedUpdate = debounce(updateFilters, 300);
  el.addEventListener("input", debouncedUpdate);
  el.addEventListener("change", debouncedUpdate);
});

document.getElementById("clear-filters")!.addEventListener("click", () => {
  (document.querySelectorAll(".filters input, .filters select") as NodeListOf<HTMLInputElement | HTMLSelectElement>).forEach(
    (el) => (el.value = "")
  );
  state.filters = {};
  runPipeline();
});

function handleSortClick(colId: ColumnId) {
  const col = columns.find((c) => c.id === colId);
  if (!col?.sortable) return;

  if (state.sort.columnId === colId) {
    if (state.sort.direction === "asc") {
      state.sort.direction = "desc";
    } else if (state.sort.direction === "desc") {
      state.sort = { columnId: null, direction: null };
    } else {
      state.sort.direction = "asc";
    }
  } else {
    state.sort = { columnId: colId, direction: "asc" };
  }

  runPipeline();
}

document.getElementById("prev")!.addEventListener("click", () => {
  if (state.page > 1) {
    state.page--;
    runPipeline();
  }
});

document.getElementById("next")!.addEventListener("click", () => {
  const totalPages = getTotalPages();
  if (state.page < totalPages) {
    state.page++;
    runPipeline();
  }
});

document.getElementById("page-size")!.addEventListener("change", (e) => {
  const select = e.target as HTMLSelectElement;
  state.pageSize = Number(select.value);
  state.page = 1;
  runPipeline();
});

document.getElementById("reset-all")!.addEventListener("click", () => {
  if (!confirm("Сбросить все настройки таблицы?")) return;

  localStorage.removeItem(STORAGE_KEY);

  // Возвращаем начальное состояние
  state = {
    search: "",
    sort: { columnId: null, direction: null },
    filters: {},
    page: 1,
    pageSize: 20,
  };

  // Очищаем поля ввода
  (document.getElementById("search") as HTMLInputElement).value = "";
  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>(".filters input, .filters select").forEach(el => {
    el.value = "";
  });

  runPipeline();
});

function getTotalPages(): number {
  const processed = getProcessedData(samplePaintings, columns, config, state);
  return processed.totalPages;
}

function runPipeline() {
  const processed = getProcessedData(samplePaintings, columns, config, state);

  renderRows(processed.visibleRows as Painting[], columns);

  // Обновляем индикаторы сортировки
  document.querySelectorAll<HTMLTableCellElement>("th.sortable").forEach((th) => {
    th.classList.remove("asc", "desc");
    if (th.dataset.col === state.sort.columnId && state.sort.direction) {
      th.classList.add(state.sort.direction);
    }
  });

  // Обновляем пагинацию
  const totalPages = processed.totalPages;
  document.getElementById("page-info")!.textContent = `Страница ${processed.currentPage ?? state.page} из ${totalPages || 1}`;

  (document.getElementById("prev") as HTMLButtonElement).disabled = state.page <= 1;
  (document.getElementById("next") as HTMLButtonElement).disabled = state.page >= totalPages;

  saveStateToStorage();
}

document.addEventListener("DOMContentLoaded", () => {
  const savedState = loadStateFromStorage();

  if (savedState) {
    state = { ...state, ...savedState };
    
    // Дополнительная защита: если страница слишком большая — сбросим на 1
    // (будет скорректировано в runPipeline после вычисления totalPages)
    if (state.page < 1) state.page = 1;
  }

  syncUIWithState();

  renderHeaders(columns);
  runPipeline();
});