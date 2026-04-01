import { describe, expect, it } from 'vitest'
import type { NotificationItem } from '@shared/api'
import { formatAppDateKey, formatAppTimeKey, parseAppDateTime } from '@shared/app-time'
import { NotificationService } from '../notification-service'
import { classifyNotificationPunches } from '../notification-inout'

interface TestPunchRecord {
  time: Date
  type: 'I' | 'O' | null
  workDate: string
}

interface StoredNotification extends NotificationItem {
  notificationKey: string
}

const createRepository = (args: {
  punches: TestPunchRecord[]
  dayConfigsByDate?: Record<string, any>
  notifications?: StoredNotification[]
}) => {
  const notifications = [...(args.notifications ?? [])]
  const upserted: Array<Record<string, unknown>> = []
  const reconciled: Array<Record<string, unknown>> = []

  const repository: any = {
    getDayConfigForUser: async (_userEnrollNumber: number, date: Date) =>
      args.dayConfigsByDate?.[formatAppDateKey(date)] ?? {
        shift: {
          shiftName: 'Hanh chanh',
          shiftCode: 'HC',
          onduty: '07:30',
          offduty: '17:00',
          onLunch: '11:30',
          offLunch: '13:00',
          workingMinutes: 510,
          lateGraceMinutes: 0,
          isAbsentSaturday: false,
          isAbsentSunday: false
        },
        inOutId: 1,
        inOutCode: 'TD-HC',
        inOutName: 'Tu dong trong ngay',
        inOutMode: 0,
        windows: []
      },
    getPunchesForRange: async () => args.punches,
    upsertNotification: async (draft: {
      notificationKey: string
      category: 'late' | 'missing-checkout' | 'system'
      title: string
      description: string
      eventDate: string
    }) => {
      upserted.push(draft)
      const existing = notifications.findIndex((item) => item.notificationKey === draft.notificationKey)
      const nextItem: StoredNotification = {
        id: existing >= 0 ? notifications[existing]!.id : notifications.length + 1,
        notificationKey: draft.notificationKey,
        category: draft.category,
        title: draft.title,
        description: draft.description,
        createdAt: '2026-03-31T07:22:07.000Z',
        eventDate: draft.eventDate,
        isRead: false
      }

      if (existing >= 0) {
        notifications[existing] = nextItem
      } else {
        notifications.push(nextItem)
      }
    },
    reconcileNotifications: async (
      _userEnrollNumber: number,
      drafts: Array<{
        notificationKey: string
        category: 'late' | 'missing-checkout' | 'system'
        title: string
        description: string
        eventDate: string
      }>
    ) => {
      reconciled.push(...drafts)
      const draftKeys = new Set(drafts.map((item) => item.notificationKey))
      const preserved = notifications.filter(
        (item) =>
          item.category === 'system' ||
          !['late', 'missing-checkout'].includes(item.category) ||
          draftKeys.has(item.notificationKey)
      )

      notifications.splice(0, notifications.length, ...preserved)

      for (const draft of drafts) {
        const existing = notifications.findIndex((item) => item.notificationKey === draft.notificationKey)
        const nextItem: StoredNotification = {
          id: existing >= 0 ? notifications[existing]!.id : notifications.length + 1,
          notificationKey: draft.notificationKey,
          category: draft.category,
          title: draft.title,
          description: draft.description,
          createdAt: '2026-03-31T07:22:07.000Z',
          eventDate: draft.eventDate,
          isRead: false
        }

        if (existing >= 0) {
          notifications[existing] = nextItem
        } else {
          notifications.push(nextItem)
        }
      }
    },
    listNotifications: async () =>
      notifications.map(({ notificationKey: _notificationKey, ...item }) => item),
    markRead: async () => undefined,
    markAllRead: async () => undefined
  }

  return {
    repository,
    getUpserted: () => upserted,
    getReconciled: () => reconciled
  }
}

