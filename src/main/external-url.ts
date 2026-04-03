export const isAllowedExternalUrl = (url: string): boolean => {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}

export const denyAndOpenAllowedExternalUrl = (
  url: string,
  openExternal: (url: string) => void
): { action: 'deny' } => {
  if (isAllowedExternalUrl(url)) {
    openExternal(url)
  }

  return { action: 'deny' }
}
