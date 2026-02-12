// types.ts

export type Primitive = string | number | boolean | null | undefined;

export type Row = Record<string, Primitive>;

export type ColumnId = string;

export interface Column<T = any> {
  id: ColumnId;
  header: string;
  accessor: keyof T | ((row: T) => Primitive);
  searchable?: boolean;
  sortable?: boolean;
  filterable?:
    | false
    | { type: "text"; mode: "contains" }
    | { type: "number"; mode: "range" }
    | { type: "select"; mode: "exact"; options: string[] }
    | { type: "boolean" }
    | { type: "date"; mode: "before" | "after" | "range" };
}

export interface TableConfig {
  searchable: boolean;
  sortable: boolean;
  filterable: boolean;
  paginated: boolean;
  pageSize?: number;
  pageSizeOptions?: number[];
  defaultPageSize?: number;
}

export interface TableState {
  search: string;
  sort: { columnId: ColumnId | null; direction: "asc" | "desc" | null };
  filters: Record<ColumnId, any>;
  page: number;
  pageSize: number;
}

export interface ProcessedResult<T> {
  visibleRows: T[];
  totalPages: number;
  currentPage: number;
  pageSize: number;
}