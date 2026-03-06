# RashmiCoin Full Stack Starter

This project includes:
- ERC-20 smart contract (`RashmiCoin`, symbol `RSC`, cap `10,000,000`)
- Mint and burn support
- Transfer support between wallets
- MetaMask-based dashboard (balance + transfer + mint + burn)
- Express + MongoDB login API (register/login/JWT)
- 2nd dashboard for one-time notes with 16-digit key (create/open once/delete)
- One-time file sharing support in notes (image, video, document)
- Deployment scripts for Ethereum Sepolia, BNB Smart Chain Testnet, and Polygon Amoy

## 1) Install

```bash
npm install
```

## 2) Environment setup

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

Required fields:
- `MONGODB_URI`
- `JWT_SECRET`
- `VITE_TOKEN_ADDRESS` (after deployment)
- `PRIVATE_KEY` + chosen RPC URL for deployment (`SEPOLIA_RPC_URL`, `BSC_TESTNET_RPC_URL`, or `POLYGON_AMOY_RPC_URL`)
- Optional: `NOTE_MAX_FILE_MB` (default `20`) for one-time file upload limit

Important:
- Never commit real private keys.
- If you shared MongoDB credentials publicly, rotate them in MongoDB Atlas.

## 3) Run frontend + backend

```bash
npm run dev
```

(`npm run dev` now starts both API and frontend. `npm run dev:client` starts only frontend.)

Frontend: `http://localhost:3000`  
Backend: `http://localhost:4000`

## 4) Compile and test token contract

```bash
npm run token:compile
npm run token:test
```

## 5) Deploy token contract

Local ephemeral deployment:

```bash
npm run token:deploy:local
```

Public testnets:

```bash
npm run token:deploy:sepolia
npm run token:deploy:bscTestnet
npm run token:deploy:polygonAmoy
```

After deployment:
1. Copy deployed contract address from terminal output.
2. Set `VITE_TOKEN_ADDRESS` in `.env`.
3. Restart frontend server.

## API endpoints

- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/me` (Bearer token)
- `PUT /api/auth/wallet` (Bearer token)
- `POST /api/notes/create` (Bearer token, multipart form: `note`, optional `attachment`)
- `POST /api/notes/redeem` (no token required, one-time open; returns note + optional file)
- `GET /api/token/config`

## Token details in contract

- Name: `RashmiCoin`
- Symbol: `RSC`
- Max supply: `10,000,000 RSC` (18 decimals)
- Initial mint: full max supply to deployer/owner
- Mint: owner only, only if supply cap allows (typically after burns)
- Burn: any holder can burn own tokens
