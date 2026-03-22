import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { DatabaseAdapter } from '@marlinjai/data-table-core';
import { StorageBrain } from '@marlinjai/storage-brain-sdk';
import { createStorageBrainClient, type StorageBrainConfig } from '../clients/storage-brain';
import { WorkspaceProvider } from './workspace';
import { AuthProvider } from './auth';
import type { User, WorkspaceRole } from '../types';

interface PlatformContextValue {
  databaseAdapter: DatabaseAdapter;
  storageBrain: StorageBrain;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export interface PlatformProviderProps {
  databaseAdapter: DatabaseAdapter;
  storageBrain: StorageBrainConfig;
  workspaceId: string;
  user: User;
  role: WorkspaceRole;
  children: ReactNode;
}

export function PlatformProvider({
  databaseAdapter,
  storageBrain: storageBrainConfig,
  workspaceId,
  user,
  role,
  children,
}: PlatformProviderProps) {
  const clients = useMemo(() => {
    const sbConfig = { ...storageBrainConfig, workspaceId };
    return {
      databaseAdapter,
      storageBrain: createStorageBrainClient(sbConfig),
    };
  }, [
    databaseAdapter,
    storageBrainConfig.apiKey,
    storageBrainConfig.baseUrl,
    workspaceId,
  ]);

  return (
    <PlatformContext.Provider value={clients}>
      <AuthProvider user={user} role={role}>
        <WorkspaceProvider workspaceId={workspaceId}>
          {children}
        </WorkspaceProvider>
      </AuthProvider>
    </PlatformContext.Provider>
  );
}

export function usePlatform(): PlatformContextValue {
  const ctx = useContext(PlatformContext);
  if (!ctx) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return ctx;
}

export function useDatabaseAdapter(): DatabaseAdapter {
  return usePlatform().databaseAdapter;
}

export function useStorageBrain(): StorageBrain {
  return usePlatform().storageBrain;
}
