// packages/core/src/store/mst/types.ts
// Framework-agnostic types for MST models

/**
 * CSS Properties type - framework agnostic equivalent of React.CSSProperties
 * Uses standard CSS property names and values
 */
export type CSSProperties = {
  // Layout
  width?: string | number;
  height?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  minHeight?: string | number;
  maxHeight?: string | number;

  // Spacing
  margin?: string | number;
  marginTop?: string | number;
  marginRight?: string | number;
  marginBottom?: string | number;
  marginLeft?: string | number;
  padding?: string | number;
  paddingTop?: string | number;
  paddingRight?: string | number;
  paddingBottom?: string | number;
  paddingLeft?: string | number;

  // Typography
  color?: string;
  fontSize?: string | number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: 'left' | 'center' | 'right' | 'justify';
  textDecoration?: string;
  lineHeight?: string | number;
  letterSpacing?: string | number;
  textTransform?: string;

  // Background
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundPosition?: string;
  backgroundRepeat?: string;
  backgroundSize?: string;

  // Border
  border?: string;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRadius?: string | number;
  borderColor?: string;
  borderWidth?: string | number;
  borderStyle?: string;

  // Alignment
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'baseline';

  // Display
  display?: string;
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  gap?: string | number;

  // Other
  overflow?: string;
  opacity?: number;
  cursor?: string;
  transform?: string;
  transformOrigin?: string;

  // Allow string index for flexibility
  [key: string]: string | number | undefined;
};
