import {ContractClientConfig} from "./index";
import {ethers} from "ethers";

export class AirnodeContractClient {

  private readonly contract: ethers.Contract;

  constructor(config: ContractClientConfig) {
    const wallet = new ethers.Wallet(config.signer, config.provider);
    this.contract = new ethers.Contract(config.address, '', wallet);
  }

  public async requestFinalizedHash() {

  }



}
