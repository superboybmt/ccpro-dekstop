import { createHash, createVerify } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import type { UpdateInfo } from '@shared/api'

type ManifestFields = Pick<UpdateInfo, 'latest' | 'downloadUrl' | 'releaseNotes' | 'integrity'>

export const isValidSha256 = (value: string): boolean => /^[a-f0-9]{64}$/iu.test(value)

export const buildSignedManifestPayload = (info: ManifestFields): string =>
  JSON.stringify({
    latest: info.latest,
    downloadUrl: info.downloadUrl,
    releaseNotes: info.releaseNotes ?? '',
    checksumSha256: info.integrity?.checksumSha256 ?? '',
    signedFieldsVersion: info.integrity?.signedFieldsVersion ?? 1
  })

export const verifyManifestSignature = (payload: string, signature: string, publicKey: string): boolean => {
  try {
    const verifier = createVerify('RSA-SHA256')
    verifier.update(payload)
    verifier.end()
    return verifier.verify(publicKey, signature, 'base64')
  } catch {
    return false
  }
}

export const hashFileSha256 = async (filePath: string): Promise<string> => {
  const content = await readFile(filePath)
  return createHash('sha256').update(content).digest('hex')
}
