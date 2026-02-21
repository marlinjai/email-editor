import { createContext, useContext, type ReactNode } from 'react';
import type { User, WorkspaceRole } from '../types';

interface AuthContextValue {
  user: User;
  role: WorkspaceRole;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export interface AuthProviderProps {
  user: User;
  role: WorkspaceRole;
  children: ReactNode;
}

export function AuthProvider({ user, role, children }: AuthProviderProps) {
  return (
    <AuthContext.Provider value={{ user, role }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
