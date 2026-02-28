import type { Column, Primitive } from "./types.ts";

export function debounce<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return (...args: Parameters<T>) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export function getCellValue<T>(row: T, col: Column<T>): Primitive {
  if (typeof col.accessor === "function") {
    return col.accessor(row);
  }
  const value = (row as any)[col.accessor];
  return value as Primitive;
}