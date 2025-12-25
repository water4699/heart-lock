import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { expect } from "chai";
import { deployments, ethers, fhevm } from "hardhat";

import { EncryptedPeerReview } from "../types";

type Signers = {
  reviewer: HardhatEthersSigner;
};

describe("EncryptedPeerReviewSepolia", function () {
  let signers: Signers;
  let contract: EncryptedPeerReview;
  let contractAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn("This hardhat test suite is designed to run against Sepolia");
      this.skip();
    }

    try {
      const deployment = await deployments.get("EncryptedPeerReview");
      contractAddress = deployment.address;
      contract = (await ethers.getContractAt("EncryptedPeerReview", deployment.address)) as EncryptedPeerReview;
    } catch (error) {
      (error as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw error;
    }

    const hardhatSigners = (await ethers.getSigners()) as HardhatEthersSigner[];
    signers = { reviewer: hardhatSigners[0] };
  });

  beforeEach(async function () {
    step = 0;
    steps = 0;
  });

  it("submits a score and decrypts aggregates", async function () {
    this.timeout(4 * 40000);

    steps = 8;

    await fhevm.initializeCLIApi();

    progress("Requesting current total allowance...");
    await (await contract.connect(signers.reviewer).requestTotalAccess()).wait();
    const initialTotalData = await contract.connect(signers.reviewer).getEncryptedTotal();
    const initialCount = Number(initialTotalData[1]);
    let initialTotal = 0;
    if (initialCount > 0) {
      initialTotal = Number(
        await fhevm.userDecryptEuint(FhevmType.euint32, initialTotalData[0], contractAddress, signers.reviewer),
      );
    }

    const score = Math.floor(Math.random() * 100);

    progress(`Encrypting score '${score}'...`);
    const encryptedScore = await fhevm
      .createEncryptedInput(contractAddress, signers.reviewer.address)
      .add32(score)
      .encrypt();

    progress("Submitting encrypted score...");
    const tx = await contract
      .connect(signers.reviewer)
      .submitScore(encryptedScore.handles[0], encryptedScore.inputProof);
    await tx.wait();

    progress("Requesting updated total allowance...");
    await (await contract.connect(signers.reviewer).requestTotalAccess()).wait();
    const updatedTotalData = await contract.connect(signers.reviewer).getEncryptedTotal();
    const updatedCount = Number(updatedTotalData[1]);
    const updatedTotal = Number(
      await fhevm.userDecryptEuint(FhevmType.euint32, updatedTotalData[0], contractAddress, signers.reviewer),
    );

    expect(updatedCount).to.be.gte(initialCount === 0 ? 1 : initialCount);
    expect(updatedTotal).to.be.within(0, 100 * updatedCount);
    if (initialCount > 0) {
      expect(updatedTotal).to.not.equal(initialTotal);
    }

    progress("Requesting average access...");
    await (await contract.connect(signers.reviewer).requestAverageAccess()).wait();
    const averageData = await contract.connect(signers.reviewer).getEncryptedAverage();
    const clearAverage = Number(
      await fhevm.userDecryptEuint(FhevmType.euint32, averageData[0], contractAddress, signers.reviewer),
    );

    expect(Number(averageData[1])).to.equal(updatedCount);
    expect(clearAverage).to.be.within(0, 100);
  });
});

// Commit marker: add_integration - 2025-11-04T11:15:00-08:00

