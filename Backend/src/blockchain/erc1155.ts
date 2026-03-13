import { Contract, JsonRpcProvider, getAddress } from "ethers";
import { env } from "../config/env";

const ERC1155_ABI = [
  "function balanceOf(address account, uint256 id) view returns (uint256)"
];

let _provider: JsonRpcProvider | null = null;
let _contract: Contract | null = null;

function getProvider(): JsonRpcProvider {
  if (!env.CHAIN_RPC_URL) {
    throw new Error("CHAIN_RPC_URL_NOT_CONFIGURED");
  }
  if (!_provider) _provider = new JsonRpcProvider(env.CHAIN_RPC_URL);
  return _provider;
}

function getContract(): Contract {
  if (!_contract) {
    if (!env.ERC1155_CONTRACT_ADDRESS) {
      throw new Error("ERC1155_CONTRACT_ADDRESS_NOT_CONFIGURED");
    }
    const address = getAddress(env.ERC1155_CONTRACT_ADDRESS);
    _contract = new Contract(address, ERC1155_ABI, getProvider());
  }
  return _contract;
}

export async function hasErc1155Balance(params: {
  wallet: string;
  tokenId: string;
  minAmount?: number;
}): Promise<boolean> {
  const { wallet, tokenId, minAmount = 1 } = params;
  const contract = getContract();
  const bal = await contract.balanceOf(getAddress(wallet), BigInt(tokenId));
  return bal >= BigInt(minAmount);
}