describe('NotificationService', () => {
  it('groups by work date and removes stale missing-checkout notifications during reconciliation', async () => {
    const repo = createRepository({
      punches: [
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 07:30:00'), type: 'I' },
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 17:10:00'), type: 'I' }
      ],
      notifications: [
        {
          id: 1,
          notificationKey: 'missing:1:2026-03-30',
          category: 'missing-checkout',
          title: 'Thiếu chấm ra',
          description: 'Bạn chưa chấm ra ngày 30/03/2026',
          createdAt: '2026-03-31T07:22:07.000Z',
          eventDate: '2026-03-30',
          isRead: false
        },
        {
          id: 2,
          notificationKey: 'system:welcome',
          category: 'system',
          title: 'System',
          description: 'Keep me',
          createdAt: '2026-03-31T07:22:07.000Z',
          eventDate: null,
          isRead: false
        }
      ]
    })

    const service = new NotificationService(repo.repository)
    const notifications = await service.list(1)

    expect(repo.getUpserted()).toEqual([])
    expect(repo.getReconciled()).toEqual([])
    expect(notifications).toEqual([
      expect.objectContaining({
        category: 'system',
        title: 'System'
      })
    ])
  })

  it('creates missing-checkout when no punch lands in the final checkout window even if raw types are all I', async () => {
    const repo = createRepository({
      punches: [
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 07:30:00'), type: 'I' },
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 12:00:00'), type: 'I' },
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 13:00:00'), type: 'I' }
      ]
    })

    const service = new NotificationService(repo.repository)
    const notifications = await service.list(1)

    expect(repo.getReconciled()).toEqual([
      expect.objectContaining({
        notificationKey: 'missing:1:2026-03-30',
        category: 'missing-checkout',
        eventDate: '2026-03-30'
      })
    ])
    expect(notifications).toEqual([
      expect.objectContaining({
        category: 'missing-checkout',
        eventDate: '2026-03-30'
      })
    ])
  })

  it('creates a late notification when all raw punches are I but the first morning window punch is late', async () => {
    const repo = createRepository({
      punches: [
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 08:30:00'), type: 'I' },
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 17:05:00'), type: 'I' }
      ],
      dayConfigsByDate: {
        '2026-03-30': {
          shift: {
            shiftName: 'Khoang gio',
            shiftCode: 'PG',
            onduty: '07:30',
            offduty: '17:00',
            onLunch: '11:30',
            offLunch: '13:00',
            workingMinutes: 510,
            lateGraceMinutes: 0,
            isAbsentSaturday: false,
            isAbsentSunday: false
          },
          inOutId: 3,
          inOutCode: 'PGio',
          inOutName: 'Theo khoang gio',
          inOutMode: 1,
          windows: [
            { startIn: '05:00', endIn: '09:00', startOut: '09:01', endOut: '12:15' },
            { startIn: '12:16', endIn: '15:00', startOut: '15:01', endOut: '23:00' }
          ]
        }
      }
    })

    const service = new NotificationService(repo.repository)
    const notifications = await service.list(1)

    expect(repo.getReconciled()).toEqual([
      expect.objectContaining({
        notificationKey: 'late:1:2026-03-30',
        category: 'late'
      })
    ])
    expect(notifications).toEqual([
      expect.objectContaining({
        category: 'late',
        eventDate: '2026-03-30'
      })
    ])
  })

  it('resolves day config per work date instead of reusing one shift for the full range', async () => {
    const repo = createRepository({
      punches: [
        { workDate: '2026-03-29', time: parseAppDateTime('2026-03-29 08:00:00'), type: 'I' },
        { workDate: '2026-03-29', time: parseAppDateTime('2026-03-29 17:05:00'), type: 'I' },
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 08:00:00'), type: 'I' },
        { workDate: '2026-03-30', time: parseAppDateTime('2026-03-30 17:05:00'), type: 'I' }
      ],
      dayConfigsByDate: {
        '2026-03-29': {
          shift: {
            shiftName: 'Shift A',
            shiftCode: 'A',
            onduty: '07:30',
            offduty: '17:00',
            onLunch: '11:30',
            offLunch: '13:00',
            workingMinutes: 510,
            lateGraceMinutes: 0,
            isAbsentSaturday: false,
            isAbsentSunday: false
          },
          inOutId: 1,
          inOutCode: 'TD-HC',
          inOutName: 'Tu dong',
          inOutMode: 0,
          windows: []
        },
        '2026-03-30': {
          shift: {
            shiftName: 'Shift B',
            shiftCode: 'B',
            onduty: '08:15',
            offduty: '17:00',
            onLunch: '11:30',
            offLunch: '13:00',
            workingMinutes: 510,
            lateGraceMinutes: 0,
            isAbsentSaturday: false,
            isAbsentSunday: false
          },
          inOutId: 1,
          inOutCode: 'TD-HC',
          inOutName: 'Tu dong',
          inOutMode: 0,
          windows: []
        }
      }
    })

    const service = new NotificationService(repo.repository)
    const notifications = await service.list(1)

    expect(notifications).toEqual([
      expect.objectContaining({
        category: 'late',
        eventDate: '2026-03-29'
      })
    ])
  })
})

describe('classifyNotificationPunches', () => {
  it('uses explicit first-in and final-out windows before looking at raw I/O', () => {
    const punches = [
      { time: parseAppDateTime('2026-03-30 08:30:00'), type: 'I' as const },
      { time: parseAppDateTime('2026-03-30 17:10:00'), type: 'I' as const }
    ]

    const result = classifyNotificationPunches(punches, {
      inOutMode: 1,
      shift: {
        onduty: '07:30',
        offduty: '17:00',
        onLunch: '11:30',
        offLunch: '13:00'
      },
      windows: [
        { startIn: '05:00', endIn: '09:00', startOut: '09:01', endOut: '12:15' },
        { startIn: '12:16', endIn: '15:00', startOut: '15:01', endOut: '23:00' }
      ]
    })

    expect(result.strategy).toBe('window')
    expect(formatAppTimeKey(result.firstArrivalPunch!.time)).toBe('08:30')
    expect(formatAppTimeKey(result.finalCheckoutPunch!.time)).toBe('17:10')
  })

  it('falls back to raw I/O only when no usable schedule window exists', () => {
    const punches = [
      { time: parseAppDateTime('2026-03-30 13:00:00'), type: 'I' as const },
      { time: parseAppDateTime('2026-03-30 17:00:00'), type: 'O' as const }
    ]

    const result = classifyNotificationPunches(punches, {
      inOutMode: 4,
      shift: null,
      windows: []
    })

    expect(result.strategy).toBe('raw')
    expect(formatAppTimeKey(result.firstArrivalPunch!.time)).toBe('13:00')
    expect(result.finalCheckoutPunch).toBeNull()
  })
})
