import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedPeerReview = await deploy("EncryptedPeerReview", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedPeerReview contract: `, deployedPeerReview.address);
};
export default func;
func.id = "deploy_encrypted_peer_review"; // id required to prevent reexecution
func.tags = ["EncryptedPeerReview"];
