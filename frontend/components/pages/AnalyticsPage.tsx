"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";
import { motion } from "framer-motion";
import { GraduationCap, Award, BookOpen, ShieldCheck, Lock } from "lucide-react";
import { useFhevm } from "@/fhevm/useFhevm";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { EncryptedPeerReviewABI } from "@/abi/EncryptedPeerReviewABI";
import { EncryptedPeerReviewAddresses } from "@/abi/EncryptedPeerReviewAddresses";
import type { FhevmInstance } from "@/fhevm/fhevmTypes";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

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

const COLORS = ["#0f1d40", "#1b58d9", "#20c4ff"];

export const AnalyticsPage = () => {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();

  const fhevmProvider = walletClient?.transport ?? (isConnected ? undefined : HARDHAT_RPC_URL);
  const {
    instance: fhevmInstance,
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
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [managerAddress, setManagerAddress] = useState<string | undefined>(undefined);
  const [teamAverage, setTeamAverage] = useState<bigint | null>(null);
  const [isDecryptingAverage, setIsDecryptingAverage] = useState<boolean>(false);
  const [refreshToken] = useState(0);

  const [signer, setSigner] = useState<ethers.JsonRpcSigner | undefined>(undefined);

  useEffect(() => {
    const setupSigner = async () => {
      if (walletClient) {
        try {
          const provider = new ethers.BrowserProvider(walletClient.transport);
          const s = await provider.getSigner();
          setSigner(s);
        } catch (error) {
          console.error("Failed to get signer:", error);
        }
      }
    };
    setupSigner();
  }, [walletClient]);

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

  const contractForAccount = useMemo(() => {
    if (!contractInfo.address || !signer) {
      return undefined;
    }
    return new ethers.Contract(contractInfo.address, contractInfo.abi, signer);
  }, [contractInfo, signer]);

  const decryptHandle = useCallback(
    async (handle: string, instance: FhevmInstance, storage: GenericStringStorage) => {
      if (!contractInfo.address || !signer) {
        throw new Error("FHE permissions are not ready yet. Connect your wallet.");
      }

      const signature = await FhevmDecryptionSignature.loadOrSign(
        instance,
        [contractInfo.address],
        signer,
        storage,
      );

      if (!signature) {
        throw new Error("Failed to prepare FHE decryption signature");
      }

      const decrypted = await instance.userDecrypt(
        [{ handle, contractAddress: contractInfo.address }],
        signature.privateKey,
        signature.publicKey,
        signature.signature,
        signature.contractAddresses,
        signature.userAddress,
        signature.startTimestamp,
        signature.durationDays,
      );

      return decrypted[handle] as bigint;
    },
    [contractInfo.address, signer],
  );

  // Fetch real data from contract
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

  const fetchAverage = useCallback(async () => {
    if (!contractForAccount || !fhevmInstance || !contractInfo.address || !signer) {
      return;
    }

    setIsDecryptingAverage(true);

    try {
      const tx = await contractForAccount.requestAverageAccess();
      await tx.wait();

      const [encryptedAverage] = await contractForAccount.getEncryptedAverage();
      const handle = typeof encryptedAverage === 'string'
        ? encryptedAverage
        : ethers.hexlify(encryptedAverage);
      const clearAverage = await decryptHandle(handle, fhevmInstance as FhevmInstance, fhevmDecryptionSignatureStorage);

      setTeamAverage(clearAverage);
    } catch (error) {
      console.error("Failed to decrypt average:", error);
    } finally {
      setIsDecryptingAverage(false);
    }
  }, [
    contractForAccount,
    fhevmInstance,
    contractInfo.address,
    decryptHandle,
    fhevmDecryptionSignatureStorage,
    signer,
  ]);

  // Auto-fetch average if user has submitted
  useEffect(() => {
    if (hasSubmitted && participantCount > 0 && !teamAverage && !isDecryptingAverage && fhevmStatus === "ready" && contractForAccount) {
      fetchAverage();
    }
  }, [hasSubmitted, participantCount, teamAverage, isDecryptingAverage, fhevmStatus, contractForAccount, fetchAverage]);

  // Real participation data - only what we can get from contract
  // Note: We only know how many have submitted, not how many are expected

  const isManager = useMemo(() => {
    if (!managerAddress || !address) {
      return false;
    }
    return managerAddress.toLowerCase() === address.toLowerCase();
  }, [managerAddress, address]);

  const stats = [
    {
      label: "Total Reviewers",
      value: participantCount,
      icon: GraduationCap,
      color: "from-blue-500 to-cyan-500",
      description: "Number of reviewers who submitted academic reviews",
    },
    {
      label: "Review Average",
      value: teamAverage !== null ? Number(teamAverage).toFixed(1) : "—",
      icon: Award,
      color: "from-purple-500 to-pink-500",
      description: teamAverage !== null 
        ? "Decrypted average score from all review submissions"
        : "Connect wallet and submit a review to view",
      isLoading: isDecryptingAverage,
    },
    {
      label: "Review Status",
      value: hasSubmitted ? "Submitted" : "Pending",
      icon: hasSubmitted ? BookOpen : BookOpen,
      color: hasSubmitted ? "from-green-500 to-emerald-500" : "from-gray-500 to-slate-500",
      description: hasSubmitted 
        ? "You have submitted your encrypted review score"
        : "You haven't submitted a review yet",
    },
    {
      label: "Encryption Status",
      value: fhevmStatus === "ready" ? "Active" : "Initializing",
      icon: ShieldCheck,
      color: fhevmStatus === "ready" ? "from-indigo-500 to-purple-500" : "from-yellow-500 to-orange-500",
      description: fhevmStatus === "ready"
        ? "Fully Homomorphic Encryption is ready"
        : "FHE system is initializing",
    },
  ];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-[#0f1d40] mb-2">Review Analytics Dashboard</h1>
        <p className="text-slate-600">Comprehensive insights and statistics from academic reviews</p>
      </motion.div>

      {/* Stats Grid */}
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
                  {stat.isLoading && (
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                      className="w-5 h-5 border-2 border-slate-400 border-t-transparent rounded-full"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-medium text-slate-600">{stat.label}</p>
                  <p className="text-2xl font-bold text-[#0f1d40]">{stat.value}</p>
                  <p className="text-xs text-slate-500 mt-2">{stat.description}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Participation Chart - Only shows what we know */}
      {participantCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-6"
        >
          <h2 className="text-xl font-bold text-[#0f1d40] mb-4">Review Participation</h2>
          <p className="text-sm text-slate-600 mb-4">
            {participantCount} reviewer{participantCount !== 1 ? 's' : ''} have submitted encrypted review scores
          </p>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={[{ name: "Submitted", value: participantCount }]}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${value}`}
                outerRadius={100}
                fill="#8884d8"
                dataKey="value"
              >
                <Cell fill={COLORS[0]} />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </motion.div>
      )}

      {/* Manager Info */}
      {isManager && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-6"
        >
          <h2 className="text-xl font-bold text-[#0f1d40] mb-4">Manager Access</h2>
          <p className="text-sm text-slate-600">
            You are the contract manager. You have access to decrypt the total encrypted score.
          </p>
        </motion.div>
      )}

      {/* Info about data limitations */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
        className="rounded-2xl bg-blue-50/90 backdrop-blur-lg shadow-lg border border-blue-200 p-6"
      >
        <div className="flex items-start gap-3">
          <Lock className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Academic Review Privacy</h3>
            <p className="text-sm text-blue-700">
              All review scores are encrypted using Fully Homomorphic Encryption (FHE). 
              Individual review scores cannot be viewed without decryption permissions. 
              Only aggregated data (like the average) can be decrypted by authorized reviewers, ensuring complete anonymity in the academic peer review process.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
