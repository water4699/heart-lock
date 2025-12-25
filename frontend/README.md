# CipherScore Frontend

CipherScore is a Next.js + RainbowKit dashboard for the `EncryptedPeerReview` contract. It demonstrates an end-to-end encrypted peer review loop where contributors submit scores, decrypt their evaluation, and unlock team insights based on role.

## Tech stack

- **Next.js 15 / React 19** – App Router, server components, and Tailwind styling
- **RainbowKit + wagmi + viem** – Wallet connection (Rainbow, WalletConnect, injected wallets)
- **FHEVM SDK** – Browser-side encryption/decryption helpers for the FHEVM
- **Custom design system** – Inspired by zama-9 references with bespoke CipherScore branding

## Getting started

```bash
cd web1/frontend
npm install
```

Generate contract ABIs and address maps (after deploying with Hardhat):

```bash
npm run genabi
```

Optional environment overrides (`.env.local`):

```env
NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_walletconnect_id
NEXT_PUBLIC_HARDHAT_RPC_URL=http://127.0.0.1:8545
NEXT_PUBLIC_SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<key>
```

Start the development server (checks that the Hardhat node is running):

```bash
npm run dev:mock
```

Use `npm run dev` for a plain Next.js dev server without Hardhat health checks.

## Scripts

| Script | Description |
| --- | --- |
| `npm run dev:mock` | Regenerate ABI files and launch the dev server (Hardhat node aware) |
| `npm run dev` | Start the dev server without node checks |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint (via Next.js) |
| `npm run genabi` | Copy ABI + address data from `../deployments` |

## Interface overview

- **SiteHeader**: Rainbow Connect Button + CipherScore logo anchored top-right
- **PeerReviewDashboard**: hero summary, live participant metrics, and action cards
  - Submit encrypted score (0–100 slider)
  - Decrypt “My submission”
  - View “Team average” (participants + manager)
  - View “Management total” (manager only)
- **Status footer**: shows latest action feedback and FHE runtime state

## FHE integration notes

`PeerReviewDashboard` is a reference implementation for:

1. Converting a wagmi wallet client into an `ethers.BrowserProvider`
2. Instantiating the FHE VM via `useFhevm`
3. Encrypting inputs with `createEncryptedInput`
4. Persisting/reusing decryption signatures via `FhevmDecryptionSignature`
5. Requesting contract-level permissions before fetching encrypted aggregates

## Troubleshooting

- **ABI not found** – Run `npm run genabi` after every Hardhat deployment.
- **Wallet fails to connect** – Provide a valid `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`.
- **Cannot decrypt average/total** – Ensure you have submitted a score or are the manager; the contract gatekeeps access.

---

CipherScore turns the original template into a polished encrypted peer review experience with WalletConnect support and production-ready UX.

## Security Features

- **Fully Homomorphic Encryption**: All score submissions are encrypted on-chain
- **Privacy-Preserving**: Individual scores remain private until explicitly decrypted
- **Access Control**: Decryption permissions are granted based on submission status and role
- **Secure Key Management**: FHEVM handles encryption keys and decryption signatures

## Architecture

The frontend integrates with the FHEVM through:
- **Contract Interaction**: Direct calls to the EncryptedPeerReview contract
- **Encryption Layer**: Browser-side encryption using FHEVM SDK
- **Decryption Management**: Secure decryption with signature verification
- **State Management**: React hooks for FHEVM instance and wallet connections

## Contributing

This project follows conventional commits and uses ESLint for code quality. Run `npm run lint:fix` to automatically fix linting issues and `npm run type-check` to verify TypeScript types.