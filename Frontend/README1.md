# Market Ticket NFT - Frontend (React + Vite + Wagmi)

Frontend cho hệ thống **bán vé sự kiện dạng NFT (ERC1155)**. Ứng dụng lấy danh sách sự kiện từ backend, hiển thị banner/chi tiết theo metadata NFT, cho phép **mua vé on-chain**, và đồng bộ purchase về backend.

## Tính năng chính

- **Home**
  - Gọi API `GET /api/getAllEvent` để lấy danh sách sự kiện.
  - Banner ưu tiên event từ backend có `contract.address` + `tokenId` (tokenId ở backend được hiểu là **số loại vé**: 1..tokenId).
  - Đọc on-chain để lấy giá vé, và fetch NFT metadata từ `uri(1)` (backend đã trả URL https nên không normalize IPFS).
  - Nút **“Mua Vé Ngay”** điều hướng sang trang detail và truyền state (contractAddress, tokenId, metadata) để load nhanh hơn.

- **Event Detail**
  - Hiển thị metadata NFT: title/description/image + event fields (date/time/location/organizer).
  - Nếu vào bằng URL trực tiếp, trang sẽ tự fallback gọi backend + đọc `uri(1)` để lấy metadata, tránh “Không tìm thấy sự kiện” bị flash.
  - Giá vé hiển thị dạng **min-max** dựa trên `ticketPrices` của các loại vé (1..tokenId).

- **Buy Ticket**
  - Dropdown chọn loại vé **Thường/VIP/VVIP** tương ứng tokenId 1..3 (hoặc 1..tokenIdCount).
  - Sau khi transaction on-chain confirm, frontend **POST** `POST /api/setpurchase` để lưu purchase (body: `chainId`, `contractAddress`, `quantity`).
  - Chỉ hiện **“Thành công!”** sau khi backend trả OK.

- **Profile**
  - Gọi `GET /api/me` lấy purchases, trích contract addresses để quét `balanceOf` on-chain cho tokenId 1..3.
  - Load thêm `getTicketType`, `ticketPrices`, `uri` để dựng danh sách “My Tickets”.

## Tech stack

- React + Vite + TypeScript
- Wagmi + Viem (read/write contract)
- RainbowKit (Connect Wallet)
- Axios (HTTP client + interceptor gắn JWT)

## API + JWT

- Token được lưu ở `localStorage` key: `auth_token`
- Mọi request qua `src/api/http.ts` sẽ tự gắn header:
  - `Authorization: Bearer <token>`
- Khi nhận 401, token sẽ bị xoá và bắn event `auth_token_changed` để UI reload lại.

## Chạy dự án

### Yêu cầu

- Node.js >= 18

### Cài dependencies

```bash
npm install
```

### Environment

Tạo `.env` (nếu repo có `.env.example` thì copy):

```bash
cp .env.example .env
```

Ví dụ biến thường dùng:

```env
VITE_WALLETCONNECT_PROJECT_ID=your_project_id_here
```

### Run dev

```bash
npm run dev
```

App chạy tại `http://localhost:3000`.

## Dev proxy / CORS

Trong dev, frontend gọi API theo prefix `/api`. Bạn có thể cấu hình proxy trong `vite.config.ts` để trỏ sang backend (ví dụ `http://localhost:4000`) nhằm tránh CORS.

## Cấu trúc thư mục (rút gọn)

```
src/
  abi/                  # ABI ERC1155 Ticket
  api/                  # Axios client + services (getAllEvent, me, setpurchase...)
  components/           # BuyTicket, WalletSignIn, Header...
  pages/                # Home, EventDetail, Profile
  hooks/                # Hook tiện ích (reload, drag scroll...)
```

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## License

MIT
