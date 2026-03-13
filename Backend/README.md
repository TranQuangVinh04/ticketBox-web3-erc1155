## Wallet Auth + Event Tickets Backend

Backend Express + Prisma (Postgres) cho flow:
**Connect ví → Nonce → SignMessage → Verify → JWT → /me**  
và lưu “user đã mua vé” vào DB.

### Cài đặt & chạy

1) Cài dependencies:

```bash
npm install
```

2) Tạo file `.env` (tự tạo, repo không có `env.example`):

```bash
PORT=4000
NODE_ENV=development
JWT_SECRET=your-super-secret-at-least-16-chars
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DB_NAME?schema=public
```

3) Migrate DB + generate Prisma client:

```bash
npx prisma migrate dev
npx prisma generate
```

4) Run dev:

```bash
npm run dev
```

### Auth flow

- **GET** `/auth/wallet/nonce?address=0x...`
  - Trả về `{ nonce, message, ... }` để frontend ký.
- **POST** `/auth/wallet/verify`
  - Body: `{ message, signature, address? }`
  - Trả về `{ ok: true, token, user }`

Backend hỗ trợ cả base path **có** và **không có** `/api`:
- Ví dụ: `/auth/wallet/nonce` **hoặc** `/api/auth/wallet/nonce`

### API

- **GET** `/me` (cần auth)
  - Header: `Authorization: Bearer <token>`
- **GET** `/getAllEvent`
  - Trả về events + contract (có `jsonSafe` để tránh lỗi BigInt)
- **POST** `/setpurchase` (cần auth)
  - Header: `Authorization: Bearer <token>`
  - Body: `{ chainId, contractAddress, quantity }`
  - Trả về `{ ok: true, message: "SET_PURCHASE_SUCCESS", purchase: ... }`

### Ví dụ curl

Lấy nonce:

```bash
curl "http://localhost:4000/api/auth/wallet/nonce?address=0xYourWallet"
```

Verify (sau khi ký message ở frontend):

```bash
curl -X POST "http://localhost:4000/api/auth/wallet/verify" \
  -H "Content-Type: application/json" \
  -d '{"message":"...","signature":"0x..."}'
```

Gọi /me:

```bash
curl "http://localhost:4000/api/me" \
  -H "Authorization: Bearer YOUR_JWT"
```

Ghi purchase:

```bash
curl -X POST "http://localhost:4000/api/setpurchase" \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{"chainId":8453,"contractAddress":"0x...","quantity":2}'
```

### Prisma Studio (xem dữ liệu)

```bash
npm run prisma:studio
```

