import { types, Instance, SnapshotIn, SnapshotOut } from 'mobx-state-tree';
import { nanoid } from 'nanoid';
import { SectionModel, SectionSnapshotIn, createSection } from './SectionModel';
import { paddingIn, paddingOut } from './spacingSnapshot';
import { WRAPPER_DEFAULTS, dropFilled, fillDefaults, type Filled } from './filledDefaults';
import type { CSSProperties } from '../types';
import type { BackgroundGradient } from '../../../schema/gradient';
import { buildGradientCSS } from '../../../schema/gradient';

/** The wrapper fields the inspector edits (see `Wrapper` in the schema). */
export interface WrapperProperties {
  backgroundColor?: string;
  backgroundImage?: string;
  backgroundGradient?: BackgroundGradient;
  backgroundPosition?: string;
  backgroundRepeat?: 'repeat' | 'no-repeat';
  backgroundSize?: string;
  border?: string;
  borderTop?: string;
  borderRight?: string;
  borderBottom?: string;
  borderLeft?: string;
  borderRadius?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  fullWidth?: boolean;
  cssClass?: string;
  gap?: string;
  textAlign?: 'left' | 'center' | 'right';
}

/** MJML's own `mj-wrapper` padding when none is set: the canvas shows the same. */
export const MJML_WRAPPER_DEFAULT_PADDING = { top: '20px', right: '0px', bottom: '20px', left: '0px' } as const;

const WrapperModelBase = types
  .model('Wrapper', {
    id: types.identifier,
    type: types.literal('wrapper'),
    hidden: types.optional(types.boolean, false),

    // Background
    backgroundColor: types.maybe(types.string),
    backgroundImage: types.maybe(types.string),
    backgroundGradient: types.maybe(types.frozen<BackgroundGradient>()),
    backgroundPosition: types.maybe(types.string),
    backgroundRepeat: types.maybe(types.enumeration(['repeat', 'no-repeat'])),
    backgroundSize: types.maybe(types.string),

    // Border
    border: types.maybe(types.string),
    borderTop: types.maybe(types.string),
    borderRight: types.maybe(types.string),
    borderBottom: types.maybe(types.string),
    borderLeft: types.maybe(types.string),
    borderRadius: types.maybe(types.string),

    // Padding (the schema's `padding` object, flat in the store; see `spacingSnapshot.ts`)
    paddingTop: types.maybe(types.string),
    paddingRight: types.maybe(types.string),
    paddingBottom: types.maybe(types.string),
    paddingLeft: types.maybe(types.string),

    // Layout
    fullWidth: types.optional(types.boolean, false),
    cssClass: types.maybe(types.string),
    gap: types.maybe(types.string),
    textAlign: types.maybe(types.enumeration(['left', 'center', 'right'])),

    sections: types.array(SectionModel),

    /** MJML attributes the inspector has no control for (kept from an import). */
    extraAttributes: types.maybe(types.frozen<Record<string, string>>()),

    /** Defaults the store filled when it opened the node; they go back out only if changed (see `filledDefaults.ts`). */
    filled: types.maybe(types.frozen<Filled>()),
  })
  .actions((self) => ({
    /** Set any of the inspector's fields; `undefined` clears one. */
    updateProperties(updates: WrapperProperties) {
      for (const [key, value] of Object.entries(updates)) {
        if (key in self) (self as unknown as Record<string, unknown>)[key] = value;
      }
    },

    toggleHidden() {
      self.hidden = !self.hidden;
    },

    toggleFullWidth() {
      self.fullWidth = !self.fullWidth;
    },
  }))
  .views((self) => ({
    get isEmpty(): boolean {
      return self.sections.length === 0 || self.sections.every((s) => s.isEmpty);
    },

    get displayName(): string {
      const n = self.sections.length;
      return n === 0 ? 'Container (empty)' : `Container, ${n} ${n === 1 ? 'section' : 'sections'}`;
    },

    /**
     * The padding the mail gets: MJML's `20px 0` when none is set. As soon as
     * one side is set, the compiler writes all four and an unset side is 0.
     */
    get effectivePadding(): { top: string; right: string; bottom: string; left: string } {
      const { paddingTop, paddingRight, paddingBottom, paddingLeft } = self;
      if (!paddingTop && !paddingRight && !paddingBottom && !paddingLeft) return { ...MJML_WRAPPER_DEFAULT_PADDING };
      return { top: paddingTop || '0px', right: paddingRight || '0px', bottom: paddingBottom || '0px', left: paddingLeft || '0px' };
    },

    /** The wrapper's box on the canvas, styled as MJML renders it. */
    get computedStyle(): CSSProperties {
      const style: CSSProperties = {};
      const gradientCSS = self.backgroundGradient ? buildGradientCSS(self.backgroundGradient) : undefined;
      if (gradientCSS) {
        style.backgroundColor = self.backgroundGradient?.stops[0]?.color;
        style.backgroundImage = gradientCSS;
      } else {
        if (self.backgroundColor) style.backgroundColor = self.backgroundColor;
        if (self.backgroundImage) {
          style.backgroundImage = `url(${self.backgroundImage})`;
          // MJML's defaults for mj-wrapper: top center, auto, repeat.
          style.backgroundPosition = self.backgroundPosition || 'top center';
          style.backgroundSize = self.backgroundSize || 'auto';
          style.backgroundRepeat = self.backgroundRepeat || 'repeat';
        }
      }
      if (self.border) style.border = self.border;
      if (self.borderTop) style.borderTop = self.borderTop;
      if (self.borderRight) style.borderRight = self.borderRight;
      if (self.borderBottom) style.borderBottom = self.borderBottom;
      if (self.borderLeft) style.borderLeft = self.borderLeft;
      if (self.borderRadius) {
        style.borderRadius = self.borderRadius;
        style.overflow = 'hidden';
      }
      const p = this.effectivePadding;
      style.paddingTop = p.top;
      style.paddingRight = p.right;
      style.paddingBottom = p.bottom;
      style.paddingLeft = p.left;
      if (self.textAlign) style.textAlign = self.textAlign as 'left' | 'center' | 'right';
      return style;
    },
  }));

/**
 * WrapperModel: a container around sections (`mj-wrapper`), with the same
 * snapshot boundary as sections: defaults it fills are dropped again on the
 * way out, and its padding maps between the schema's `padding` object and the
 * flat fields. A wrapper never holds another wrapper: its `sections` hold
 * sections only.
 */
export const WrapperModel: typeof WrapperModelBase = WrapperModelBase.preProcessSnapshot((snapshot) =>
  fillDefaults(paddingIn(snapshot), WRAPPER_DEFAULTS)
).postProcessSnapshot((snapshot) => paddingOut(dropFilled(snapshot))) as unknown as typeof WrapperModelBase;

export type WrapperInstance = Instance<typeof WrapperModel>;
export type WrapperSnapshotIn = SnapshotIn<typeof WrapperModel>;
export type WrapperSnapshotOut = SnapshotOut<typeof WrapperModel>;

/** A new wrapper around the given sections, or around one empty single-column section. */
export function createWrapper(options: { id?: string; sections?: SectionSnapshotIn[] } = {}): WrapperSnapshotIn {
  return {
    id: options.id || nanoid(),
    type: 'wrapper',
    sections: options.sections ?? [createSection()],
  };
}
