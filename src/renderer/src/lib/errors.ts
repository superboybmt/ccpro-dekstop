export const toUiErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) {
    return fallback
  }

  const normalized = error.message.toLowerCase()

  if (
    normalized.includes('failed to connect') ||
    normalized.includes('econnrefused') ||
    normalized.includes('timeout') ||
    normalized.includes('timed out') ||
    normalized.includes('sql') ||
    normalized.includes('login failed') ||
    normalized.includes('ehostunreach')
  ) {
    return 'Không thể kết nối SQL Server. Vui lòng kiểm tra mạng LAN hoặc thử lại sau.'
  }

  if (normalized.includes('phiên đăng nhập')) {
    return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
  }

  return error.message || fallback
}
