"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";
import { motion } from "framer-motion";
import { Lock, Unlock, Eye, Award } from "lucide-react";
import { useFhevm } from "@/fhevm/useFhevm";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { EncryptedPeerReviewABI } from "@/abi/EncryptedPeerReviewABI";
import { EncryptedPeerReviewAddresses } from "@/abi/EncryptedPeerReviewAddresses";
import { DecryptionEffect } from "@/components/DecryptionEffect";
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

export const DecryptPage = () => {
  const { isConnected, chainId } = useAccount();
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

  const [myScore, setMyScore] = useState<bigint | null>(null);
  const [teamAverage, setTeamAverage] = useState<bigint | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isAverageLoading, setIsAverageLoading] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [decryptingType, setDecryptingType] = useState<"score" | "average" | null>(null);

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

  const decryptMyScore = useCallback(async () => {
    if (!contractForAccount || !fhevmInstance || !contractInfo.address || !signer) {
      setMessage("Connect your wallet to read your review submission.");
      return;
    }

    setIsDecrypting(true);
    setDecryptingType("score");
      setMessage("Authorizing access to your encrypted review score...");

    try {
      const tx = await contractForAccount.requestMyScoreAccess();
      await tx.wait();

      const encryptedScore = await contractForAccount.getMyScore();
      // Convert euint32 to handle string - the encrypted score is returned as bytes
      const handle = typeof encryptedScore === 'string' 
        ? encryptedScore 
        : ethers.hexlify(encryptedScore);
      const clearScore = await decryptHandle(handle, fhevmInstance as FhevmInstance, fhevmDecryptionSignatureStorage);

      setMyScore(clearScore);
      setMessage("Your review score has been decrypted locally.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Decryption error:", error);
      setMessage(`Unable to decrypt your review score: ${errorMessage}`);
    } finally {
      setIsDecrypting(false);
      setDecryptingType(null);
    }
  }, [
    contractForAccount,
    fhevmInstance,
    contractInfo.address,
    decryptHandle,
    fhevmDecryptionSignatureStorage,
    signer,
  ]);

  const fetchAverage = useCallback(async () => {
    if (!contractForAccount || !fhevmInstance || !contractInfo.address || !signer) {
      setMessage("Connect your wallet to read the review average.");
      return;
    }

    setIsAverageLoading(true);
    setDecryptingType("average");
      setMessage("Requesting access to encrypted review average...");

    try {
      const tx = await contractForAccount.requestAverageAccess();
      await tx.wait();

      const [encryptedAverage] = await contractForAccount.getEncryptedAverage();
      // Convert euint32 to handle string
      const handle = typeof encryptedAverage === 'string'
        ? encryptedAverage
        : ethers.hexlify(encryptedAverage);
      const clearAverage = await decryptHandle(handle, fhevmInstance as FhevmInstance, fhevmDecryptionSignatureStorage);

      setTeamAverage(clearAverage);
      setMessage("Review average has been decrypted locally.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Average decryption error:", error);
      setMessage(`Unable to decrypt average: ${errorMessage}`);
    } finally {
      setIsAverageLoading(false);
      setDecryptingType(null);
    }
  }, [
    contractForAccount,
    fhevmInstance,
    contractInfo.address,
    decryptHandle,
    fhevmDecryptionSignatureStorage,
    signer,
  ]);

  const [showDecryptionEffect, setShowDecryptionEffect] = useState(false);
  const [effectValue, setEffectValue] = useState<number | null>(null);

  // Update effect when decryption completes
  useEffect(() => {
    if (decryptingType === "score" && myScore !== null && !isDecrypting) {
      setEffectValue(Number(myScore));
      setShowDecryptionEffect(true);
    } else if (decryptingType === "average" && teamAverage !== null && !isAverageLoading) {
      setEffectValue(Number(teamAverage));
      setShowDecryptionEffect(true);
    }
  }, [myScore, teamAverage, decryptingType, isDecrypting, isAverageLoading]);

  return (
    <div className="space-y-6">
      <DecryptionEffect
        isDecrypting={isDecrypting || isAverageLoading}
        decryptedValue={showDecryptionEffect ? effectValue : null}
        onComplete={() => {
          setShowDecryptionEffect(false);
          setEffectValue(null);
        }}
      />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-8"
      >
        <h1 className="text-4xl font-bold text-[#0f1d40] mb-2">View Review Results</h1>
        <p className="text-slate-600">Decrypt and view your review scores and academic metrics</p>
      </motion.div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* My Score Card */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 backdrop-blur-sm"></div>
              <Eye className="w-6 h-6 text-white relative z-10 drop-shadow-md" fill="currentColor" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0f1d40]">My Review Score</h2>
              <p className="text-sm text-slate-600">Your encrypted review submission</p>
            </div>
          </div>

          {myScore !== null ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-8"
            >
              <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-cyan-500 mb-2">
                {Number(myScore)}
              </div>
              <p className="text-slate-600">Your decrypted review score</p>
            </motion.div>
          ) : (
            <div className="text-center py-8">
              <Lock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">Review score is encrypted</p>
            </div>
          )}

          <motion.button
            onClick={decryptMyScore}
            disabled={!isConnected || !fhevmInstance || isDecrypting || fhevmStatus !== "ready"}
            whileHover={{ scale: isDecrypting ? 1 : 1.02 }}
            whileTap={{ scale: isDecrypting ? 1 : 0.98 }}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-blue-500 to-cyan-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isDecrypting ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Decrypting...</span>
              </>
            ) : (
              <>
                <Unlock className="w-5 h-5" />
                <span>Decrypt My Review</span>
              </>
            )}
          </motion.button>
        </motion.div>

        {/* Team Average Card */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-2xl bg-white/90 backdrop-blur-lg shadow-lg border border-white/20 p-8"
        >
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 shadow-lg relative overflow-hidden">
              <div className="absolute inset-0 bg-white/20 backdrop-blur-sm"></div>
              <Award className="w-6 h-6 text-white relative z-10 drop-shadow-md" fill="currentColor" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#0f1d40]">Review Average</h2>
              <p className="text-sm text-slate-600">Encrypted average of all reviews</p>
            </div>
          </div>

          {teamAverage !== null ? (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-center py-8"
            >
              <div className="text-6xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-500 to-pink-500 mb-2">
                {Number(teamAverage).toFixed(1)}
              </div>
              <p className="text-slate-600">Average review score</p>
            </motion.div>
          ) : (
            <div className="text-center py-8">
              <Lock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <p className="text-slate-500 mb-4">Review average is encrypted</p>
            </div>
          )}

          <motion.button
            onClick={fetchAverage}
            disabled={!isConnected || !fhevmInstance || isAverageLoading || fhevmStatus !== "ready"}
            whileHover={{ scale: isAverageLoading ? 1 : 1.02 }}
            whileTap={{ scale: isAverageLoading ? 1 : 0.98 }}
            className="w-full py-3 px-6 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isAverageLoading ? (
              <>
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                  className="w-5 h-5 border-2 border-white border-t-transparent rounded-full"
                />
                <span>Decrypting...</span>
              </>
            ) : (
              <>
                <Unlock className="w-5 h-5" />
                <span>Decrypt Review Average</span>
              </>
            )}
          </motion.button>
        </motion.div>
      </div>

      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-blue-800"
        >
          <p className="text-sm font-medium">{message}</p>
        </motion.div>
      )}
    </div>
  );
};

