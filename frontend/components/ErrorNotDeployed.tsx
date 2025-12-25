export function errorNotDeployed(chainId: number | undefined) {
  return (
    <div className="grid w-full gap-4 mx-auto font-semibold bg-none">
      <div className="col-span-full mx-20">
        <p className="text-4xl leading-relaxed">
          <span className="font-mono bg-red-500 px-2 text-white">Error</span>: {" "}
          <span className="font-mono bg-white px-2">EncryptedPeerReview.sol</span>
          contract not deployed on <span className="font-mono bg-white px-2">chainId={chainId}</span>{" "}
          {chainId === 11155111 ? "(Sepolia)" : ""}.
        </p>
        <p className="text-xl leading-relaxed mt-8">
          Deploy the contract or regenerate the ABI registry in{" "}
          <span className="font-mono bg-white px-2">frontend/abi</span>. Use the
          following command to deploy on Sepolia:
        </p>
        <p className="font-mono text-2xl leading-relaxed bg-black text-white p-4 mt-12">
          <span className="opacity-50 italic text-red-500"># from &lt;project-root&gt;/web1</span>
          <br />
          npx hardhat deploy --network{" "}
          {chainId === 11155111 ? "sepolia" : "your-network-name"}
        </p>
        <p className="text-xl leading-relaxed mt-12">
          For local testing, start a Hardhat node and rerun <span className="font-mono bg-white px-2">npm run genabi</span> inside the
          frontend package once a deployment is available.
        </p>
      </div>
    </div>
  );
}
