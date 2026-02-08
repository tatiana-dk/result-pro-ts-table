// main.ts

import { getProcessedData } from "./core.ts";
import { samplePaintings } from "./data.ts";
import type { Column, TableConfig, TableState } from "./types.ts";

const columns: Column<typeof samplePaintings[number]>[] = [
  { id: "title", header: "Название", accessor: "title", searchable: true, sortable: true },
  { id: "artist", header: "Художник", accessor: "artist", searchable: true, sortable: true },
  { id: "year", header: "Год", accessor: "year", sortable: true },
  { id: "medium", header: "Техника", accessor: "medium", searchable: true },
  { id: "isPublicDomain", header: "Public Domain", accessor: "isPublicDomain", sortable: true },
];

const config: TableConfig = {
  searchable: true,
  sortable: true,
  filterable: true,
  paginated: true,
  pageSize: 10,
};

const initialState: TableState = {
  search: "",
  sort: { columnId: null, direction: null },
  filters: {},
  page: 1,
};

function runDemo() {
  const result = getProcessedData(samplePaintings, columns, config, initialState);
  console.log("Видимых строк:", result.visibleRows.length);
  console.log("Всего страниц:", result.totalPages);
  console.log("Первые строки:", result.visibleRows.slice(0, 3));
}

runDemo();