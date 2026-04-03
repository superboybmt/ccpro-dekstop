# Production Go-Live Checklist

> Mục tiêu của checklist này là trả lời rõ ràng: bản build hiện tại đã sẵn sàng cho production rộng, chỉ phù hợp pilot nội bộ, hay chưa nên phát hành.

## Release Readiness Summary

| Mục | Trạng thái | Owner | Bằng chứng cần có |
| --- | --- | --- | --- |
| Build và package pass | `DONE` | Engineering | `npm run build:portable` pass, artifact `release/CCPro-Portable-1.0.3.exe` đã tạo |
| Security baseline pass | `DONE` | Engineering | `npx vitest run` pass `210/210`, `npm run check:encoding` pass |
| SQL và LAN production-like pass | `PARTIAL` | IT / Engineering | Build packaged boot thành công, nhưng chưa có smoke test máy production-like cùng LAN thật |
| Device sync pass | `PARTIAL` | IT / Engineering | Worker đã được package, nhưng chưa verify sync end-to-end với thiết bị thật |
| Update flow pass | `PARTIAL` | Engineering | Automation pass cho legacy/signed/checksum, nhưng chưa smoke test manifest production thật |
| Rollback sẵn sàng | `PARTIAL` | Engineering / IT | Có artifact bản trước trong `release/`, nhưng chưa có runbook rollback riêng |
| Go / No-Go cuối cùng | `PILOT ONLY` | Engineering Lead | Đủ tốt cho pilot nội bộ có kiểm soát, chưa đủ bằng chứng để chốt production rộng |

## 1. Build & Package

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| `npx electron-vite build` pass trên branch release | `DONE` | Engineering | Log build pass | Đã pass ở vòng verify gần nhất |
| `npm run build:portable` pass và tạo đúng artifact | `DONE` | Engineering | File `release/CCPro-Portable-1.0.3.exe` | Build portable đã chạy thành công ngày 03/04/2026 |
| `device-sync-worker.exe` được đóng gói đúng vào `resources/device-sync/` | `DONE` | Engineering | `release/win-unpacked/resources/device-sync/device-sync-worker.exe` | Artifact có mặt đúng vị trí |
| `machine-config-helper.exe` được đóng gói đúng vào `resources/machine-config/` | `DONE` | Engineering | `release/win-unpacked/resources/machine-config/machine-config-helper.exe` | Artifact có mặt đúng vị trí |
| Chạy được build packaged trên máy sạch không cần dev tool | `PARTIAL` | Engineering / IT | `release/win-unpacked/App Cham cong PNJ.exe` boot thành công trên máy hiện tại | Chưa verify trên máy sạch độc lập |

## 2. Security & Secrets

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Không còn hardcoded SQL password trong app path production | `DONE` | Engineering | Review code + script security tests | Env bắt buộc cho SQL password |
| `.env` production được cấp đúng trên máy đích | `PARTIAL` | IT | Máy hiện tại đã boot được packaged app | Chưa có bằng chứng cho toàn bộ máy rollout |
| `WISEEYE_SQL_PASSWORD` tồn tại và app fail rõ ràng nếu thiếu | `DONE` | Engineering | Test + runtime behavior đã verify | |
| Session key đang là per-machine và surviving update | `DONE` | Engineering | Unit tests | |
| `app:open-external` chỉ cho HTTPS | `DONE` | Engineering | Test pass | |
| Electron renderer sandbox đang bật | `DONE` | Engineering | Test + manual boot | |
| Login rate limiting hoạt động cho user và admin | `DONE` | Engineering | Unit tests | Cần thêm manual confirm nếu muốn chắc hơn |

## 3. Update & Release Integrity

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| `CCPRO_UPDATE_INTEGRITY_MODE` được chốt cho release này | `PARTIAL` | Engineering Lead | App hiện hỗ trợ `audit` và `enforce` | Chưa có quyết định rollout cuối cùng cho release thực |
| `CCPRO_UPDATE_PUBLIC_KEY` đã được cấp đúng trên máy production | `TODO` | Engineering / IT | Biên bản cấu hình | Bắt buộc nếu dùng signed manifest |
| Quy trình generate `checksumSha256` và `signature` đã được chạy cho release mới | `TODO` | Engineering | `version.json` phát hành + release note | Chưa có evidence release production thật |
| Manifest URL production đang là HTTPS hợp lệ | `DONE` | Engineering | Review config | |
| Legacy manifest vẫn hoạt động đúng trong `audit` mode | `DONE` | Engineering | Unit/UI tests pass | Notifier vẫn fallback `openExternal` cho legacy manifest |
| Signed manifest được app nhận là `verified` | `DONE` | Engineering | `update-service` tests pass | Đã verify bằng test ký RSA hợp lệ |
| Checksum mismatch bị chặn đúng và không mở installer lỗi | `DONE` | Engineering | `update-service` tests pass | Đã có test âm tính cho mismatch |
| Có tài liệu rollout update integrity | `DONE` | Engineering | [update-integrity-rollout.md](/E:/ccpro/docs/reports/update-integrity-rollout.md) | |

