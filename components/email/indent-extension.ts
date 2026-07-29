import { Extension } from '@tiptap/core'

/**
 * Indent — a minimal, email-safe indent/outdent for the compose editor.
 *
 * Why this exists: users were reaching for the Bullet/Numbered list buttons to
 * indent a line, but a list wraps whole *paragraphs*. When several visual lines
 * are one paragraph joined by <br> (from pasting, replying, or Shift+Enter),
 * the list indents the entire block — i.e. "everything above" — which is
 * confusing. This gives a dedicated Indent/Outdent that adjusts a `margin-left`
 * on ONLY the block(s) under the cursor/selection, and renders as an inline
 * style so the indent survives email HTML sanitization intact.
 */
export interface IndentOptions {
  /** Node types that can carry an indent. */
  types: string[]
  /** Pixels of margin-left per indent level. */
  step: number
  /** Maximum indent level. */
  maxLevel: number
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    indent: {
      indent: () => ReturnType
      outdent: () => ReturnType
    }
  }
}

export const Indent = Extension.create<IndentOptions>({
  name: 'indent',

  addOptions() {
    return {
      // Headings are disabled in this editor; blockquote + paragraph cover the
      // real cases. listItem is intentionally excluded so we don't fight the
      // list's own nesting (sink/lift) behavior.
      types: ['paragraph', 'blockquote'],
      step: 32,
      maxLevel: 10,
    }
  },

  addGlobalAttributes() {
    const step = this.options.step
    return [
      {
        types: this.options.types,
        attributes: {
          indent: {
            default: 0,
            // Render as an inline margin-left so it survives our email
            // sanitizer (which keeps inline styles, strips <style> blocks).
            renderHTML: (attrs) =>
              attrs.indent
                ? { style: `margin-left: ${attrs.indent * step}px` }
                : {},
            parseHTML: (el) => {
              const ml = parseInt((el as HTMLElement).style?.marginLeft || '0', 10)
              return ml ? Math.round(ml / step) : 0
            },
          },
        },
      },
    ]
  },

  addCommands() {
    const types = this.options.types
    const maxLevel = this.options.maxLevel

    const shift =
      (delta: number) =>
      ({ state, dispatch }: { state: any; dispatch: any }) => {
        const { from, to } = state.selection
        let tr = state.tr
        let changed = false

        state.doc.nodesBetween(from, to, (node: any, pos: number) => {
          if (types.includes(node.type.name)) {
            const current = node.attrs.indent || 0
            const next = Math.min(maxLevel, Math.max(0, current + delta))
            if (next !== current) {
              tr = tr.setNodeMarkup(pos, undefined, { ...node.attrs, indent: next })
              changed = true
            }
            // Don't descend — a nested paragraph shouldn't get indented twice.
            return false
          }
          return true
        })

        if (changed && dispatch) dispatch(tr)
        return changed
      }

    return {
      indent: () => shift(1),
      outdent: () => shift(-1),
    }
  },
})

export default Indent
