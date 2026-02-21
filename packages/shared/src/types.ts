export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
}

export type WorkspaceRole = 'owner' | 'admin' | 'editor' | 'viewer';
