import type { StorageBrain } from '@marlinjai/storage-brain-sdk';
import type { TeamsStorageAdapter } from './adapter';
import type {
  BrandKit,
  BrandColor,
  BrandFont,
  CreateBrandKitInput,
  UpdateBrandKitInput,
} from './types';

export class BrandKitManager {
  constructor(
    private readonly adapter: TeamsStorageAdapter,
    private readonly storageBrain?: StorageBrain
  ) {}

  async create(input: CreateBrandKitInput): Promise<BrandKit> {
    return this.adapter.createBrandKit(input);
  }

  async get(id: string): Promise<BrandKit | null> {
    return this.adapter.getBrandKit(id);
  }

  async getByWorkspace(workspaceId: string): Promise<BrandKit | null> {
    return this.adapter.getBrandKitByWorkspace(workspaceId);
  }

  async update(id: string, input: UpdateBrandKitInput): Promise<BrandKit> {
    return this.adapter.updateBrandKit(id, input);
  }

  async delete(id: string): Promise<void> {
    return this.adapter.deleteBrandKit(id);
  }

  async uploadLogo(
    brandKitId: string,
    file: File | Blob
  ): Promise<BrandKit> {
    if (!this.storageBrain) {
      throw new Error('Storage Brain client is required for logo uploads');
    }

    const fileInfo = await this.storageBrain.upload(file, {
      context: 'brand-kit-logo',
    });

    return this.adapter.updateBrandKit(brandKitId, {
      logoFileId: fileInfo.id,
      logoUrl: fileInfo.url,
    });
  }

  async setColors(brandKitId: string, colors: BrandColor[]): Promise<BrandKit> {
    return this.adapter.updateBrandKit(brandKitId, { colors });
  }

  async setFonts(brandKitId: string, fonts: BrandFont[]): Promise<BrandKit> {
    return this.adapter.updateBrandKit(brandKitId, { fonts });
  }

  async lockColor(brandKitId: string, colorName: string): Promise<BrandKit> {
    return this.toggleColorLock(brandKitId, colorName, true);
  }

  async unlockColor(brandKitId: string, colorName: string): Promise<BrandKit> {
    return this.toggleColorLock(brandKitId, colorName, false);
  }

  async lockFont(brandKitId: string, fontName: string): Promise<BrandKit> {
    return this.toggleFontLock(brandKitId, fontName, true);
  }

  async unlockFont(brandKitId: string, fontName: string): Promise<BrandKit> {
    return this.toggleFontLock(brandKitId, fontName, false);
  }

  private async toggleColorLock(
    brandKitId: string,
    colorName: string,
    locked: boolean
  ): Promise<BrandKit> {
    const kit = await this.adapter.getBrandKit(brandKitId);
    if (!kit) throw new Error('Brand kit not found');

    const colors = kit.colors.map((c) =>
      c.name === colorName ? { ...c, locked } : c
    );
    return this.adapter.updateBrandKit(brandKitId, { colors });
  }

  private async toggleFontLock(
    brandKitId: string,
    fontName: string,
    locked: boolean
  ): Promise<BrandKit> {
    const kit = await this.adapter.getBrandKit(brandKitId);
    if (!kit) throw new Error('Brand kit not found');

    const fonts = kit.fonts.map((f) =>
      f.name === fontName ? { ...f, locked } : f
    );
    return this.adapter.updateBrandKit(brandKitId, { fonts });
  }
}
