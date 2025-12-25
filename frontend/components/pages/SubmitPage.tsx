"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";
import { motion } from "framer-motion";
import { Lock, CheckCircle2, FileCheck } from "lucide-react";
import { useFhevm } from "@/fhevm/useFhevm";
import { EncryptedPeerReviewABI } from "@/abi/EncryptedPeerReviewABI";
import { EncryptedPeerReviewAddresses } from "@/abi/EncryptedPeerReviewAddresses";
import type { FhevmInstance } from "@/fhevm/fhevmTypes";

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

export const SubmitPage = () => {
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

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

  const [scoreInput, setScoreInput] = useState<number>(70);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [success, setSuccess] = useState(false);

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

  const contractForAccount = useMemo(() => {
    if (!contractInfo.address || !signer) {
      return undefined;
    }
    return new ethers.Contract(contractInfo.address, contractInfo.abi, signer);
  }, [contractInfo, signer]);

  const submitScore = useCallback(async () => {
    if (!contractInfo.address || !contractForAccount || !fhevmInstance || !signer || !address) {
      setMessage("Connect your wallet on a supported chain before submitting a score.");
      return;
    }

    if (scoreInput < 0 || scoreInput > 100) {
      setMessage("Scores must be between 0 and 100.");
      return;
    }

    setIsSubmitting(true);
    setMessage("Encrypting score...");
    setSuccess(false);

    try {
      const input = (fhevmInstance as FhevmInstance).createEncryptedInput(
        contractInfo.address,
        address as `0x${string}`
      );
      input.add32(scoreInput);

      const encrypted = await input.encrypt();

      setMessage("Submitting encrypted score...");
      const tx = await contractForAccount.submitScore(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      setMessage("Score submitted successfully!");
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        setMessage("");
      }, 3000);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Score submission failed:", error);
      setMessage(`Failed to submit score: ${errorMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  }, [
    contractForAccount,
    contractInfo.address,
    fhevmInstance,
    signer,
    address,
    scoreInput,
  ]);

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-[#0f1d40] mb-2">Submit Review Score</h1>
        <p className="text-slate-600">Encrypt and submit your academic review score securely</p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-8"
      >
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Review Score (0-100)
            </label>
            <div className="relative">
              <input
                type="range"
                min="0"
                max="100"
                value={scoreInput}
                onChange={(e) => setScoreInput(Number(e.target.value))}
                className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-[#0f1d40]"
              />
              <div className="flex justify-between mt-2 text-xs text-slate-500">
                <span>0</span>
                <span className="text-lg font-bold text-[#0f1d40]">{scoreInput}</span>
                <span>100</span>
              </div>
            </div>
          </div>

          <motion.div
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="p-6 rounded-xl bg-gradient-to-br from-blue-50 to-cyan-50 border border-blue-200"
          >
            <div className="flex items-center gap-3 mb-2">
              <Lock className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-blue-900">Encryption Status</span>
            </div>
            <p className="text-sm text-blue-700">
              Your review score will be encrypted client-side using Fully Homomorphic Encryption (FHE) before submission. 
              No plaintext data will ever touch the blockchain, ensuring complete privacy of your evaluation.
            </p>
          </motion.div>

          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl ${
                success
                  ? "bg-green-50 border border-green-200 text-green-800"
                  : message.includes("Failed")
                  ? "bg-red-50 border border-red-200 text-red-800"
                  : "bg-blue-50 border border-blue-200 text-blue-800"
              }`}
            >
              <div className="flex items-center gap-2">
                {success && <CheckCircle2 className="w-5 h-5" />}
                <p className="text-sm font-medium">{message}</p>
              </div>
            </motion.div>
          )}

          <motion.button
            onClick={submitScore}
            disabled={!isConnected || !fhevmInstance || isSubmitting || fhevmStatus !== "ready"}
            whileHover={{ scale: isSubmitting ? 1 : 1.02 }}
            whileTap={{ scale: isSubmitting ? 1 : 0.98 }}
            className="w-full py-4 px-6 rounded-xl bg-gradient-to-r from-[#0f1d40] to-[#1b58d9] text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Encrypting & Submitting...</span>
              </>
            ) : (
              <>
                <FileCheck className="w-5 h-5" />
                <span>Submit Encrypted Review</span>
              </>
            )}
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
};

