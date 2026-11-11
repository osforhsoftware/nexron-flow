import { useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

export const PAGE_SIZES = [10, 20, 50] as const;
export type PageSize = (typeof PAGE_SIZES)[number] | "all";

export type TablePager = {
  page: number;
  pageCount: number;
  pageSize: PageSize;
  total: number;
  from: number;
  to: number;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
};

export type PagedRows<T> = TablePager & {
  pageRows: T[];
};

const EMPTY: readonly never[] = [];

function parsePageSize(value: string): PageSize {
  if (value === "all") return "all";
  if (value === "20") return 20;
  if (value === "50") return 50;
  return 10;
}

function pageWindow(page: number, pageCount: number): Array<number | "gap"> {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, index) => index + 1);
  }
  const start = Math.max(2, page - 2);
  const end = Math.min(pageCount - 1, page + 2);
  const items: Array<number | "gap"> = [1];
  if (start > 2) items.push("gap");
  for (let n = start; n <= end; n += 1) items.push(n);
  if (end < pageCount - 1) items.push("gap");
  items.push(pageCount);
  return items;
}

export function usePagedRows<T>(
  rows: readonly T[] | null | undefined,
  resetKey: string | number = "",
): PagedRows<T> {
  const list = (rows ?? EMPTY) as readonly T[];
  const [pageSize, setPageSizeState] = useState<PageSize>(10);
  const [page, setPageState] = useState(1);
  const [seenKey, setSeenKey] = useState(resetKey);

  let nextPage = page;
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    nextPage = 1;
    setPageState(1);
  }

  const total = list.length;
  const perPage = pageSize === "all" ? Math.max(total, 1) : pageSize;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  if (nextPage > pageCount) {
    nextPage = pageCount;
    setPageState(pageCount);
  }

  const start = total === 0 ? 0 : (nextPage - 1) * perPage;
  const pageRows = list.slice(start, start + perPage) as T[];

  function setPage(value: number) {
    setPageState(Math.min(Math.max(1, Math.trunc(value)), pageCount));
  }

  function setPageSize(value: PageSize) {
    setPageSizeState(value);
    setPageState(1);
  }

  return {
    pageRows,
    page: nextPage,
    pageCount,
    pageSize,
    total,
    from: total === 0 ? 0 : start + 1,
    to: total === 0 ? 0 : start + pageRows.length,
    setPage,
    setPageSize,
  };
}

export function TablePagination({
  pager,
  className = "",
}: {
  pager: TablePager;
  className?: string;
}) {
  const { page, pageCount, pageSize, total, from, to, setPage, setPageSize } = pager;
  const pages = pageWindow(page, pageCount);

  return (
    <nav className={`table-pager${className ? ` ${className}` : ""}`} aria-label="Pagination">
      <div className="table-pager-left">
        <label className="table-pager-size">
          Rows
          <select
            aria-label="Rows per page"
            value={String(pageSize)}
            onChange={(event) => setPageSize(parsePageSize(event.target.value))}
          >
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="all">All</option>
          </select>
        </label>
        <span className="table-pager-meta">
          {total === 0 ? "Showing 0 of 0" : `Showing ${from}–${to} of ${total}`}
        </span>
      </div>
      <div className="table-pager-nav" role="group" aria-label="Pages">
        <button
          type="button"
          aria-label="First page"
          disabled={page <= 1}
          onClick={() => setPage(1)}
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
        >
          <ChevronLeft size={14} />
        </button>
        {pages.map((item, index) =>
          item === "gap" ? (
            <span className="table-pager-gap" key={`gap-${index}`} aria-hidden>
              …
            </span>
          ) : (
            <button
              type="button"
              key={item}
              aria-label={`Page ${item}`}
              aria-current={item === page ? "page" : undefined}
              onClick={() => setPage(item)}
            >
              {item}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => setPage(page + 1)}
        >
          <ChevronRight size={14} />
        </button>
        <button
          type="button"
          aria-label="Last page"
          disabled={page >= pageCount}
          onClick={() => setPage(pageCount)}
        >
          <ChevronsRight size={14} />
        </button>
      </div>
    </nav>
  );
}
