import { beforeEach, describe, expect, it, vi } from 'vitest'

const requestMock = {
  input: vi.fn().mockReturnThis(),
  query: vi.fn(async () => ({ rowsAffected: [1] }))
}

const poolMock = {
  request: vi.fn(() => requestMock)
}

vi.mock('../../db/sql', () => ({
  getPool: vi.fn(async () => poolMock)
}))

describe('AvatarService', () => {
  beforeEach(() => {
    poolMock.request.mockClear()
    requestMock.input.mockClear()
    requestMock.query.mockClear()
  })

  it('rejects non-raster avatar payloads before touching the database', async () => {
    const { AvatarService } = await import('../avatar-service')
    const service = new AvatarService()

    await expect(
      service.updateAvatar(18, 'data:image/svg+xml;base64,PHN2Zy8+')
    ).resolves.toEqual({
      ok: false,
      message: 'Ảnh đại diện không hợp lệ. Chỉ chấp nhận JPEG, PNG hoặc WebP.'
    })

    expect(poolMock.request).not.toHaveBeenCalled()
  })

  it('rejects oversized avatar payloads before touching the database', async () => {
    const { AvatarService } = await import('../avatar-service')
    const service = new AvatarService()
    const oversizedAvatar = `data:image/webp;base64,${'a'.repeat(1_000_001)}`

    await expect(service.updateAvatar(18, oversizedAvatar)).resolves.toEqual({
      ok: false,
      message: 'Ảnh đại diện quá lớn. Vui lòng chọn ảnh nhỏ hơn.'
    })

    expect(poolMock.request).not.toHaveBeenCalled()
  })

  it('stores safe raster avatar payloads', async () => {
    const { AvatarService } = await import('../avatar-service')
    const service = new AvatarService()
    const avatar = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQABAAPm02mUmkIyIhIAA='

    await expect(service.updateAvatar(18, avatar)).resolves.toEqual({
      ok: true,
      message: 'Cập nhật ảnh đại diện thành công'
    })

    expect(poolMock.request).toHaveBeenCalledTimes(1)
    expect(requestMock.input).toHaveBeenCalledWith('avatarBase64', avatar)
  })
})
