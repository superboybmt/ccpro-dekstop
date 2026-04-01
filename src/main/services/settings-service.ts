import type { SettingsProfile } from '@shared/api'
import { getPool } from '../db/sql'

export class SettingsService {
  async getProfile(userEnrollNumber: number): Promise<SettingsProfile> {
    const pool = await getPool('wise-eye')
    const request = pool.request()
    request.input('userEnrollNumber', userEnrollNumber)

    const result = await request.query(`
      SELECT TOP 1
        u.UserFullName,
        u.UserFullCode,
        CONVERT(varchar(10), u.UserHireDay, 23) AS HireDate,
        rd.Description AS Department,
        s.SchName AS ScheduleName
      FROM dbo.UserInfo u
      LEFT JOIN dbo.RelationDept rd ON rd.ID = u.UserIDD
      LEFT JOIN dbo.Schedule s ON s.SchID = u.SchID
      WHERE u.UserEnrollNumber = @userEnrollNumber
    `)

    const row = result.recordset[0]

    return {
      fullName: row?.UserFullName ?? '',
      employeeCode: row?.UserFullCode ?? '',
      department: row?.Department ?? null,
      hireDate: row?.HireDate ?? null,
      scheduleName: row?.ScheduleName ?? null
    }
  }
}
