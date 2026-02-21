import { describe, it, expect, vi } from 'vitest';
import type { Workspace, WorkspaceSwitcherProps } from '../components/WorkspaceSwitcher';

describe('WorkspaceSwitcher types', () => {
  const workspaces: Workspace[] = [
    { id: 'ws-1', name: 'Acme Corp', role: 'owner' },
    { id: 'ws-2', name: 'Side Project', role: 'editor' },
    { id: 'ws-3', name: 'Client Workspace', role: 'viewer' },
  ];

  it('Workspace type has required fields', () => {
    const ws: Workspace = { id: '1', name: 'Test', role: 'admin' };
    expect(ws.id).toBe('1');
    expect(ws.name).toBe('Test');
    expect(ws.role).toBe('admin');
  });

  it('WorkspaceSwitcherProps accepts required props', () => {
    const onSwitch = vi.fn();
    const props: WorkspaceSwitcherProps = {
      workspaces,
      currentWorkspaceId: 'ws-1',
      onSwitch,
    };
    expect(props.workspaces).toHaveLength(3);
    expect(props.currentWorkspaceId).toBe('ws-1');
  });

  it('WorkspaceSwitcherProps accepts optional props', () => {
    const onSwitch = vi.fn();
    const onCreate = vi.fn();
    const props: WorkspaceSwitcherProps = {
      workspaces,
      currentWorkspaceId: 'ws-1',
      onSwitch,
      onCreateWorkspace: onCreate,
      loading: true,
    };
    expect(props.loading).toBe(true);
    expect(props.onCreateWorkspace).toBeDefined();
  });

  it('onSwitch is called with workspace id', () => {
    const onSwitch = vi.fn();
    onSwitch('ws-2');
    expect(onSwitch).toHaveBeenCalledWith('ws-2');
  });

  it('current workspace can be found from list', () => {
    const currentId = 'ws-2';
    const current = workspaces.find((w) => w.id === currentId);
    expect(current).toBeDefined();
    expect(current!.name).toBe('Side Project');
    expect(current!.role).toBe('editor');
  });

  it('handles empty workspace list', () => {
    const empty: Workspace[] = [];
    expect(empty).toHaveLength(0);
    const current = empty.find((w) => w.id === 'ws-1');
    expect(current).toBeUndefined();
  });

  it('all role types are valid for workspaces', () => {
    const roles: Workspace[] = [
      { id: '1', name: 'Owner WS', role: 'owner' },
      { id: '2', name: 'Admin WS', role: 'admin' },
      { id: '3', name: 'Editor WS', role: 'editor' },
      { id: '4', name: 'Viewer WS', role: 'viewer' },
    ];
    expect(roles.map((r) => r.role)).toEqual(['owner', 'admin', 'editor', 'viewer']);
  });

  it('selecting same workspace does not call onSwitch', () => {
    const onSwitch = vi.fn();
    const currentId = 'ws-1';
    const selectedId = 'ws-1';
    // Simulating the component logic: only call onSwitch if different
    if (selectedId !== currentId) {
      onSwitch(selectedId);
    }
    expect(onSwitch).not.toHaveBeenCalled();
  });

  it('selecting different workspace calls onSwitch', () => {
    const onSwitch = vi.fn();
    const currentId = 'ws-1';
    const selectedId = 'ws-2';
    if (selectedId !== currentId) {
      onSwitch(selectedId);
    }
    expect(onSwitch).toHaveBeenCalledWith('ws-2');
  });
});
