import type { MutationResult } from '@shared/api'
import { getPool } from '../db/sql'
import { formatSqlDateTime } from './sql-datetime'

const MAX_AVATAR_DATA_URL_LENGTH = 1_000_000
const SAFE_AVATAR_DATA_URL_PATTERN = /^data:image\/(?:jpeg|png|webp);base64,[a-z0-9+/=]+$/iu

const validateAvatarPayload = (base64: string): MutationResult | null => {
  const normalized = base64.trim()

  if (!SAFE_AVATAR_DATA_URL_PATTERN.test(normalized)) {
    return {
      ok: false,
      message: 'Ảnh đại diện không hợp lệ. Chỉ chấp nhận JPEG, PNG hoặc WebP.'
    }
  }

  if (normalized.length > MAX_AVATAR_DATA_URL_LENGTH) {
    return {
      ok: false,
      message: 'Ảnh đại diện quá lớn. Vui lòng chọn ảnh nhỏ hơn.'
    }
  }

  return null
}

export class AvatarService {
  async updateAvatar(userEnrollNumber: number, base64: string): Promise<MutationResult> {
    const validationError = validateAvatarPayload(base64)
    if (validationError) {
      return validationError
    }

    try {
      const pool = await getPool('app')
      const request = pool.request()
      request.input('userEnrollNumber', userEnrollNumber)
      request.input('avatarBase64', base64.trim())
      request.input('updatedAt', formatSqlDateTime(new Date()))

      // Mặc định là app_users luôn có record vì khi auth login nó đã upsert hoặc ta có thể update trực tiếp.
      // Nếu user chưa tồn tại, có thể throw hoặc upsert, ở bước này ta giả định đã có.
      const result = await request.query(`
        UPDATE dbo.app_users
        SET 
          avatar_base64 = @avatarBase64,
          updated_at = CONVERT(datetime2, @updatedAt, 120)
        WHERE user_enroll_number = @userEnrollNumber
      `)

      if (result.rowsAffected[0] === 0) {
        // Trường hợp user chưa có trong app_users (chưa chạy login bao giờ)
        // Lấy từ auth-service upsert logic, nhưng ở đây có thể insert
        // Vì tính portable, nếu không có, nghĩa là chưa login bao giờ -> Lỗi
        return {
          ok: false,
          message: 'Không tìm thấy thông tin tài khoản ứng dụng'
        }
      }

      return {
        ok: true,
        message: 'Cập nhật ảnh đại diện thành công'
      }
    } catch (error) {
      console.error('[AvatarService] Lỗi khi cập nhật avatar:', error)
      return {
        ok: false,
        message: 'Có lỗi xảy ra khi lưu ảnh đại diện'
      }
    }
  }

  async removeAvatar(userEnrollNumber: number): Promise<MutationResult> {
    try {
      const pool = await getPool('app')
      const request = pool.request()
      request.input('userEnrollNumber', userEnrollNumber)
      request.input('updatedAt', formatSqlDateTime(new Date()))

      await request.query(`
        UPDATE dbo.app_users
        SET 
          avatar_base64 = NULL,
          updated_at = CONVERT(datetime2, @updatedAt, 120)
        WHERE user_enroll_number = @userEnrollNumber
      `)

      return {
        ok: true,
        message: 'Đã xóa ảnh đại diện'
      }
    } catch (error) {
      console.error('[AvatarService] Lỗi khi xóa avatar:', error)
      return {
        ok: false,
        message: 'Có lỗi xảy ra khi xóa ảnh đại diện'
      }
    }
  }
}

export const __internal = {
  validateAvatarPayload,
  MAX_AVATAR_DATA_URL_LENGTH
}
