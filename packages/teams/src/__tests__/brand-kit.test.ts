import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrandKitManager } from '../brand-kit';
import type { TeamsStorageAdapter } from '../adapter';
import type { BrandKit } from '../types';

function createMockAdapter(): TeamsStorageAdapter {
  return {
    createMember: vi.fn(),
    getMember: vi.fn(),
    getMemberById: vi.fn(),
    listMembers: vi.fn(),
    updateMemberRole: vi.fn(),
    acceptInvitation: vi.fn(),
    removeMember: vi.fn(),
    createApproval: vi.fn(),
    getApproval: vi.fn(),
    listPendingApprovals: vi.fn(),
    updateApprovalStatus: vi.fn(),
    getApprovalByResource: vi.fn(),
    createAuditEntry: vi.fn(),
    queryAuditLog: vi.fn(),
    createBrandKit: vi.fn(),
    getBrandKit: vi.fn(),
    getBrandKitByWorkspace: vi.fn(),
    updateBrandKit: vi.fn(),
    deleteBrandKit: vi.fn(),
  };
}

const SAMPLE_KIT: BrandKit = {
  id: 'bk-1',
  workspaceId: 'ws-1',
  name: 'My Brand',
  colors: [
    { name: 'primary', value: '#0066cc', locked: false },
    { name: 'secondary', value: '#333333', locked: false },
  ],
  fonts: [
    { name: 'heading', fontFamily: 'Inter', locked: false },
    { name: 'body', fontFamily: 'Roboto', locked: false },
  ],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

describe('BrandKitManager', () => {
  let adapter: TeamsStorageAdapter;
  let manager: BrandKitManager;

  beforeEach(() => {
    adapter = createMockAdapter();
    manager = new BrandKitManager(adapter);
  });

  it('creates a brand kit', async () => {
    vi.mocked(adapter.createBrandKit).mockResolvedValue(SAMPLE_KIT);

    const result = await manager.create({
      workspaceId: 'ws-1',
      name: 'My Brand',
      colors: SAMPLE_KIT.colors,
      fonts: SAMPLE_KIT.fonts,
    });
    expect(result.name).toBe('My Brand');
  });

  it('gets brand kit by workspace', async () => {
    vi.mocked(adapter.getBrandKitByWorkspace).mockResolvedValue(SAMPLE_KIT);

    const result = await manager.getByWorkspace('ws-1');
    expect(result?.id).toBe('bk-1');
  });

  it('sets colors', async () => {
    const newColors = [{ name: 'primary', value: '#ff0000', locked: false }];
    vi.mocked(adapter.updateBrandKit).mockResolvedValue({
      ...SAMPLE_KIT,
      colors: newColors,
    });

    const result = await manager.setColors('bk-1', newColors);
    expect(result.colors).toEqual(newColors);
    expect(adapter.updateBrandKit).toHaveBeenCalledWith('bk-1', { colors: newColors });
  });

  it('sets fonts', async () => {
    const newFonts = [{ name: 'heading', fontFamily: 'Montserrat', locked: true }];
    vi.mocked(adapter.updateBrandKit).mockResolvedValue({
      ...SAMPLE_KIT,
      fonts: newFonts,
    });

    const result = await manager.setFonts('bk-1', newFonts);
    expect(result.fonts).toEqual(newFonts);
  });

  describe('lock/unlock', () => {
    it('locks a color', async () => {
      vi.mocked(adapter.getBrandKit).mockResolvedValue(SAMPLE_KIT);
      vi.mocked(adapter.updateBrandKit).mockResolvedValue({
        ...SAMPLE_KIT,
        colors: [
          { name: 'primary', value: '#0066cc', locked: true },
          { name: 'secondary', value: '#333333', locked: false },
        ],
      });

      const result = await manager.lockColor('bk-1', 'primary');
      expect(result.colors[0]!.locked).toBe(true);
      expect(adapter.updateBrandKit).toHaveBeenCalledWith('bk-1', {
        colors: [
          { name: 'primary', value: '#0066cc', locked: true },
          { name: 'secondary', value: '#333333', locked: false },
        ],
      });
    });

    it('unlocks a color', async () => {
      const kitWithLockedColor = {
        ...SAMPLE_KIT,
        colors: [
          { name: 'primary', value: '#0066cc', locked: true },
          { name: 'secondary', value: '#333333', locked: false },
        ],
      };
      vi.mocked(adapter.getBrandKit).mockResolvedValue(kitWithLockedColor);
      vi.mocked(adapter.updateBrandKit).mockResolvedValue({
        ...SAMPLE_KIT,
        colors: [
          { name: 'primary', value: '#0066cc', locked: false },
          { name: 'secondary', value: '#333333', locked: false },
        ],
      });

      const result = await manager.unlockColor('bk-1', 'primary');
      expect(result.colors[0]!.locked).toBe(false);
    });

    it('locks a font', async () => {
      vi.mocked(adapter.getBrandKit).mockResolvedValue(SAMPLE_KIT);
      vi.mocked(adapter.updateBrandKit).mockResolvedValue({
        ...SAMPLE_KIT,
        fonts: [
          { name: 'heading', fontFamily: 'Inter', locked: true },
          { name: 'body', fontFamily: 'Roboto', locked: false },
        ],
      });

      const result = await manager.lockFont('bk-1', 'heading');
      expect(result.fonts[0]!.locked).toBe(true);
    });

    it('throws if brand kit not found', async () => {
      vi.mocked(adapter.getBrandKit).mockResolvedValue(null);

      await expect(manager.lockColor('bk-1', 'primary')).rejects.toThrow('Brand kit not found');
      await expect(manager.lockFont('bk-1', 'heading')).rejects.toThrow('Brand kit not found');
    });
  });

  it('throws on logo upload without storage brain', async () => {
    const file = new Blob(['test'], { type: 'image/png' }) as File;
    await expect(manager.uploadLogo('bk-1', file)).rejects.toThrow(
      'Storage Brain client is required'
    );
  });
});
