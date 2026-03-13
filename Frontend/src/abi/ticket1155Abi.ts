// Ticket1155 (ERC1155) ABI
//
// ✅ Bạn nói bạn "có file abi": hãy thay thế toàn bộ mảng `ticket1155Abi` bên dưới
// bằng ABI JSON đầy đủ (từ Hardhat/Foundry artifacts hoặc Etherscan/Polygonscan).
//
// Tip: giữ `as const` để wagmi/viem có type-safety tốt hơn.
export const ticket1155Abi = [
  {
    type: 'function',
    name: 'uri',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'ticketPrices',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'getTicketType',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'maxSupply', type: 'uint256' },
      { name: 'currentSupply', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
      { name: 'currentBurn', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'buyTicket',
    stateMutability: 'payable',
    inputs: [{ name: 'id', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setTicketPrice',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'price', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setTicketType',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'name', type: 'string' },
      { name: 'maxSupply', type: 'uint256' },
      { name: 'isActive', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'bool' }],
  },
  {
    type: 'function',
    name: 'pause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unpause',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'burnTicket',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

