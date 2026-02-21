import React from 'react';
import type { TemplateVersion } from '../types';

export interface TemplateVersionHistoryProps {
  versions: TemplateVersion[];
  currentVersion?: number;
  onRestore?: (version: TemplateVersion) => void;
  onPreview?: (version: TemplateVersion) => void;
}

export function TemplateVersionHistory({
  versions,
  currentVersion,
  onRestore,
  onPreview,
}: TemplateVersionHistoryProps) {
  if (versions.length === 0) {
    return (
      <div style={{ padding: 24, color: '#94a3b8', textAlign: 'center', fontSize: 14 }}>
        No version history yet.
      </div>
    );
  }

  return (
    <div>
      <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 600 }}>Version History</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {versions.map((version) => {
          const isCurrent = version.versionNumber === currentVersion;
          return (
            <div
              key={version.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 12,
                border: isCurrent ? '2px solid #3b82f6' : '1px solid #e2e8f0',
                borderRadius: 6,
                background: isCurrent ? '#eff6ff' : 'white',
              }}
            >
              <div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  Version {version.versionNumber}
                  {isCurrent && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        padding: '2px 6px',
                        background: '#3b82f6',
                        color: 'white',
                        borderRadius: 9999,
                      }}
                    >
                      Current
                    </span>
                  )}
                </div>
                {version.changeSummary && (
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                    {version.changeSummary}
                  </p>
                )}
                <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>
                  {new Date(version.createdAt).toLocaleString()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {onPreview && (
                  <button
                    onClick={() => onPreview(version)}
                    style={actionBtnStyle}
                  >
                    Preview
                  </button>
                )}
                {onRestore && !isCurrent && (
                  <button
                    onClick={() => onRestore(version)}
                    style={{ ...actionBtnStyle, background: '#3b82f6', color: 'white', borderColor: '#3b82f6' }}
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const actionBtnStyle: React.CSSProperties = {
  padding: '6px 12px',
  border: '1px solid #e2e8f0',
  borderRadius: 6,
  background: 'white',
  fontSize: 12,
  cursor: 'pointer',
};
