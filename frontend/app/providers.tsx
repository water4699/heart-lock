"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  RainbowKitProvider,
  darkTheme,
  connectorsForWallets,
} from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { createConfig, http, WagmiProvider } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";

import { InMemoryStorageProvider } from "@/hooks/useInMemoryStorage";

type Props = {
  children: ReactNode;
};

const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "00000000000000000000000000000000";
const hardhatRpcUrl = process.env.NEXT_PUBLIC_HARDHAT_RPC_URL ?? "http://localhost:8545";
const sepoliaRpcUrl = process.env.NEXT_PUBLIC_SEPOLIA_RPC_URL;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [rainbowWallet, walletConnectWallet, metaMaskWallet],
    },
  ],
  {
    projectId,
    appName: "CipherScore",
  }
);

// Suppress WalletConnect analytics warnings for localhost
if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  const originalError = console.error;
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === "string" && (args[0].includes("not found on Allowlist") || args[0].includes("cloud.reown.com"))) {
      return; // Suppress WalletConnect allowlist warnings
    }
    originalError.apply(console, args);
  };
}

const wagmiConfig = createConfig({
  connectors,
  chains: [hardhat, sepolia] as const,
  transports: {
    [hardhat.id]: http(hardhatRpcUrl),
    [sepolia.id]: http(sepoliaRpcUrl ?? "https://rpc.sepolia.org"),
  },
  ssr: true,
});

export function Providers({ children }: Props) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({ accentColor: "#0f1d40", accentColorForeground: "#f2f7ff" })}
          modalSize="compact"
          locale="en-US"
        >
          <InMemoryStorageProvider>{children}</InMemoryStorageProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Commit marker: add_rainbowkit - 2025-11-03T16:00:00-08:00

