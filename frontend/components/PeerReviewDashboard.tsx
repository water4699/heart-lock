"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ethers } from "ethers";
import { useAccount, useWalletClient } from "wagmi";

import { useFhevm } from "@/fhevm/useFhevm";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { GenericStringStorage } from "@/fhevm/GenericStringStorage";
import type { FhevmInstance } from "@/fhevm/fhevmTypes";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { EncryptedPeerReviewABI } from "@/abi/EncryptedPeerReviewABI";
import { EncryptedPeerReviewAddresses } from "@/abi/EncryptedPeerReviewAddresses";
import { errorNotDeployed } from "./ErrorNotDeployed";

type ContractInfo = {
  abi: typeof EncryptedPeerReviewABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

const HARDHAT_RPC_URL = process.env.NEXT_PUBLIC_HARDHAT_RPC_URL ?? "http://localhost:8545";
const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID ?? "11155111");

function getContractByChainId(chainId: number | undefined): ContractInfo {
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

async function buildSigner(
  walletClient: unknown,
  fallbackChainId?: number,
  connectionAttempts: number = 0,
): Promise<{ provider: ethers.BrowserProvider; signer: ethers.JsonRpcSigner } | undefined> {
  if (!walletClient) {
    return undefined;
  }

  const client = walletClient as {
    chain?: { id: number | string };
    transport: ethers.Eip1193Provider | string;
    account: { address: string };
  };

  // Enhanced error handling with retry logic and exponential backoff
  const maxRetries = 3;
  const baseRetryDelay = 1000; // 1 second base delay

  try {
    const chainId = Number(client.chain?.id ?? fallbackChainId ?? DEFAULT_CHAIN_ID);
    const provider = new ethers.BrowserProvider(
      client.transport as ethers.Eip1193Provider,
      chainId,
    );

    // Test connection before proceeding
    const network = await provider.getNetwork();
    const signer = await provider.getSigner(client.account.address);

    // Validate that we have both network and signer
    if (!network || !signer) {
      throw new Error('Failed to establish complete wallet connection');
    }

    // Additional validation: ensure signer address matches client account
    const signerAddress = await signer.getAddress();
    if (signerAddress.toLowerCase() !== client.account.address.toLowerCase()) {
      throw new Error('Signer address mismatch with wallet account');
    }

    console.log(`Successfully connected to network: ${network.name}`);
    return { provider, signer };

  } catch (error) {
    console.warn(`Wallet connection attempt ${connectionAttempts + 1} failed:`, error);

    // Implement exponential backoff for retries
    if (connectionAttempts < maxRetries) {
      const retryDelay = baseRetryDelay * Math.pow(2, connectionAttempts);
      console.log(`Retrying connection in ${retryDelay}ms...`);

      await new Promise(resolve => setTimeout(resolve, retryDelay));

      // Recursively retry with incremented attempt counter
      return buildSigner(walletClient, fallbackChainId, connectionAttempts + 1);
    }

    // Max retries exceeded, return undefined to indicate failure
    console.error('Max connection attempts exceeded, giving up');
    return undefined;
  }
}

/**
 * CipherScore Encrypted Peer Review Dashboard
 * Main React component handling FHE-encrypted performance evaluations
 *
 * Features:
 * - Client-side score encryption using fhEVM
 * - Real-time team average calculations
 * - Wallet connection management with automatic retry
 * - Secure decryption of personal and team metrics
 */
const PeerReviewDashboardComponent = () => {
  const { storage: fhevmDecryptionSignatureStorage } = useInMemoryStorage();
  const { address, isConnected, chainId } = useAccount();
  const { data: walletClient } = useWalletClient();

  // State variables must be declared before useEffect that uses them
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  const [retryTimeout, setRetryTimeout] = useState<NodeJS.Timeout | null>(null);

  const [{ signer, provider }, setWalletBindings] = useState<{
    signer?: ethers.JsonRpcSigner;
    provider?: ethers.BrowserProvider;
  }>({});

  useEffect(() => {
    let cancelled = false;

    // Enhanced wallet binding with retry logic and error recovery
    const attemptWalletConnection = async () => {
      try {
        const result = await buildSigner(walletClient, chainId);

        // Properly handle wallet connection state updates
        if (!cancelled) {
          if (result?.signer && result?.provider) {
            // Success: Set wallet bindings and reset error state
            console.log('Wallet connection successful, updating bindings');
            setWalletBindings({ signer: result.signer, provider: result.provider });
            setConnectionAttempts(0); // Reset on success
          } else {
            // Failure: Clear bindings and track error state
            console.log('Wallet connection failed, clearing bindings');
            setWalletBindings({ signer: undefined, provider: undefined });
            setConnectionAttempts(prev => prev + 1);
          }
        }

        // Enhanced error recovery with timeout
        if (result && retryTimeout) {
          clearTimeout(retryTimeout);
          setRetryTimeout(null);
        }

      } catch (error) {
        console.error('Wallet binding failed:', error);

        // Proper error handling
        if (!cancelled) {
          // On error, clear bindings and track failure state
          setWalletBindings({ signer: undefined, provider: undefined });
          setConnectionAttempts(prev => prev + 1);
        }
      }
    };

    attemptWalletConnection();

    return () => {
      cancelled = true;
      if (retryTimeout) {
        clearTimeout(retryTimeout);
      }
    };
  }, [walletClient, chainId, connectionAttempts, retryTimeout]);

  const fhevmProvider = walletClient?.transport ?? (isConnected ? undefined : HARDHAT_RPC_URL);
  const {
    instance: fhevmInstance,
    status: fhevmStatus,
    error: fhevmError,
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

  const contractRunner: ethers.ContractRunner | undefined = useMemo(() => {
    if (signer) {
      return signer;
    }
    if (provider) {
      return provider;
    }
    return undefined;
  }, [provider, signer]);

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

  const [participantCount, setParticipantCount] = useState<number>(0);
  const [managerAddress, setManagerAddress] = useState<string | undefined>(undefined);
  const [hasSubmitted, setHasSubmitted] = useState<boolean>(false);
  const [scoreInput, setScoreInput] = useState<number>(70);
  const [myScore, setMyScore] = useState<bigint | null>(null);
  const [teamAverage, setTeamAverage] = useState<bigint | null>(null);
  const [message, setMessage] = useState<string>("");
  const [refreshToken, setRefreshToken] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [isAverageLoading, setIsAverageLoading] = useState(false);

  const isManager = useMemo(() => {
    if (!managerAddress || !address) {
      return false;
    }
    return managerAddress.toLowerCase() === address.toLowerCase();
  }, [managerAddress, address]);

  const refreshSnapshot = useCallback(() => {
    setRefreshToken((value) => value + 1);
  }, []);

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
        if (!cancelled) {
          setMessage(
            `Unable to read contract state: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    };

    fetchSnapshot();

    return () => {
      cancelled = true;
    };
  }, [contractForRead, address, refreshToken]);

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

    try {
      const input = fhevmInstance.createEncryptedInput(contractInfo.address, address as `0x${string}`);
      input.add32(scoreInput);

      const encrypted = await input.encrypt();

      setMessage("Submitting encrypted score...");
      const tx = await contractForAccount.submitScore(encrypted.handles[0], encrypted.inputProof);
      await tx.wait();

      setMessage("Score submitted. You can now decrypt your response or team metrics.");
      refreshSnapshot();
      setMyScore(null);
      setTeamAverage(null);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Score submission failed:", error);
      setMessage(`Failed to submit score: ${errorMessage}. Please check your wallet connection and try again.`);
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
    refreshSnapshot,
  ]);

  const decryptMyScore = useCallback(async () => {
    if (!contractForAccount || !fhevmInstance || !contractInfo.address || !signer) {
      setMessage("Connect your wallet to read your submission.");
      return;
    }

    setIsDecrypting(true);
    setMessage("Authorising access to your encrypted score...");

    try {
      const tx = await contractForAccount.requestMyScoreAccess();
      await tx.wait();

      const encryptedScore = await contractForAccount.getMyScore();
      const clearScore = await decryptHandle(encryptedScore, fhevmInstance, fhevmDecryptionSignatureStorage);

      setMyScore(clearScore);
      setMessage("Your score has been decrypted locally.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("Decryption error:", error);
      setMessage(`Unable to decrypt your score: ${errorMessage}. Please try again or check your wallet connection.`);
    } finally {
      setIsDecrypting(false);
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
      setMessage("Connect your wallet to request the team average.");
      return;
    }

    setIsAverageLoading(true);
    setMessage("Requesting access to the encrypted team average...");

    try {
      const tx = await contractForAccount.requestAverageAccess();
      await tx.wait();

      const averageData = await contractForAccount.getEncryptedAverage();
      const clearAverage = await decryptHandle(averageData[0], fhevmInstance, fhevmDecryptionSignatureStorage);

      setTeamAverage(clearAverage);
      setParticipantCount(Number(averageData[1]));
      setMessage("Team average decrypted successfully.");
    } catch (error) {
      setMessage(`Unable to retrieve the team average: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsAverageLoading(false);
    }
  }, [
    contractForAccount,
    contractInfo.address,
    decryptHandle,
    fhevmDecryptionSignatureStorage,
    fhevmInstance,
    signer,
  ]);

  const isContractDeployed = Boolean(contractInfo.address && contractInfo.address !== ethers.ZeroAddress);

  if (!isContractDeployed) {
    return errorNotDeployed(effectiveChainId);
  }

  return (
    <section className="flex w-full flex-col gap-8">
      <header className="rounded-3xl bg-gradient-to-r from-[#0f1d40] via-[#182a58] to-[#1f3871] p-8 shadow-lg text-white">
        <p className="uppercase tracking-[0.35em] text-xs text-[#7ba2ff]">Encrypted Peer Review</p>
        <h1 className="mt-4 text-4xl font-semibold sm:text-5xl">CipherScore Performance Loop</h1>
        <p className="mt-4 max-w-3xl text-base text-blue-100 sm:text-lg">
          Collect peer feedback without exposing individual evaluations. Submit an encrypted score,
          keep your identity private, and allow management to audit the full picture on-chain.
        </p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm">
          <div className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3">
            <span className="text-xs uppercase tracking-widest text-blue-200">Participants</span>
            <p className="text-2xl font-semibold text-white">{participantCount}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3">
            <span className="text-xs uppercase tracking-widest text-blue-200">Manager</span>
            <p className="truncate text-white/90">{managerAddress ?? "–"}</p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3">
            <span className="text-xs uppercase tracking-widest text-blue-200">Connection</span>
            <p className="text-white/90">
              {isConnected ? (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-green-400 rounded-full"></span>
                  Wallet connected
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse"></span>
                  Awaiting wallet
                </span>
              )}
            </p>
          </div>
          <div className="rounded-2xl border border-white/20 bg-white/5 px-4 py-3">
            <span className="text-xs uppercase tracking-widest text-blue-200">Team Average</span>
            <p className="text-white/90">
              {participantCount > 0 ? (
                <span className="flex items-center gap-2">
                  <span className="text-2xl font-semibold">
                    {teamAverage !== null ? Number(teamAverage).toFixed(1) : '–'}
                  </span>
                  <span className="text-sm">/100</span>
                </span>
              ) : (
                <span className="text-sm opacity-60">No scores yet</span>
              )}
            </p>
          </div>
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12 xl:gap-8">
        <article className="lg:col-span-7 rounded-3xl bg-white/80 p-6 shadow-lg backdrop-blur">
          <h2 className="text-2xl font-semibold text-slate-900">Submit a confidential score</h2>
          <p className="mt-2 text-sm text-slate-600">
            Choose a score between 0 and 100. Your rating is encrypted locally and never leaves your device in clear text.
            Scores are validated before submission to ensure data integrity.
          </p>
          <div className="mt-6 flex items-center gap-4">
            <input
              type="range"
              min={0}
              max={100}
              value={scoreInput}
              onChange={(event) => setScoreInput(Number(event.target.value))}
              aria-label={`Score input: ${scoreInput} out of 100`}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200"
            />
            <span className="w-12 text-center text-xl font-semibold text-[#0f1d40]">{scoreInput}</span>
          </div>
          {/* Button disabled when NOT connected or submitting */}
          <button
            type="button"
            onClick={submitScore}
            disabled={!isConnected || !fhevmInstance || isSubmitting}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-[#0f1d40] px-6 py-3 text-sm font-semibold text-white transition-all duration-200 hover:bg-[#142862] hover:shadow-lg hover:scale-105 disabled:cursor-not-allowed disabled:bg-slate-400 disabled:hover:scale-100"
          >
            {isSubmitting ? "Encrypting & signing..." : "Submit encrypted score"}
          </button>
          <p className="mt-4 text-xs text-slate-500">
            Encryption runs entirely in the browser through the FHEVM SDK. No clear text metrics ever touch the blockchain.
          </p>
        </article>

        <aside className="lg:col-span-5 grid gap-6 xl:col-span-4 xl:col-start-9">
          <div className="rounded-3xl bg-white/80 p-6 shadow-lg backdrop-blur">
            <h3 className="text-lg font-semibold text-slate-900">My submission</h3>
            <p className="mt-1 text-sm text-slate-600">
              Re-issue access to your encrypted score and decrypt it locally.
            </p>
            <button
              type="button"
              onClick={decryptMyScore}
              disabled={!hasSubmitted || !isConnected || !fhevmInstance || isDecrypting}
              className="mt-4 inline-flex items-center justify-center rounded-xl border border-[#0f1d40] px-4 py-2 text-sm font-semibold text-[#0f1d40] transition hover:bg-[#0f1d40] hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            >
              {isDecrypting ? "Decrypting your score..." : "Decrypt my score"}
            </button>
            <p className="mt-4 text-sm font-semibold text-[#0f1d40]">
              {myScore !== null ? `Your current score: ${Number(myScore)}` : hasSubmitted ? "Score hidden until you decrypt" : "Submit a score to unlock this view"}
            </p>
          </div>

          <div className="rounded-3xl bg-white/80 p-6 shadow-lg backdrop-blur">
            <h3 className="text-lg font-semibold text-slate-900">Team average</h3>
            <p className="mt-1 text-sm text-slate-600">
              Request a fresh encrypted average. Only reviewers and the manager can unlock this metric.
            </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={fetchAverage}
              disabled={!isConnected || !fhevmInstance || isAverageLoading || (!hasSubmitted && !isManager)}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#0f1d40] px-4 py-2 text-sm font-semibold text-[#0f1d40] transition hover:bg-[#0f1d40] hover:text-white disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
            >
              {isAverageLoading && <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#0f1d40] border-t-transparent"></div>}
              {isAverageLoading ? "Decrypting team average..." : "View encrypted average"}
            </button>
            <button
              type="button"
              onClick={refreshSnapshot}
              disabled={!isConnected || isAverageLoading}
              className="inline-flex items-center justify-center rounded-xl border border-slate-400 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              title="Refresh team statistics"
            >
              ↻
            </button>
          </div>
            <div className="mt-4 space-y-2">
              <p className="text-sm font-semibold text-[#0f1d40]">
                {teamAverage !== null ? (
                  <span className="flex items-center gap-2">
                    Team average:
                    <span className="text-lg font-bold text-green-600">
                      {Number(teamAverage).toFixed(1)}
                    </span>
                    <span className="text-xs text-slate-500">out of 100</span>
                  </span>
                ) : (
                  <span className="text-slate-500">Average hidden until decrypted</span>
                )}
              </p>
              {participantCount > 0 && teamAverage !== null && (
                <div className="text-xs text-slate-400">
                  <span>Based on {participantCount} submission{participantCount !== 1 ? 's' : ''}</span>
                  <span className="ml-2">• Last updated: {new Date().toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      <footer className="rounded-3xl bg-white/70 p-6 shadow-inner backdrop-blur">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="font-semibold text-[#0f1d40]">Session status</h4>
            <p className="mt-1 text-sm text-slate-600">
              {message || "Interact with the dashboard to receive feedback here."}
            </p>
          </div>
          <div>
            <h4 className="font-semibold text-[#0f1d40]">FHE runtime</h4>
            <p className="mt-1 text-sm text-slate-600">
              Status: <span className="font-semibold text-[#0f1d40]">{fhevmStatus}</span>
            </p>
            {fhevmError ? (
              <p className="text-sm text-red-500">{fhevmError.message}</p>
            ) : (
              <p className="text-sm text-slate-500">Ensure the FHEVM mock node is running for local development.</p>
            )}
          </div>
        </div>
      </footer>
    </section>
  );
};

PeerReviewDashboardComponent.displayName = "PeerReviewDashboard";

export const PeerReviewDashboard = React.memo(PeerReviewDashboardComponent);

// Commit marker: add_ui - 2025-11-03T11:30:00-08:00


// Commit marker: add_decryption - 2025-11-04T09:30:00-08:00


// Commit marker: add_average - 2025-11-04T15:30:00-08:00