## 4. Database & Connectivity

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| App kết nối được SQL Server WiseEye trên mạng nội bộ thật | `TODO` | IT / Engineering | Đăng nhập và tải dashboard thành công | Chưa có smoke test production-like trong phiên này |
| App database `CCPRO_APP_DATABASE` tồn tại và init không lỗi | `PARTIAL` | Engineering | Packaged app boot thành công, startup log không báo startup error | Cần verify thêm trên máy rollout thật |
| DB name validation không chặn nhầm config hợp lệ | `DONE` | Engineering | Unit tests | |
| Mất kết nối LAN/SQL hiển thị lỗi rõ ràng và không crash | `DONE` | Engineering | UI tests | Nên smoke test thêm trên máy thật |
| Startup không tạo unhandled rejection khi thiếu config production bắt buộc | `PARTIAL` | Engineering | Các regression chính đã có test | Vẫn nên smoke test thêm trên máy cấu hình thiếu env |

## 5. Runtime Smoke Test

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Mở app packaged thành công trên máy production-like | `DONE` | Engineering | `release/win-unpacked/App Cham cong PNJ.exe` mở được, process responsive | Đã verify ngày 03/04/2026 |
| Employee login thành công | `TODO` | Engineering / IT | Screenshot / checklist | Chưa verify packaged flow với dữ liệu thật |
| Dashboard tải được dữ liệu | `TODO` | Engineering / IT | Screenshot / checklist | |
| Chấm công vào thành công | `TODO` | Engineering / IT | Dữ liệu punch + UI message | |
| Chấm công ra thành công | `TODO` | Engineering / IT | Dữ liệu punch + UI message | |
| History page tải được dữ liệu | `TODO` | Engineering / IT | Screenshot / checklist | |
| Admin login thành công | `TODO` | Engineering / IT | Screenshot / checklist | |
| Admin device config đọc/ghi được | `TODO` | Engineering / IT | Hành động save config thành công | |
| Avatar upload / remove hoạt động ổn | `TODO` | Engineering / IT | Manual smoke | |
| App đóng/mở lại không mất state bất thường | `PARTIAL` | Engineering / IT | Session store resilience và startup tests pass | Chưa có manual packaged reopen checklist |

## 6. Device Sync

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Worker packaged chạy được trên máy đích | `PARTIAL` | Engineering / IT | Worker exe đã được package đúng | Chưa verify sync end-to-end với thiết bị thật |
| Lần sync đầu hoàn tất không timeout | `TODO` | Engineering / IT | Device sync status | |
| Retry sync hoạt động | `TODO` | Engineering / IT | Device sync status | |
| Startup không lỗi nếu worker path sai hoặc thiếu | `DONE` | Engineering | Unit tests | Nhưng vẫn nên verify packaged path thật |
| Log sync đủ để support truy vết sự cố | `PARTIAL` | Engineering | Có startup log và status model | Cần confirm device-sync log trên máy thật |

## 7. Observability & Support

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| `startup.log` được ghi đúng trên máy production-like | `DONE` | Engineering / IT | File `%APPDATA%/ccpro-desktop/startup.log` có entry boot mới nhất | Đã verify packaged app |
| Có cách thu thập log khi user báo lỗi | `PARTIAL` | Support / IT | Hiện có `startup.log` | Chưa có hướng dẫn nội bộ thành văn bản |
| Có người trực hỗ trợ trong ngày rollout | `TODO` | Engineering Lead / IT | Lịch trực | |
| Có kênh báo sự cố rõ ràng | `TODO` | PM / IT | Nhóm chat / ticket queue | |

## 8. Rollback

| Checklist | Trạng thái | Owner | Bằng chứng | Ghi chú |
| --- | --- | --- | --- | --- |
| Giữ lại artifact của bản production trước | `DONE` | Engineering | `release/CCPro-Portable-1.0.0.exe`, `1.0.1.exe`, `1.0.2.exe` còn tồn tại | |
| Có hướng dẫn rollback bản portable | `TODO` | Engineering / IT | Tài liệu nội bộ | Với app portable thường là thay file + giữ config |
| Có hướng dẫn rollback manifest update | `TODO` | Engineering | Tài liệu nội bộ | Đặc biệt quan trọng khi bật signed manifest |
| Nếu release lỗi, có thể tắt update hoặc trỏ manifest về bản an toàn | `PARTIAL` | Engineering | App đang dùng manifest URL cấu hình được | Chưa có runbook thao tác chuẩn |

## 9. Final Sign-Off

| Vai trò | Trạng thái | Người xác nhận | Ghi chú |
| --- | --- | --- | --- |
| Engineering | `DONE` | Codex / Engineering | Code, test, build, packaged boot đã verify |
| IT / Infrastructure | `TODO` |  | Cần xác nhận môi trường máy thật, LAN, SQL, device |
| Product / Ops | `TODO` |  | Cần xác nhận cửa sổ rollout và support plan |
| Final decision | `PILOT ONLY` |  | Khuyến nghị hiện tại: pilot nội bộ có kiểm soát, chưa `GO` production rộng |

## Decision Rule

- Chỉ được chốt `GO` khi tất cả mục critical ở các phần `Build & Package`, `Security & Secrets`, `Update & Release Integrity`, `Database & Connectivity`, `Runtime Smoke Test`, `Rollback` đều đã có bằng chứng.
- Nếu automation pass nhưng smoke test máy thật chưa xong, chỉ nên chốt `PILOT ONLY`.
- Nếu `build:portable`, SQL/LAN thật, hoặc update flow production chưa được verify, giữ trạng thái `NO-GO`.
