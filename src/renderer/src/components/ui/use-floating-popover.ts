import { useEffect, useState, type CSSProperties, type RefObject } from 'react'

const VIEWPORT_MARGIN = 12
const POPOVER_GAP = 8

const clamp = (value: number, min: number, max: number): number => {
  if (max <= min) return min
  return Math.min(Math.max(value, min), max)
}

interface FloatingPopoverOptions {
  anchorRef: RefObject<HTMLElement | null>
  popoverRef: RefObject<HTMLElement | null>
  open: boolean
  preferredWidth: number
}

export const useFloatingPopover = ({
  anchorRef,
  popoverRef,
  open,
  preferredWidth
}: FloatingPopoverOptions): CSSProperties => {
  const [style, setStyle] = useState<CSSProperties>({
    position: 'fixed',
    top: '0',
    left: '0',
    visibility: 'hidden'
  })

  useEffect(() => {
    if (!open) {
      setStyle({
        position: 'fixed',
        top: '0',
        left: '0',
        visibility: 'hidden'
      })
      return
    }

    const updatePosition = (): void => {
      const anchor = anchorRef.current
      if (!anchor) return

      const anchorRect = anchor.getBoundingClientRect()
      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight
      const width = Math.min(preferredWidth, Math.max(180, viewportWidth - VIEWPORT_MARGIN * 2))
      const popoverWidth = popoverRef.current?.offsetWidth ?? width
      const popoverHeight = popoverRef.current?.offsetHeight ?? 0
      const left = clamp(
        anchorRect.left,
        VIEWPORT_MARGIN,
        viewportWidth - popoverWidth - VIEWPORT_MARGIN
      )

      let top = anchorRect.bottom + POPOVER_GAP
      if (popoverHeight > 0 && top + popoverHeight > viewportHeight - VIEWPORT_MARGIN) {
        const aboveTop = anchorRect.top - popoverHeight - POPOVER_GAP
        top =
          aboveTop >= VIEWPORT_MARGIN
            ? aboveTop
            : Math.max(VIEWPORT_MARGIN, viewportHeight - popoverHeight - VIEWPORT_MARGIN)
      }

      setStyle({
        position: 'fixed',
        top: `${Math.round(top)}px`,
        left: `${Math.round(left)}px`,
        width: `${Math.round(width)}px`,
        zIndex: 2000,
        visibility: 'visible'
      })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [anchorRef, open, popoverRef, preferredWidth])

  return style
}
