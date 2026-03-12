import hre from "hardhat";

async function main() {
  console.log("======================================");
  console.log("Deploying Ticket1155 contract...");
  console.log("======================================\n");

  const connection = await hre.network.connect();
  const ethers = connection.ethers;
  const [deployer] = await ethers.getSigners();
  
  
  console.log("Deploying contracts with account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Account balance:", ethers.formatEther(balance), "ETH");
  console.log("Network:", hre.network.name);
  console.log("");

  // Deploy contract
  console.log("Deploying Ticket1155...");
  const Ticket1155 = await ethers.getContractFactory("Ticket1155");
  const ticket1155 = await Ticket1155.deploy();
  await ticket1155.waitForDeployment();

  const address = await ticket1155.getAddress();
  console.log("✓ Ticket1155 deployed to:", address);
  console.log("✓ Contract owner:", await ticket1155.owner());
  
  // Get base URI
  const uri0 = await ticket1155.uri(0);
  console.log("✓ Base URI:", uri0.replace("0", "{tokenId}"));
  console.log("");

  // Optional: Set up ticket types
  console.log("======================================");
  console.log("Setting up ticket types...");
  console.log("======================================\n");

  const ticketTypes = [
    {
      tokenId: 1n,
      name: "Vé thường",
      maxSupply: 1000n,
      isActive: true
    },
    {
      tokenId: 2n,
      name: "Vé VIP",
      maxSupply: 500n,
      isActive: true
    },
    {
      tokenId: 3n,
      name: "Vé VVIP",
      maxSupply: 100n,
      isActive: true
    }
  ];

  for (const ticket of ticketTypes) {
    console.log(`Setting ticket type ${ticket.tokenId}: ${ticket.name}`);
    console.log(`  Max Supply: ${ticket.maxSupply}`);
    console.log(`  Active: ${ticket.isActive}`);
    
    await ticket1155.setTicketType(
      ticket.tokenId,
      ticket.name,
      ticket.maxSupply,
      ticket.isActive
    );
    
    const ticketInfo = await ticket1155.getTicketType(ticket.tokenId);
    console.log(`  ✓ Current Supply: ${ticketInfo[2].toString()}`);
    console.log(`  ✓ Current Burn: ${ticketInfo[4].toString()}`);
    console.log("");
  }

  // Optional: Create initial tickets (uncomment if needed)
  /*
  console.log("======================================");
  console.log("Creating initial tickets...");
  console.log("======================================\n");

  const initialTickets = [
    { tokenId: 1n, amount: 100n },
    { tokenId: 2n, amount: 50n },
    { tokenId: 3n, amount: 10n }
  ];

  for (const ticket of initialTickets) {
    console.log(`Creating ${ticket.amount} tickets for token ID ${ticket.tokenId}...`);
    await ticket1155.createTicket(ticket.tokenId, ticket.amount);
    const balance = await ticket1155.balanceOf(deployer.address, ticket.tokenId);
    const ticketInfo = await ticket1155.getTicketType(ticket.tokenId);
    console.log(`  ✓ Balance: ${balance.toString()}`);
    console.log(`  ✓ Current Supply: ${ticketInfo[2].toString()}`);
    console.log("");
  }
  */

  // Summary
  console.log("======================================");
  console.log("Deployment Summary");
  console.log("======================================");
  console.log("Contract Address:", address);
  console.log("Owner:", await ticket1155.owner());
  console.log("Base URI:", uri0.replace("0", "{tokenId}"));
  console.log("");

  // Verify ticket types
  console.log("Ticket Types:");
  for (const ticket of ticketTypes) {
    const ticketInfo = await ticket1155.getTicketType(ticket.tokenId);
    console.log(`  Token ID ${ticket.tokenId}:`);
    console.log(`    Name: ${ticketInfo[0]}`);
    console.log(`    Max Supply: ${ticketInfo[1].toString()}`);
    console.log(`    Current Supply: ${ticketInfo[2].toString()}`);
    console.log(`    Active: ${ticketInfo[3]}`);
    console.log(`    Current Burn: ${ticketInfo[4].toString()}`);
  }
  console.log("");

  console.log("======================================");
  console.log("Deployment completed successfully!");
  console.log("======================================");
  console.log("\nNext steps:");
  console.log("1. Verify contract on Etherscan (if on testnet/mainnet):");
  console.log(`   npx hardhat verify --network <network> ${address}`);
  console.log("2. Update frontend with contract address:", address);
  console.log("3. Test the contract functions");
  console.log("4. Set up metadata files on IPFS matching the base URI");
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
