import { useState, useEffect, useCallback, useRef } from 'react';
import type { PaginatedResult } from '../types';

interface UsePaginatedQueryOptions {
  pageSize?: number;
  initialPage?: number;
}

interface UsePaginatedQueryResult<T> {
  data: T[];
  loading: boolean;
  error: Error | null;
  page: number;
  setPage: (page: number) => void;
  totalPages: number;
  hasMore: boolean;
  refresh: () => void;
}

export function usePaginatedQuery<T>(
  queryFn: (page: number, pageSize: number) => Promise<PaginatedResult<T>>,
  options: UsePaginatedQueryOptions = {}
): UsePaginatedQueryResult<T> {
  const { pageSize = 25, initialPage = 1 } = options;

  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);

  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const fetchPage = useCallback(async (targetPage: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await queryFnRef.current(targetPage, pageSize);
      setData(result.data);
      setTotalPages(result.totalPages);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [pageSize]);

  useEffect(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  const refresh = useCallback(() => {
    fetchPage(page);
  }, [fetchPage, page]);

  return {
    data,
    loading,
    error,
    page,
    setPage,
    totalPages,
    hasMore: page < totalPages,
    refresh,
  };
}
