import {ethers, EventLog, Log} from "ethers";
import {setTimeout} from "timers/promises";

const abiOrmp = require("./abis/Ormp.json");

async function main() {
  const lifecycle = await _init();
  console.log(1);
}


async function _init() {
  const evm = new ethers.JsonRpcProvider('https://ethereum-sepolia.publicnode.com');
  const signer = process.env['SIGNER'];
  const wallet = new ethers.Wallet(signer ?? '', evm);
  const contract = new ethers.Contract('0x00000000001523057a05d6293C1e5171eE33eE0A', abiOrmp, wallet);

  const filters = contract.filters.MessageAccepted;
  const maxBlock = 5555621;
  let fromBlock = 4728915;
  let gap = 1000;
  let i = 0;
  while (true) {
    const start = fromBlock + (i * gap);
    const end = start + gap;
    if (end > maxBlock) break;
    const events: Array<EventLog | Log> = await contract.queryFilter(
      filters,
      start,
      end
    );
    // @ts-ignore
    // const args = events.map(item => item.args);
    console.log(start, end, events);
    await setTimeout(1000);
    i += 1;
  }

}

main().catch(e => console.log(e));

