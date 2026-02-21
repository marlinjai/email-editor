import { useState, useRef, type ChangeEvent } from 'react';
import type { BrandKit, BrandColor, BrandFont } from '../types';

export interface BrandKitEditorProps {
  brandKit: BrandKit;
  onUpdateColors: (colors: BrandColor[]) => void;
  onUpdateFonts: (fonts: BrandFont[]) => void;
  onUploadLogo: (file: File) => void;
  onToggleColorLock: (colorName: string, locked: boolean) => void;
  onToggleFontLock: (fontName: string, locked: boolean) => void;
}

export function BrandKitEditor({
  brandKit,
  onUpdateColors,
  onUpdateFonts,
  onUploadLogo,
  onToggleColorLock,
  onToggleFontLock,
}: BrandKitEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [newColorName, setNewColorName] = useState('');
  const [newColorValue, setNewColorValue] = useState('#000000');
  const [newFontName, setNewFontName] = useState('');
  const [newFontFamily, setNewFontFamily] = useState('');

  const addColor = () => {
    if (!newColorName.trim()) return;
    onUpdateColors([
      ...brandKit.colors,
      { name: newColorName.trim(), value: newColorValue, locked: false },
    ]);
    setNewColorName('');
    setNewColorValue('#000000');
  };

  const removeColor = (name: string) => {
    onUpdateColors(brandKit.colors.filter((c) => c.name !== name));
  };

  const updateColorValue = (name: string, value: string) => {
    onUpdateColors(
      brandKit.colors.map((c) => (c.name === name ? { ...c, value } : c))
    );
  };

  const addFont = () => {
    if (!newFontName.trim() || !newFontFamily.trim()) return;
    onUpdateFonts([
      ...brandKit.fonts,
      { name: newFontName.trim(), fontFamily: newFontFamily.trim(), locked: false },
    ]);
    setNewFontName('');
    setNewFontFamily('');
  };

  const removeFont = (name: string) => {
    onUpdateFonts(brandKit.fonts.filter((f) => f.name !== name));
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUploadLogo(file);
  };

  return (
    <div>
      <h3>Brand Kit: {brandKit.name}</h3>

      {/* Logo Section */}
      <section style={{ marginBottom: 24 }}>
        <h4>Logo</h4>
        {brandKit.logoUrl && (
          <img
            src={brandKit.logoUrl}
            alt="Brand logo"
            style={{ maxWidth: 200, maxHeight: 80, marginBottom: 8, display: 'block' }}
          />
        )}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} />
      </section>

      {/* Colors Section */}
      <section style={{ marginBottom: 24 }}>
        <h4>Brand Colors</h4>
        {brandKit.colors.map((color) => (
          <div key={color.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <input
              type="color"
              value={color.value}
              onChange={(e) => updateColorValue(color.name, e.target.value)}
              disabled={color.locked}
            />
            <span style={{ minWidth: 80 }}>{color.name}</span>
            <span style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>{color.value}</span>
            <label style={{ fontSize: '0.85em' }}>
              <input
                type="checkbox"
                checked={color.locked}
                onChange={(e) => onToggleColorLock(color.name, e.target.checked)}
              />{' '}
              Locked
            </label>
            {!color.locked && (
              <button onClick={() => removeColor(color.name)} type="button" style={{ fontSize: '0.85em' }}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Color name"
            value={newColorName}
            onChange={(e) => setNewColorName(e.target.value)}
          />
          <input
            type="color"
            value={newColorValue}
            onChange={(e) => setNewColorValue(e.target.value)}
          />
          <button onClick={addColor} type="button">Add Color</button>
        </div>
      </section>

      {/* Fonts Section */}
      <section style={{ marginBottom: 24 }}>
        <h4>Brand Fonts</h4>
        {brandKit.fonts.map((font) => (
          <div key={font.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ minWidth: 80 }}>{font.name}</span>
            <span style={{ fontFamily: font.fontFamily }}>{font.fontFamily}</span>
            <label style={{ fontSize: '0.85em' }}>
              <input
                type="checkbox"
                checked={font.locked}
                onChange={(e) => onToggleFontLock(font.name, e.target.checked)}
              />{' '}
              Locked
            </label>
            {!font.locked && (
              <button onClick={() => removeFont(font.name)} type="button" style={{ fontSize: '0.85em' }}>
                Remove
              </button>
            )}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <input
            type="text"
            placeholder="Font name (e.g., heading)"
            value={newFontName}
            onChange={(e) => setNewFontName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Font family (e.g., Arial)"
            value={newFontFamily}
            onChange={(e) => setNewFontFamily(e.target.value)}
          />
          <button onClick={addFont} type="button">Add Font</button>
        </div>
      </section>

      {/* Preview Section */}
      <section>
        <h4>Preview</h4>
        <div
          style={{
            border: '1px solid #e0e0e0',
            borderRadius: 4,
            padding: 16,
            background: brandKit.colors.find((c) => c.name === 'background')?.value ?? '#ffffff',
          }}
        >
          {brandKit.logoUrl && (
            <img
              src={brandKit.logoUrl}
              alt="Preview logo"
              style={{ maxWidth: 120, maxHeight: 40, marginBottom: 12, display: 'block' }}
            />
          )}
          <h5
            style={{
              fontFamily: brandKit.fonts.find((f) => f.name === 'heading')?.fontFamily ?? 'inherit',
              color: brandKit.colors.find((c) => c.name === 'primary')?.value ?? '#000',
              margin: '0 0 8px',
            }}
          >
            Sample Heading
          </h5>
          <p
            style={{
              fontFamily: brandKit.fonts.find((f) => f.name === 'body')?.fontFamily ?? 'inherit',
              color: brandKit.colors.find((c) => c.name === 'secondary')?.value ?? '#333',
              margin: 0,
            }}
          >
            This is a sample paragraph showing how your brand colors and fonts will appear in emails.
          </p>
          <button
            type="button"
            style={{
              marginTop: 12,
              background: brandKit.colors.find((c) => c.name === 'accent')?.value ?? '#0066cc',
              color: '#fff',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 4,
              cursor: 'pointer',
              fontFamily: brandKit.fonts.find((f) => f.name === 'body')?.fontFamily ?? 'inherit',
            }}
          >
            Sample Button
          </button>
        </div>
      </section>
    </div>
  );
}
