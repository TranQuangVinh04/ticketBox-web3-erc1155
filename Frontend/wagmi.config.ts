import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { mainnet, sepolia, polygon, arbitrum } from 'wagmi/chains'

function resolveWalletConnectProjectId() {
  // Primary: Vite env (requires dev-server restart after change)
  const fromEnv = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()

  // Runtime overrides (helpful when .env files are blocked or for quick testing):
  // - URL query: ?wcProjectId=xxxx
  // - localStorage: wc_project_id / wcProjectId / VITE_WALLETCONNECT_PROJECT_ID
  if (typeof window !== 'undefined') {
    try {
      const sp = new URLSearchParams(window.location.search)
      const q = sp.get('wcProjectId') || sp.get('wc_project_id')
      if (q && q.trim()) return q.trim()
    } catch {
      // ignore
    }

    try {
      const s =
        localStorage.getItem('wc_project_id') ||
        localStorage.getItem('wcProjectId') ||
        localStorage.getItem('VITE_WALLETCONNECT_PROJECT_ID')
      if (s && s.trim()) return s.trim()
    } catch {
      // ignore
    }
  }

  return undefined
}

// Lấy WalletConnect Project ID
// Đăng ký miễn phí tại: https://cloud.walletconnect.com/
const projectId = resolveWalletConnectProjectId()

if (!projectId) {
  console.warn(
    '[wagmi] Missing WalletConnect Project ID. WalletConnect option may not work. ' +
      'Set VITE_WALLETCONNECT_PROJECT_ID (restart dev server) or use ?wcProjectId=... / localStorage wc_project_id.',
  )
}

// Cấu hình các chuỗi blockchain bạn muốn hỗ trợ
// getDefaultConfig tự động cấu hình các connectors (MetaMask, WalletConnect, Coinbase Wallet)
// Lưu ý: Nếu không có projectId, WalletConnect sẽ không hoạt động nhưng MetaMask vẫn dùng được
export const config = getDefaultConfig({
  appName: 'Web3 Frontend App',
  // NOTE: getDefaultConfig requires a string. If missing, keep a harmless placeholder but we warn above.
  projectId: projectId || '00000000000000000000000000000000',
  chains: [sepolia],
  ssr: true, // Tránh lỗi connector.getChainId sau refresh
})

// Khai báo kiểu cho Wagmi
declare module 'wagmi' {
  interface Register {
    config: typeof config
  }
}
