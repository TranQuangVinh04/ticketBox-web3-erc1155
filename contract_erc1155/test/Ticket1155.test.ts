import { expect } from "chai";
import hre from "hardhat";
import { ZeroAddress } from "ethers";
import { Ticket1155 } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Ticket1155", function () {
  let ticket1155: Ticket1155;
  let owner: HardhatEthersSigner;
  let user1: HardhatEthersSigner;
  let user2: HardhatEthersSigner;
  const tokenId1 = 1n;
  const tokenId2 = 2n;
  const tokenId3 = 3n;
  const amount = 100n;
  const baseURI = "https://plum-electrical-lizard-937.mypinata.cloud/ipfs/bafybeigkjqdohymphpw5zj4nyl4qp77jbb7se2hr7o4lyiqubr3ohg564m/";

  beforeEach(async function () {
    const connection = await hre.network.connect();
    const ethers = connection.ethers;

    [owner, user1, user2] = await ethers.getSigners();

    const Ticket1155Factory = await ethers.getContractFactory("Ticket1155");
    ticket1155 = await Ticket1155Factory.deploy();
    await ticket1155.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const contractOwner = await ticket1155.owner();
      console.log("\n=== DEBUG: owner() ===");
      console.log("Kết quả:", contractOwner);
      expect(contractOwner).to.equal(owner.address);
    });

    it("Should set the correct URI", async function () {
      const uri0 = await ticket1155.uri(0);
      console.log("\n=== DEBUG: uri(0) ===");
      console.log("Kết quả:", uri0);
      expect(uri0).to.equal(baseURI + "0");
    });

    it("Should return different URIs for different token IDs", async function () {
      const uri1 = await ticket1155.uri(1);
      const uri2 = await ticket1155.uri(2);
      const uri3 = await ticket1155.uri(3);
      
      console.log("\n=== DEBUG: uri() với nhiều token ID ===");
      console.log("uri(1):", uri1);
      console.log("uri(2):", uri2);
      console.log("uri(3):", uri3);
      
      expect(uri1).to.equal(baseURI + "1");
      expect(uri2).to.equal(baseURI + "2");
      expect(uri3).to.equal(baseURI + "3");
    });

    it("Should not be paused initially", async function () {
      const paused = await ticket1155.paused();
      console.log("\n=== DEBUG: paused() ===");
      console.log("Kết quả:", paused);
      expect(paused).to.be.false;
    });
  });

  describe("URI Management", function () {
    it("Should allow owner to set custom URI for a token", async function () {
      const customURI = "https://example.com/custom-token.json";
      
      const uriBefore = await ticket1155.uri(1);
      console.log("\n=== DEBUG: uri(1) trước khi set ===");
      console.log("Kết quả:", uriBefore);
      
      await ticket1155.setTokenURI(1, customURI);
      
      const uriAfter = await ticket1155.uri(1);
      console.log("\n=== DEBUG: uri(1) sau khi setTokenURI() ===");
      console.log("Kết quả:", uriAfter);
      
      expect(uriAfter).to.equal(customURI);
    });

    it("Should allow owner to set base URI", async function () {
      const newBaseURI = "https://example.com/new-base/";
      
      const uriBefore = await ticket1155.uri(1);
      console.log("\n=== DEBUG: uri(1) trước khi setBaseURI() ===");
      console.log("Kết quả:", uriBefore);
      
      await ticket1155.setBaseURI(newBaseURI);
      
      const uriAfter = await ticket1155.uri(1);
      console.log("\n=== DEBUG: uri(1) sau khi setBaseURI() ===");
      console.log("Kết quả:", uriAfter);
      
      expect(uriAfter).to.equal(newBaseURI + "1");
    });

    it("Should allow owner to clear custom URI", async function () {
      const customURI = "https://example.com/custom-token.json";
      
      await ticket1155.setTokenURI(1, customURI);
      const uriAfterSet = await ticket1155.uri(1);
      console.log("\n=== DEBUG: uri(1) sau khi setTokenURI() ===");
      console.log("Kết quả:", uriAfterSet);

      await ticket1155.clearTokenURI(1);
      const uriAfterClear = await ticket1155.uri(1);
      console.log("\n=== DEBUG: uri(1) sau khi clearTokenURI() ===");
      console.log("Kết quả:", uriAfterClear);
      expect(uriAfterClear).to.equal(baseURI + "1");
    });

    it("Should not allow non-owner to set base URI", async function () {
      await expect(
        ticket1155.connect(user1).setBaseURI("https://example.com/")
      ).to.be.revertedWithCustomError(ticket1155, "OwnableUnauthorizedAccount");
    });

    it("Should not allow non-owner to set token URI", async function () {
      await expect(
        ticket1155.connect(user1).setTokenURI(1, "https://example.com/")
      ).to.be.revertedWithCustomError(ticket1155, "OwnableUnauthorizedAccount");
    });

    it("Should not allow non-owner to clear token URI", async function () {
      await expect(
        ticket1155.connect(user1).clearTokenURI(1)
      ).to.be.revertedWithCustomError(ticket1155, "OwnableUnauthorizedAccount");
    });
  });

  describe("TicketType Management", function () {
    it("Should allow owner to set ticket type", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      
      const ticketType = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: getTicketType(1) sau khi setTicketType() ===");
      console.log("name:", ticketType[0]);
      console.log("maxSupply:", ticketType[1].toString());
      console.log("currentSupply:", ticketType[2].toString());
      console.log("isActive:", ticketType[3]);
      console.log("currentBurn:", ticketType[4].toString());
      
      expect(ticketType[0]).to.equal("Vé thường");
      expect(ticketType[1]).to.equal(1000n);
      expect(ticketType[2]).to.equal(0n);
      expect(ticketType[3]).to.be.true;
      expect(ticketType[4]).to.equal(0n);
    });

    it("Should preserve currentSupply when updating ticket type", async function () {
      // Set ticket type ban đầu
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      
      // Mint một số vé
      await ticket1155.createTicket(tokenId1, 50);
      const ticketTypeBefore = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: currentSupply sau khi mint 50 vé ===");
      console.log("Kết quả:", ticketTypeBefore[2].toString());
      
      // Update ticket type
      await ticket1155.setTicketType(tokenId1, "Vé thường Updated", 2000, true);
      const ticketTypeAfter = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: currentSupply sau khi update ticket type ===");
      console.log("Kết quả:", ticketTypeAfter[2].toString());
      
      expect(ticketTypeAfter[2]).to.equal(50n); // Giữ nguyên currentSupply
      expect(ticketTypeAfter[0]).to.equal("Vé thường Updated");
      expect(ticketTypeAfter[1]).to.equal(2000n);
    });

    it("Should not allow non-owner to set ticket type", async function () {
      await expect(
        ticket1155.connect(user1).setTicketType(tokenId1, "Vé VIP", 500, true)
      ).to.be.revertedWithCustomError(ticket1155, "OwnableUnauthorizedAccount");
    });

    it("Should return empty values for unset ticket type", async function () {
      const ticketType = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: getTicketType(1) khi chưa set ===");
      console.log("name:", ticketType[0]);
      console.log("maxSupply:", ticketType[1].toString());
      console.log("currentSupply:", ticketType[2].toString());
      console.log("isActive:", ticketType[3]);
      console.log("currentBurn:", ticketType[4].toString());
      
      expect(ticketType[0]).to.equal("");
      expect(ticketType[1]).to.equal(0n);
      expect(ticketType[2]).to.equal(0n);
      expect(ticketType[3]).to.be.false;
      expect(ticketType[4]).to.equal(0n);
    });
  });

  describe("canMint", function () {
    it("Should return true for unset ticket type (backward compatible)", async function () {
      const canMintResult = await ticket1155.canMint(tokenId1, 100);
      console.log("\n=== DEBUG: canMint(1, 100) khi chưa set ticket type ===");
      console.log("Kết quả:", canMintResult);
      expect(canMintResult).to.be.true;
    });

    it("Should return true when within maxSupply and active", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 500);
      
      const canMintResult = await ticket1155.canMint(tokenId1, 400);
      console.log("\n=== DEBUG: canMint(1, 400) với currentSupply=500, maxSupply=1000 ===");
      console.log("Kết quả:", canMintResult);
      expect(canMintResult).to.be.true;
    });

    it("Should return false when exceeds maxSupply", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 500);
      
      const canMintResult = await ticket1155.canMint(tokenId1, 501);
      console.log("\n=== DEBUG: canMint(1, 501) với currentSupply=500, maxSupply=1000 ===");
      console.log("Kết quả:", canMintResult);
      expect(canMintResult).to.be.false;
    });

    it("Should return false when ticket is not active", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, false);
      
      const canMintResult = await ticket1155.canMint(tokenId1, 100);
      console.log("\n=== DEBUG: canMint(1, 100) khi isActive=false ===");
      console.log("Kết quả:", canMintResult);
      expect(canMintResult).to.be.false;
    });

    it("Should return true when exactly at maxSupply", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 999);
      
      const canMintResult = await ticket1155.canMint(tokenId1, 1);
      console.log("\n=== DEBUG: canMint(1, 1) với currentSupply=999, maxSupply=1000 ===");
      console.log("Kết quả:", canMintResult);
      expect(canMintResult).to.be.true;
    });
  });

  describe("createTicket with TicketType", function () {
    it("Should allow creating tickets within maxSupply", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      
      await ticket1155.createTicket(tokenId1, 500);
      
      const balance = await ticket1155.balanceOf(owner.address, tokenId1);
      const ticketType = await ticket1155.getTicketType(tokenId1);
      
      console.log("\n=== DEBUG: createTicket() với maxSupply ===");
      console.log("balance:", balance.toString());
      console.log("currentSupply:", ticketType[2].toString());
      
      expect(balance).to.equal(500n);
      expect(ticketType[2]).to.equal(500n);
    });

    it("Should not allow creating tickets exceeding maxSupply", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 500);
      
      await expect(
        ticket1155.createTicket(tokenId1, 501)
      ).to.be.revertedWith("Ticket1155: Exceeds max supply or ticket not active");
    });

    it("Should not allow creating tickets when ticket is not active", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, false);
      
      await expect(
        ticket1155.createTicket(tokenId1, 100)
      ).to.be.revertedWith("Ticket1155: Exceeds max supply or ticket not active");
    });

    it("Should update currentSupply correctly on multiple mints", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      
      await ticket1155.createTicket(tokenId1, 300);
      let ticketType = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: currentSupply sau lần mint thứ nhất ===");
      console.log("Kết quả:", ticketType[2].toString());
      expect(ticketType[2]).to.equal(300n);
      
      await ticket1155.createTicket(tokenId1, 200);
      ticketType = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: currentSupply sau lần mint thứ hai ===");
      console.log("Kết quả:", ticketType[2].toString());
      expect(ticketType[2]).to.equal(500n);
    });

    it("Should allow creating tickets without ticket type (backward compatible)", async function () {
      await ticket1155.createTicket(tokenId1, 100);
      
      const balance = await ticket1155.balanceOf(owner.address, tokenId1);
      console.log("\n=== DEBUG: createTicket() không có ticket type ===");
      console.log("balance:", balance.toString());
      expect(balance).to.equal(100n);
    });
  });

  describe("buyTicket with TicketType", function () {
    it("Should allow buying tickets within maxSupply", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé VIP", 500, true);
      
      await ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 });
      
      const balance = await ticket1155.balanceOf(user1.address, tokenId1);
      const ticketType = await ticket1155.getTicketType(tokenId1);
      
      console.log("\n=== DEBUG: buyTicket() với maxSupply ===");
      console.log("balance:", balance.toString());
      console.log("currentSupply:", ticketType[2].toString());
      
      expect(balance).to.equal(1n);
      expect(ticketType[2]).to.equal(1n);
    });

    it("Should not allow buying tickets exceeding maxSupply", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé VIP", 5, true);
      
      // Mint 5 vé trước (đạt maxSupply)
      await ticket1155.createTicket(tokenId1, 5);
      
      await expect(
        ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 })
      ).to.be.revertedWith("ticket is out of stock or stopped selling");
    });

    it("Should not allow buying when currentSupply - currentBurn <= 0", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé VIP", 100, true);
      
      // Mint 50 vé
      await ticket1155.createTicket(tokenId1, 50);
      
      // Burn 50 vé (currentSupply - currentBurn = 0)
      await ticket1155.burnTicket(owner.address, tokenId1, 50);
      
      await expect(
        ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 })
      ).to.be.revertedWith("ticket is out of stock or stopped selling");
    });

    it("Should not allow buying tickets when ticket is not active", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé VIP", 500, false);
      
      await expect(
        ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 })
      ).to.be.revertedWith("ticket is out of stock or stopped selling");
    });

    it("Should update currentSupply correctly on multiple buys", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé VIP", 100, true);
      
      await ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 });
      let ticketType = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: currentSupply sau lần buy thứ nhất ===");
      console.log("Kết quả:", ticketType[2].toString());
      expect(ticketType[2]).to.equal(1n);
      
      await ticket1155.connect(user2).buyTicket(tokenId1, { value: 0 });
      ticketType = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: currentSupply sau lần buy thứ hai ===");
      console.log("Kết quả:", ticketType[2].toString());
      expect(ticketType[2]).to.equal(2n);
    });

    it("Should allow buying tickets without ticket type (backward compatible)", async function () {
      await ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 });
      
      const balance = await ticket1155.balanceOf(user1.address, tokenId1);
      console.log("\n=== DEBUG: buyTicket() không có ticket type ===");
      console.log("balance:", balance.toString());
      expect(balance).to.equal(1n);
    });
  });

  describe("burnTicket", function () {
    it("Should allow owner to burn their own tickets", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 100);
      
      const balanceBefore = await ticket1155.balanceOf(owner.address, tokenId1);
      const ticketTypeBefore = await ticket1155.getTicketType(tokenId1);
      
      // Burn với amount > 1
      await ticket1155.burnTicket(owner.address, tokenId1, 30);
      
      const balanceAfter = await ticket1155.balanceOf(owner.address, tokenId1);
      const ticketTypeAfter = await ticket1155.getTicketType(tokenId1);
      
      console.log("\n=== DEBUG: burnTicket() ===");
      console.log("balance trước:", balanceBefore.toString());
      console.log("balance sau:", balanceAfter.toString());
      console.log("currentSupply trước:", ticketTypeBefore[2].toString());
      console.log("currentSupply sau:", ticketTypeAfter[2].toString());
      console.log("currentBurn sau:", ticketTypeAfter[4].toString());
      
      expect(balanceAfter).to.equal(70n);
      expect(ticketTypeAfter[2]).to.equal(100n); // currentSupply không đổi
      expect(ticketTypeAfter[4]).to.equal(30n); // currentBurn tăng
    });

    it("Should allow approved operator to burn tickets", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 100);
      await ticket1155.setApprovalForAll(user1.address, true);
      
      await ticket1155.connect(user1).burnTicket(owner.address, tokenId1, 20);
      
      const balance = await ticket1155.balanceOf(owner.address, tokenId1);
      const ticketType = await ticket1155.getTicketType(tokenId1);
      
      console.log("\n=== DEBUG: burnTicket() bởi approved operator ===");
      console.log("balance:", balance.toString());
      console.log("currentSupply:", ticketType[2].toString());
      console.log("currentBurn:", ticketType[4].toString());
      
      expect(balance).to.equal(80n);
      expect(ticketType[2]).to.equal(100n); // currentSupply không đổi
      expect(ticketType[4]).to.equal(20n); // currentBurn tăng
    });

    it("Should allow staff to burn tickets for users", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 50);

      // Set user1 as staff
      await ticket1155.setStaff(user1.address, true);

      // Staff burns 10 tickets from owner (amount > 1)
      await ticket1155.connect(user1).burnTicket(owner.address, tokenId1, 10);

      const balance = await ticket1155.balanceOf(owner.address, tokenId1);
      const ticketType = await ticket1155.getTicketType(tokenId1);

      expect(balance).to.equal(40n);
      expect(ticketType[2]).to.equal(50n); // currentSupply không đổi
      expect(ticketType[4]).to.equal(10n); // currentBurn tăng
    });

    it("Should not allow unauthorized user to burn tickets", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 100);
      
      await expect(
        ticket1155.connect(user1).burnTicket(owner.address, tokenId1, 10)
      ).to.be.revertedWith("Ticket1155: Not authorized to burn");
    });

    it("Should handle burning correctly and update currentBurn", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 50);
      
      const ticketTypeBefore = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: Trước khi burn ===");
      console.log("currentSupply:", ticketTypeBefore[2].toString());
      console.log("currentBurn:", ticketTypeBefore[4].toString());
      expect(ticketTypeBefore[2]).to.equal(50n);
      expect(ticketTypeBefore[4]).to.equal(0n);
      
      // Burn 30, balance = 20, currentSupply giữ nguyên, currentBurn = 30
      await ticket1155.burnTicket(owner.address, tokenId1, 30);
      
      const ticketTypeAfter = await ticket1155.getTicketType(tokenId1);
      const balance = await ticket1155.balanceOf(owner.address, tokenId1);
      console.log("\n=== DEBUG: Sau khi burn 30 ===");
      console.log("balance:", balance.toString());
      console.log("currentSupply:", ticketTypeAfter[2].toString());
      console.log("currentBurn:", ticketTypeAfter[4].toString());
      
      expect(balance).to.equal(20n);
      expect(ticketTypeAfter[2]).to.equal(50n); // currentSupply không đổi
      expect(ticketTypeAfter[4]).to.equal(30n); // currentBurn tăng
      
      // Burn remaining 20
      await ticket1155.burnTicket(owner.address, tokenId1, 20);
      
      const ticketTypeFinal = await ticket1155.getTicketType(tokenId1);
      console.log("\n=== DEBUG: Sau khi burn hết ===");
      console.log("currentSupply:", ticketTypeFinal[2].toString());
      console.log("currentBurn:", ticketTypeFinal[4].toString());
      
      expect(ticketTypeFinal[2]).to.equal(50n); // currentSupply không đổi
      expect(ticketTypeFinal[4]).to.equal(50n); // currentBurn = tổng đã burn
    });

    it("Should not allow burning with amount <= 1", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, 50);
      
      await expect(
        ticket1155.burnTicket(owner.address, tokenId1, 1)
      ).to.be.revertedWith("amount must be greater than 1");
      
      await expect(
        ticket1155.burnTicket(owner.address, tokenId1, 0)
      ).to.be.revertedWith("amount must be greater than 1");
    });
  });

  describe("Multiple Ticket Types", function () {
    it("Should handle different ticket types independently", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.setTicketType(tokenId2, "Vé VIP", 500, true);
      await ticket1155.setTicketType(tokenId3, "Vé VVIP", 100, true);
      
      await ticket1155.createTicket(tokenId1, 200);
      await ticket1155.createTicket(tokenId2, 100);
      await ticket1155.createTicket(tokenId3, 50);
      
      const ticketType1 = await ticket1155.getTicketType(tokenId1);
      const ticketType2 = await ticket1155.getTicketType(tokenId2);
      const ticketType3 = await ticket1155.getTicketType(tokenId3);
      
      console.log("\n=== DEBUG: Nhiều loại vé khác nhau ===");
      console.log("Vé thường - currentSupply:", ticketType1[2].toString());
      console.log("Vé VIP - currentSupply:", ticketType2[2].toString());
      console.log("Vé VVIP - currentSupply:", ticketType3[2].toString());
      
      expect(ticketType1[2]).to.equal(200n);
      expect(ticketType2[2]).to.equal(100n);
      expect(ticketType3[2]).to.equal(50n);
    });

    it("Should allow buying different ticket types", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.setTicketType(tokenId2, "Vé VIP", 500, true);
      
      await ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 });
      await ticket1155.connect(user1).buyTicket(tokenId2, { value: 0 });
      
      const balance1 = await ticket1155.balanceOf(user1.address, tokenId1);
      const balance2 = await ticket1155.balanceOf(user1.address, tokenId2);
      const ticketType1 = await ticket1155.getTicketType(tokenId1);
      const ticketType2 = await ticket1155.getTicketType(tokenId2);
      
      console.log("\n=== DEBUG: Mua nhiều loại vé khác nhau ===");
      console.log("balance vé thường:", balance1.toString());
      console.log("balance vé VIP:", balance2.toString());
      console.log("currentSupply vé thường:", ticketType1[2].toString());
      console.log("currentSupply vé VIP:", ticketType2[2].toString());
      
      expect(balance1).to.equal(1n);
      expect(balance2).to.equal(1n);
      expect(ticketType1[2]).to.equal(1n);
      expect(ticketType2[2]).to.equal(1n);
    });
  });

  describe("pause and unpause", function () {
    it("Should allow owner to pause", async function () {
      const pausedBefore = await ticket1155.paused();
      console.log("\n=== DEBUG: paused() trước khi pause() ===");
      console.log("Kết quả:", pausedBefore);
      
      await ticket1155.pause();
      
      const pausedAfter = await ticket1155.paused();
      console.log("\n=== DEBUG: paused() sau khi pause() ===");
      console.log("Kết quả:", pausedAfter);
      
      expect(pausedAfter).to.be.true;
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(
        ticket1155.connect(user1).pause()
      ).to.be.revertedWithCustomError(ticket1155, "OwnableUnauthorizedAccount");
    });

    it("Should allow owner to unpause", async function () {
      await ticket1155.pause();
      const pausedAfterPause = await ticket1155.paused();
      console.log("\n=== DEBUG: paused() sau khi pause() ===");
      console.log("Kết quả:", pausedAfterPause);
      
      await ticket1155.unpause();
      
      const pausedAfterUnpause = await ticket1155.paused();
      console.log("\n=== DEBUG: paused() sau khi unpause() ===");
      console.log("Kết quả:", pausedAfterUnpause);
      
      expect(pausedAfterUnpause).to.be.false;
    });

    it("Should not allow non-owner to unpause", async function () {
      await ticket1155.pause();
      await expect(
        ticket1155.connect(user1).unpause()
      ).to.be.revertedWithCustomError(ticket1155, "OwnableUnauthorizedAccount");
    });

    it("Should not allow buying tickets when paused", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.pause();

      await expect(
        ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 })
      ).to.be.revertedWithCustomError(ticket1155, "EnforcedPause");
    });

    it("Should allow buying tickets after unpause", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.pause();
      await ticket1155.unpause();

      await ticket1155.connect(user1).buyTicket(tokenId1, { value: 0 });
      const balance = await ticket1155.balanceOf(user1.address, tokenId1);
      console.log("\n=== DEBUG: balanceOf() sau khi unpause và buyTicket() ===");
      console.log("Kết quả:", balance.toString());
      expect(balance).to.equal(1n);
    });
  });

  describe("ERC1155 functionality", function () {
    it("Should support safeTransferFrom", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.createTicket(tokenId1, amount);
      
      const transferAmount = 10n;
      const ownerBalanceBefore = await ticket1155.balanceOf(owner.address, tokenId1);
      const user1BalanceBefore = await ticket1155.balanceOf(user1.address, tokenId1);
      console.log("\n=== DEBUG: balanceOf() trước khi safeTransferFrom() ===");
      console.log("balanceOf(owner, 1):", ownerBalanceBefore.toString());
      console.log("balanceOf(user1, 1):", user1BalanceBefore.toString());
      
      await ticket1155.safeTransferFrom(
        owner.address,
        user1.address,
        tokenId1,
        transferAmount,
        "0x"
      );
      
      const ownerBalanceAfter = await ticket1155.balanceOf(owner.address, tokenId1);
      const user1BalanceAfter = await ticket1155.balanceOf(user1.address, tokenId1);
      console.log("\n=== DEBUG: balanceOf() sau khi safeTransferFrom() ===");
      console.log("balanceOf(owner, 1):", ownerBalanceAfter.toString());
      console.log("balanceOf(user1, 1):", user1BalanceAfter.toString());

      expect(ownerBalanceAfter).to.equal(amount - transferAmount);
      expect(user1BalanceAfter).to.equal(transferAmount);
    });

    it("Should support safeBatchTransferFrom", async function () {
      await ticket1155.setTicketType(tokenId1, "Vé thường", 1000, true);
      await ticket1155.setTicketType(tokenId2, "Vé VIP", 500, true);
      await ticket1155.createTicket(tokenId1, amount);
      await ticket1155.createTicket(tokenId2, amount);
      
      const transferAmounts = [10n, 20n];
      
      await ticket1155.safeBatchTransferFrom(
        owner.address,
        user1.address,
        [tokenId1, tokenId2],
        transferAmounts,
        "0x"
      );
      
      const ownerBalance1After = await ticket1155.balanceOf(owner.address, tokenId1);
      const ownerBalance2After = await ticket1155.balanceOf(owner.address, tokenId2);
      const user1Balance1After = await ticket1155.balanceOf(user1.address, tokenId1);
      const user1Balance2After = await ticket1155.balanceOf(user1.address, tokenId2);
      
      console.log("\n=== DEBUG: balanceOf() sau khi safeBatchTransferFrom() ===");
      console.log("balanceOf(owner, 1):", ownerBalance1After.toString());
      console.log("balanceOf(owner, 2):", ownerBalance2After.toString());
      console.log("balanceOf(user1, 1):", user1Balance1After.toString());
      console.log("balanceOf(user1, 2):", user1Balance2After.toString());

      expect(ownerBalance1After).to.equal(amount - 10n);
      expect(ownerBalance2After).to.equal(amount - 20n);
      expect(user1Balance1After).to.equal(10n);
      expect(user1Balance2After).to.equal(20n);
    });

    it("Should support setApprovalForAll", async function () {
      const approvedBefore = await ticket1155.isApprovedForAll(owner.address, user1.address);
      console.log("\n=== DEBUG: isApprovedForAll() trước khi setApprovalForAll() ===");
      console.log("Kết quả:", approvedBefore);
      
      await ticket1155.setApprovalForAll(user1.address, true);
      
      const approvedAfter = await ticket1155.isApprovedForAll(owner.address, user1.address);
      console.log("\n=== DEBUG: isApprovedForAll() sau khi setApprovalForAll() ===");
      console.log("Kết quả:", approvedAfter);

      expect(approvedAfter).to.be.true;
    });
  });
});
