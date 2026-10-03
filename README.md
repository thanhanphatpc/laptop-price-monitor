# Laptop Price Monitor — An Phát PC

Theo dõi giá laptop hằng ngày của An Phát và các đối thủ (Thế Giới Di Động, CellphoneS, Phong Vũ), ghi vào Google Sheet và xuất ra dashboard trên GitHub Pages.

- Dashboard: `https://thanhanphatpc.github.io/laptop-price-monitor/dashboard/`
- Lịch chạy: 01:13 sáng mỗi ngày (giờ VN), file `.github/workflows/scrape.yml`
- Chạy tay: tab **Actions → Multi-Dealer Laptop Scraper → Run workflow**, để mặc định (chỉ tick `run_scrape`).

## Cài đặt (Settings → Secrets and variables → Actions)

| Secret | Bắt buộc | Nội dung |
|---|---|---|
| `SPREADSHEET_ID` | Có | ID Google Sheet "Laptop Price Monitor - An Phát PC" |
| `GOOGLE_CREDENTIALS` | Có | JSON service account có quyền sửa Sheet |
| `MBW_PROXY_HOST` | Có | Địa chỉ Cloudflare Worker proxy cho thegioididong.com |
| `OPS_BOT_TOKEN`, `OPS_CHAT_ID` | Nên có | Bot Telegram nhận báo cáo và cảnh báo sụt dữ liệu |

Ngoài ra cần bật:
- **Settings → Actions → General → Workflow permissions: Read and write** (workflow tự commit `dashboard/data.csv`).
- **Settings → Pages → Deploy from branch: `main` / `(root)`**.

Các job dùng máy self-hosted hoặc Bright Data (FPT, Phong Vũ dự phòng) được giữ trong workflow nhưng tự bỏ qua khi không có máy/secret tương ứng.

## Nguồn gốc

Bản này được tách độc lập từ dự án `MBW-Scrape-number` của tác giả **hoangphuc1809-source** (Trần Hoàng Phúc), sử dụng theo giấy phép của dự án gốc. Từ ngày 03/10/2026 được An Phát PC vận hành và chỉnh sửa riêng, không đồng bộ ngược về dự án gốc.
