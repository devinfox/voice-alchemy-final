'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'

interface Point {
  x: number
  y: number
}

interface DragState {
  pointerId: number
  startX: number
  startY: number
  left: number
  top: number
  width: number
  height: number
  moved: boolean
}

const DRAG_THRESHOLD_PX = 6
const EDGE_MARGIN_PX = 4

function clamp(point: Point, width: number, height: number): Point {
  const maxX = Math.max(EDGE_MARGIN_PX, window.innerWidth - width - EDGE_MARGIN_PX)
  const maxY = Math.max(EDGE_MARGIN_PX, window.innerHeight - height - EDGE_MARGIN_PX)
  return {
    x: Math.min(maxX, Math.max(EDGE_MARGIN_PX, point.x)),
    y: Math.min(maxY, Math.max(EDGE_MARGIN_PX, point.y)),
  }
}

/**
 * Makes a fixed-position floating button draggable anywhere on screen.
 * The spot is remembered per browser. A press without movement still counts
 * as a normal click: call `consumeDrag()` first thing in onClick and bail out
 * when it returns true.
 */
export function useDraggableFab<T extends HTMLElement = HTMLButtonElement>(storageKey: string) {
  const ref = useRef<T>(null)
  const drag = useRef<DragState | null>(null)
  const justDragged = useRef(false)
  const [position, setPosition] = useState<Point | null>(null)
  const [dragging, setDragging] = useState(false)

  // Restore the saved spot, and keep it on screen when the window resizes.
  useEffect(() => {
    const size = () => {
      const rect = ref.current?.getBoundingClientRect()
      return { width: rect?.width || 56, height: rect?.height || 56 }
    }
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (raw) {
        const saved = JSON.parse(raw) as Point
        if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) {
          const { width, height } = size()
          setPosition(clamp(saved, width, height))
        }
      }
    } catch {
      /* storage unavailable: keep the default spot */
    }
    const onResize = () => {
      const { width, height } = size()
      setPosition((current) => (current ? clamp(current, width, height) : current))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [storageKey])

  const onPointerDown = useCallback((e: ReactPointerEvent<T>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    justDragged.current = false
    drag.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      moved: false,
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }, [])

  const onPointerMove = useCallback((e: ReactPointerEvent<T>) => {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
    if (!d.moved) {
      d.moved = true
      setDragging(true)
    }
    setPosition(clamp({ x: d.left + dx, y: d.top + dy }, d.width, d.height))
  }, [])

  const endDrag = useCallback(
    (e: ReactPointerEvent<T>) => {
      const d = drag.current
      if (!d || d.pointerId !== e.pointerId) return
      drag.current = null
      if (!d.moved) return
      justDragged.current = true
      setDragging(false)
      setPosition((current) => {
        if (current) {
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(current))
          } catch {
            /* ignore */
          }
        }
        return current
      })
    },
    [storageKey]
  )

  /** True once after a drag, so the click that ends a drag can be ignored. */
  const consumeDrag = useCallback(() => {
    const was = justDragged.current
    justDragged.current = false
    return was
  }, [])

  const style: CSSProperties = {
    touchAction: 'none',
    userSelect: 'none',
    WebkitUserSelect: 'none',
    cursor: dragging ? 'grabbing' : 'grab',
    ...(dragging ? { transition: 'none' } : {}),
    ...(position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : {}),
  }

  return {
    ref,
    style,
    dragging,
    consumeDrag,
    bind: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag },
  }
}
