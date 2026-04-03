# Update Integrity Rollout

## Summary

The desktop app now supports a two-phase update integrity flow:

1. Manifest verification
   - The app can verify signed manifest metadata.
   - Policy is controlled by `CCPRO_UPDATE_INTEGRITY_MODE`.
   - `audit` allows unsigned legacy manifests.
   - `enforce` rejects unsigned manifests.
   - Any manifest that includes integrity metadata but fails verification is always rejected.

2. Verified installer launch
   - If the manifest includes `integrity.checksumSha256`, the app downloads the installer to a temp folder, verifies the SHA-256 checksum, then opens the verified local file.
   - Legacy manifests without checksum still fall back to the existing external download URL while rollout is in progress.

## Environment

- `CCPRO_UPDATE_INTEGRITY_MODE`
  - `audit` for transition rollout.
  - `enforce` after all published manifests are signed.
- `CCPRO_UPDATE_PUBLIC_KEY`
  - PEM-encoded RSA public key used to verify manifest signatures.

## Manifest Schema

Current manifest fields:

```json
{
  "latest": "1.0.4",
  "downloadUrl": "https://example.com/CCPro-Portable-1.0.4.exe",
  "releaseNotes": "Hot fixes",
  "integrity": {
    "checksumSha256": "<64-char lowercase hex>",
    "signature": "<base64 rsa-sha256 signature>",
    "signedFieldsVersion": 1
  }
}
```

Canonical signed payload for `signedFieldsVersion = 1`:

```json
{
  "latest": "...",
  "downloadUrl": "...",
  "releaseNotes": "...",
  "checksumSha256": "...",
  "signedFieldsVersion": 1
}
```

The payload must be serialized with the exact field order above before signing.

## Release Publishing Steps

1. Build the portable installer.
2. Generate the SHA-256 checksum for the installer.
3. Build the canonical payload from manifest fields.
4. Sign the payload with the private RSA key.
5. Publish `version.json` with `integrity.checksumSha256`, `integrity.signature`, and `integrity.signedFieldsVersion`.
6. Distribute the matching RSA public key to the app via `CCPRO_UPDATE_PUBLIC_KEY`.

## Rollout Plan

1. Start with `CCPRO_UPDATE_INTEGRITY_MODE=audit`.
2. Publish signed manifests for all new releases.
3. Confirm the app reports signed manifests as verified and can open verified local installers.
4. After all active update channels publish signed manifests, switch to `CCPRO_UPDATE_INTEGRITY_MODE=enforce`.

## Notes

- The checked-in local `version.json` remains legacy on purpose so local development does not require a bundled private/public key pair.
- Legacy manifests still work during the audit rollout, but only signed manifests get checksum-verified local launch.
