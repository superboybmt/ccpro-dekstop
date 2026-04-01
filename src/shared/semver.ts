export const isSemverGreater = (remoteVersion: string, localVersion: string): boolean => {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((s) => parseInt(s, 10) || 0)
  
  const partsA = parse(remoteVersion)
  const partsB = parse(localVersion)

  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const numA = partsA[i] || 0
    const numB = partsB[i] || 0
    if (numA > numB) return true
    if (numA < numB) return false
  }
  
  return false
}
