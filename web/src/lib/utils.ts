import type { SyntheticEvent } from "react"
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const stopPropagation = (event: SyntheticEvent) => event.stopPropagation()

/** Spread on controls inside a draggable, clickable card so they neither start a drag nor trigger the card. */
export const stopCardEvents = { onPointerDown: stopPropagation, onClick: stopPropagation }
