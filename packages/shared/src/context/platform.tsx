import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DataBrain } from '@marlinjai/data-brain-sdk';
import { StorageBrain } from '@marlinjai/storage-brain-sdk';
import { createDataBrainClient, type DataBrainConfig } from '../clients/data-brain';
import { createStorageBrainClient, type StorageBrainConfig } from '../clients/storage-brain';
import { WorkspaceProvider } from './workspace';
import { AuthProvider } from './auth';
import type { User, WorkspaceRole } from '../types';

interface PlatformContextValue {
  dataBrain: DataBrain;
  storageBrain: StorageBrain;
}

const PlatformContext = createContext<PlatformContextValue | null>(null);

export interface PlatformProviderProps {
  dataBrain: DataBrainConfig;
  storageBrain: StorageBrainConfig;
  workspaceId: string;
  user: User;
  role: WorkspaceRole;
  children: ReactNode;
}

export function PlatformProvider({
  dataBrain: dataBrainConfig,
  storageBrain: storageBrainConfig,
  workspaceId,
  user,
  role,
  children,
}: PlatformProviderProps) {
  const clients = useMemo(() => {
    const dbConfig = { ...dataBrainConfig, workspaceId };
    const sbConfig = { ...storageBrainConfig, workspaceId };
    return {
      dataBrain: createDataBrainClient(dbConfig),
      storageBrain: createStorageBrainClient(sbConfig),
    };
  }, [
    dataBrainConfig.baseUrl,
    dataBrainConfig.apiKey,
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

export function useDataBrain(): DataBrain {
  return usePlatform().dataBrain;
}

export function useStorageBrain(): StorageBrain {
  return usePlatform().storageBrain;
}
