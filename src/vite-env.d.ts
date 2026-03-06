/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_TOKEN_ADDRESS?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_NAME?: string;
  readonly VITE_CHAIN_RPC_URL?: string;
  readonly VITE_CHAIN_CURRENCY_SYMBOL?: string;
  readonly VITE_CHAIN_BLOCK_EXPLORER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
