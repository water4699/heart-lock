"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";
import { motion } from "framer-motion";
import { GraduationCap, BookOpen, Award, ShieldCheck } from "lucide-react";
import { useFhevm } from "@/fhevm/useFhevm";
import { EncryptedPeerReviewABI } from "@/abi/EncryptedPeerReviewABI";
import { EncryptedPeerReviewAddresses } from "@/abi/EncryptedPeerReviewAddresses";

const HARDHAT_RPC_URL = process.env.NEXT_PUBLIC_HARDHAT_RPC_URL ?? "http://localhost:8545";
const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? "11155111");

function getContractByChainId(chainId: number | undefined) {
  const resolvedChainId = chainId ?? DEFAULT_CHAIN_ID;
  const entry =
    EncryptedPeerReviewAddresses[resolvedChainId.toString() as keyof typeof EncryptedPeerReviewAddresses];

  if (!entry || entry.address === ethers.ZeroAddress) {
    return { abi: EncryptedPeerReviewABI.abi, chainId: resolvedChainId };
  }

  return {
    abi: EncryptedPeerReviewABI.abi,
    address: entry.address as `0x${string}`,
    chainId: entry.chainId,
    chainName: entry.chainName,
  };
}

export const DashboardPage = () => {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  const fhevmProvider = walletClient?.transport ?? (isConnected ? undefined : HARDHAT_RPC_URL);
  const {
    status: fhevmStatus,
  } = useFhevm({
    provider: fhevmProvider,
    chainId: chainId ? Number(chainId) : DEFAULT_CHAIN_ID,
    initialMockChains: { 31337: HARDHAT_RPC_URL },
    enabled: Boolean(fhevmProvider),
  });

  const effectiveChainId = useMemo(
    () => (chainId ? Number(chainId) : DEFAULT_CHAIN_ID),
    [chainId],
  );

  const contractInfo = useMemo(() => getContractByChainId(effectiveChainId), [effectiveChainId]);

  const [participantCount, setParticipantCount] = useState<number>(0);
  const [, setManagerAddress] = useState<string | undefined>(undefined);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [refreshToken] = useState(0);

  const contractRunner = useMemo(() => {
    if (walletClient) {
      const provider = new ethers.BrowserProvider(walletClient.transport);
      return provider;
    }
    return new ethers.JsonRpcProvider(HARDHAT_RPC_URL);
  }, [walletClient]);

  const contractForRead = useMemo(() => {
    if (!contractInfo.address || !contractRunner) {
      return undefined;
    }
    return new ethers.Contract(contractInfo.address, contractInfo.abi, contractRunner);
  }, [contractInfo, contractRunner]);

  useEffect(() => {
    if (!contractForRead) {
      setParticipantCount(0);
      setHasSubmitted(false);
      setManagerAddress(undefined);
      return;
    }

    let cancelled = false;

    const fetchSnapshot = async () => {
      try {
        const [count, manager] = await Promise.all([
          contractForRead.participantCount(),
          contractForRead.manager(),
        ]);

        if (!cancelled) {
          setParticipantCount(Number(count));
          setManagerAddress(manager);
        }

        if (address) {
          const submitted = await contractForRead.hasSubmitted(address);
          if (!cancelled) {
            setHasSubmitted(submitted);
          }
        } else if (!cancelled) {
          setHasSubmitted(false);
        }
      } catch (error) {
        console.error("Failed to fetch snapshot:", error);
      }
    };

    fetchSnapshot();
    const interval = setInterval(fetchSnapshot, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [contractForRead, address, refreshToken]);

  const stats = [
    {
      label: "Reviewers",
      value: participantCount,
      icon: GraduationCap,
      color: "from-blue-500 to-cyan-500",
    },
    {
      label: "Review Status",
      value: hasSubmitted ? "Submitted" : "Pending",
      icon: hasSubmitted ? BookOpen : BookOpen,
      color: hasSubmitted ? "from-green-500 to-emerald-500" : "from-gray-500 to-slate-500",
    },
    {
      label: "Encryption Status",
      value: fhevmStatus === "ready" ? "Active" : "Initializing",
      icon: ShieldCheck,
      color: fhevmStatus === "ready" ? "from-purple-500 to-pink-500" : "from-yellow-500 to-orange-500",
    },
    {
      label: "Network",
      value: contractInfo.chainName || `Chain ${effectiveChainId}`,
      icon: Award,
      color: "from-indigo-500 to-purple-500",
    },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-[#0f1d40] mb-2">Academic Review Dashboard</h1>
        <p className="text-slate-600">Overview of your encrypted academic peer review system</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="relative overflow-hidden rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-6 group hover:shadow-xl transition-shadow duration-300"
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${stat.color} opacity-0 group-hover:opacity-10 transition-opacity duration-300`} />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className={`p-3 rounded-xl bg-gradient-to-br ${stat.color} shadow-lg relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-white/20 backdrop-blur-sm"></div>
                    <Icon className={`w-6 h-6 text-white relative z-10 drop-shadow-md`} fill="currentColor" strokeWidth={2} />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-[#0f1d40]">{stat.value}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.4 }}
        className="rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-8"
      >
        <h2 className="text-2xl font-bold text-[#0f1d40] mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <motion.a
            href="/submit"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-6 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 text-white hover:shadow-lg transition-shadow"
          >
            <h3 className="font-semibold mb-2">Submit Review</h3>
            <p className="text-sm opacity-90">Encrypt and submit your academic review score</p>
          </motion.a>
          <motion.a
            href="/decrypt"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-6 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-white hover:shadow-lg transition-shadow"
          >
            <h3 className="font-semibold mb-2">View Results</h3>
            <p className="text-sm opacity-90">Decrypt and view your review scores and averages</p>
          </motion.a>
          <motion.a
            href="/analytics"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="p-6 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 text-white hover:shadow-lg transition-shadow"
          >
            <h3 className="font-semibold mb-2">Analytics</h3>
            <p className="text-sm opacity-90">View detailed review statistics and insights</p>
          </motion.a>
        </div>
      </motion.div>
    </div>
  );
};

