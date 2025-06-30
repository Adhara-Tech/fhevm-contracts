import { expect } from "chai";

import { createInstance } from "../instance";
import { getSigners, initSigners } from "../signers";
import { deployConfidentialATCFixture, reEncryptBalance, reEncryptUint64 } from "./ConfidentialATC.fixture";
import {ethers} from "hardhat";

describe("Besu signer sanity", () => {
  it("gets signer and sends transaction", async () => {
    const [signer] = await ethers.getSigners();
    console.log("Using signer:", await signer.getAddress());

    const tx = await signer.sendTransaction({
      to: await signer.getAddress(),
      value: ethers.parseEther("0.001"),
    });

    console.log("Sent tx:", tx.hash);
    await tx.wait();
  });
});

describe("ConfidentialATC", function () {
  // @dev The placeholder is type(uint256).max --> 2**256 - 1.
  const PLACEHOLDER = 2n ** 256n - 1n;

  before(async function () {
    await initSigners();
    this.signers = await getSigners();
    this.instance = await createInstance();
  });

  beforeEach(async function () {
    const contract = await deployConfidentialATCFixture(
      this.signers.alice,
      "ATC",
      "USD",
      await this.signers.alice.getAddress(),
    );
    this.confidentialATCAddress = await contract.getAddress();
    this.confidentialATC = contract;
  });

  it("post-deployment state", async function () {
    expect(await this.confidentialATC.totalSupply()).to.equal(0);
    expect(await this.confidentialATC.name()).to.equal("ATC");
    expect(await this.confidentialATC.symbol()).to.equal("USD");
    expect(await this.confidentialATC.decimals()).to.be.eq(BigInt(6));
  });

  it("should create tokens in the contract", async function () {
    const fromAccount = "alice";
    const createAmount = 1000;

    const registerTx = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerTx.wait();
    await expect(registerTx).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);

    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();
    await expect(createTx).to.emit(this.confidentialATC, "CreateExecuted").withArgs("operationId", fromAccount, this.signers.alice.address, createAmount, "");

    expect(
      await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(createAmount);
  });

  it("should transfer tokens between two users", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const createAmount = 2000;
    const transferAmount = 1337;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    const registerTo = await this.confidentialATC.connect(this.signers.alice).registerAccount(toAccount, this.signers.bob.address);
    await registerTo.wait();
    await expect(registerTo).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(toAccount, this.signers.bob.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    const tx = await this.confidentialATC.connect(this.signers.alice)[
      "transfer(string,string,address,string,address,bytes32,bytes)"
      ](
        "operationId",
        fromAccount,
        this.signers.alice.address,
        toAccount,
        this.signers.bob.address,
        encryptedTransferAmount.handles[0],
        encryptedTransferAmount.inputProof
      , {gasLimit: 6_000_000});
    let result = await tx.wait();
    expect(result.status).to.equal(1);

    const events = await this.confidentialATC.queryFilter(
      this.confidentialATC.filters.TransferExecuted(),
      result.blockNumber
    );
    expect(events.length).to.be.greaterThan(0);
    const event = events[0].args;
    expect(event.operationId).to.equal("operationId");
    expect(event.fromAccount).to.equal(fromAccount);
    expect(event.fromAddress).to.equal(this.signers.alice.address);
    expect(event.toAccount).to.equal(toAccount);
    expect(event.toAddress).to.equal(this.signers.bob.address);
    expect(await reEncryptUint64(this.signers.alice, this.instance, this.confidentialATCAddress, event.amount)).to.equal(transferAmount)
    expect(await reEncryptUint64(this.signers.bob, this.instance, this.confidentialATCAddress, event.amount)).to.equal(transferAmount)
    await expect(reEncryptUint64(this.signers.carol, this.instance, this.confidentialATCAddress, event.amount)).to.be.rejectedWith("User is not authorized to reencrypt this handle!");
    expect(await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount - transferAmount);
    expect(await reEncryptBalance(this.signers.bob, toAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(transferAmount);
  });

  it("should not transfer tokens between two users if transfer amount is higher than balance", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const createAmount = 1000;
    const transferAmount = 1337;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    const registerTo = await this.confidentialATC.connect(this.signers.alice).registerAccount(toAccount, this.signers.bob.address);
    await registerTo.wait();
    await expect(registerTo).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(toAccount, this.signers.bob.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();
    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    const tx = await this.confidentialATC.connect(this.signers.alice)[
      "transfer(string,string,address,string,address,bytes32,bytes)"
      ](
      "operationId",
      fromAccount,
      this.signers.alice.address,
      toAccount,
      this.signers.bob.address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof
    );
    let result = await tx.wait();
    expect(result.status).to.equal(1);


    expect(await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount);
    expect(await reEncryptBalance(this.signers.bob, toAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(0);
  });

  it("should create hold and execute correctly if balance is sufficient", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const createAmount = 2000;
    const holdAmount = 1337;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    const registerTo = await this.confidentialATC.connect(this.signers.alice).registerAccount(toAccount, this.signers.bob.address);
    await registerTo.wait();
    await expect(registerTo).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(toAccount, this.signers.bob.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();
    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(holdAmount);
    const encryptedHoldAmount = await input.encrypt();

    const tx = await this.confidentialATC.connect(this.signers.alice)[
      "createHold(string,string,address,string,address,string,bytes32,bytes,uint256)"
      ](
      "operationId",
      fromAccount,
      this.signers.alice.address,
      toAccount,
      this.signers.bob.address,
      "notaryId",
      encryptedHoldAmount.handles[0],
      encryptedHoldAmount.inputProof,
      0
    );
    let result = await tx.wait();
    expect(result.status).to.equal(1);

    const events = await this.confidentialATC.queryFilter(
      this.confidentialATC.filters.CreateHoldExecuted(),
      result.blockNumber
    );
    expect(events.length).to.be.greaterThan(0);
    const event = events[0].args;
    expect(event.operationId).to.equal("operationId");
    expect(event.fromAccount).to.equal(fromAccount);
    expect(event.fromAddress).to.equal(this.signers.alice.address);
    expect(event.toAccount).to.equal(toAccount);
    expect(event.toAddress).to.equal(this.signers.bob.address);
    expect(event.notaryId).to.equal("notaryId");
    expect(await reEncryptUint64(this.signers.alice, this.instance, this.confidentialATCAddress, event.amount)).to.equal(holdAmount)
    expect(await reEncryptUint64(this.signers.bob, this.instance, this.confidentialATCAddress, event.amount)).to.equal(holdAmount)
    await expect(reEncryptUint64(this.signers.carol, this.instance, this.confidentialATCAddress, event.amount)).to.be.rejectedWith("User is not authorized to reencrypt this handle!");
    expect(await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount - holdAmount);
    expect(await reEncryptBalance(this.signers.bob, toAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(0);

    const ex = await this.confidentialATC.connect(this.signers.alice)["executeHold(string)"]("operationId");
    result = await ex.wait();
    expect(result.status).to.equal(1);

    expect(await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount - holdAmount);
    expect(await reEncryptBalance(this.signers.bob, toAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(holdAmount);
  });

  it("should create hold and execute correctly with zero amount if balance is sufficient", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const createAmount = 1000;
    const holdAmount = 1337;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    const registerTo = await this.confidentialATC.connect(this.signers.alice).registerAccount(toAccount, this.signers.bob.address);
    await registerTo.wait();
    await expect(registerTo).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(toAccount, this.signers.bob.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();
    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(holdAmount);
    const encryptedHoldAmount = await input.encrypt();

    const tx = await this.confidentialATC.connect(this.signers.alice)[
      "createHold(string,string,address,string,address,string,bytes32,bytes,uint256)"
      ](
      "operationId",
      fromAccount,
      this.signers.alice.address,
      toAccount,
      this.signers.bob.address,
      "notaryId",
      encryptedHoldAmount.handles[0],
      encryptedHoldAmount.inputProof,
      0
    );
    let result = await tx.wait();
    expect(result.status).to.equal(1);

    expect(await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount);
    expect(await reEncryptBalance(this.signers.bob, toAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(0);
    const holdData = await this.confidentialATC.connect(this.signers.alice).getHoldData("operationId")
    expect(holdData.fromAccount).to.equal(fromAccount);
    expect(holdData.fromAddress).to.equal(this.signers.alice.address);
    expect(holdData.toAccount).to.equal(toAccount);
    expect(holdData.toAddress).to.equal(this.signers.bob.address);
    expect(holdData.notaryId).to.equal("notaryId")
    expect(holdData.expiryTimestamp).to.equal(0n);
    expect(holdData.holdStatus).to.equal("0x70657270657475616c0000000000000000000000000000000000000000000000");
    expect(holdData.holdType).to.equal("0x6e6f726d616c0000000000000000000000000000000000000000000000000000");
    expect(await reEncryptUint64(this.signers.alice, this.instance, this.confidentialATCAddress, holdData.amount)).to.equal(0)
    expect(await reEncryptUint64(this.signers.bob, this.instance, this.confidentialATCAddress, holdData.amount)).to.equal(0)
    await expect(reEncryptUint64(this.signers.carol, this.instance, this.confidentialATCAddress, holdData.amount)).to.be.rejectedWith("User is not authorized to reencrypt this handle!");

    const ex = await this.confidentialATC.connect(this.signers.alice)["executeHold(string)"]("operationId");
    result = await ex.wait();
    expect(result.status).to.equal(1);

    expect(await reEncryptBalance(this.signers.alice, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount);
    expect(await reEncryptBalance(this.signers.bob, toAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(0);
  });

  it("should not be able to read the balance if not user after initialization", async function () {
    const fromAccount = "alice";
    const createAmount = 1000;

    const registerTx = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount , this.signers.alice.address);
    await registerTx.wait();
    await expect(registerTx).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount , this.signers.alice.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount , this.signers.alice.address, createAmount, "");
    await createTx.wait();
    await expect(createTx).to.emit(this.confidentialATC, "CreateExecuted").withArgs("operationId", fromAccount , this.signers.alice.address, createAmount, "");

    expect(await reEncryptBalance(this.signers.alice, fromAccount , this.instance, this.confidentialATC, this.confidentialATCAddress)).to.equal(createAmount);
    await expect(reEncryptBalance(this.signers.bob, fromAccount, this.instance, this.confidentialATC, this.confidentialATCAddress)).to.be.rejectedWith("User is not authorized to reencrypt this handle!");
  });

  it("sender or receiver cannot be null address", async function () {
    const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
    const fromAccount = "alice";
    const toAccount = "bob";
    const createAmount = 2000;
    const holdAmount = 1337;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    const registerTo = await this.confidentialATC.connect(this.signers.alice).registerAccount(toAccount, this.signers.bob.address);
    await registerTo.wait();
    await expect(registerTo).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(toAccount, this.signers.bob.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();
    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(holdAmount);
    const encryptedHoldAmount = await input.encrypt();

    await expect(this.confidentialATC.connect(this.signers.alice)[
      "createHold(string,string,address,string,address,string,bytes32,bytes,uint256)"
      ](
      "operationId",
      fromAccount,
      NULL_ADDRESS,
      toAccount,
      this.signers.bob.address,
      "notaryId",
      encryptedHoldAmount.handles[0],
      encryptedHoldAmount.inputProof,
      0
    )).to.be.revertedWith("Invalid sending account address in hold data");

    await expect(this.confidentialATC.connect(this.signers.alice)[
      "createHold(string,string,address,string,address,string,bytes32,bytes,uint256)"
      ](
      "operationId",
      fromAccount,
      this.signers.alice.address,
      toAccount,
      NULL_ADDRESS,
      "notaryId",
      encryptedHoldAmount.handles[0],
      encryptedHoldAmount.inputProof,
      0
    )).to.be.revertedWith("Invalid receiving account address in hold data");
  });

  it("sender cannot create hold using a handle from another account", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const createAmount = 100000;
    const holdAmount = 50000;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    const registerTo = await this.confidentialATC.connect(this.signers.alice).registerAccount(toAccount, this.signers.bob.address);
    await registerTo.wait();
    await expect(registerTo).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(toAccount, this.signers.bob.address);
    const createTx = await this.confidentialATC.connect(this.signers.alice).create("operationId", fromAccount, this.signers.alice.address, createAmount, "");
    await createTx.wait();
    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.carol.address);
    input.add64(holdAmount);
    const encryptedHoldAmount = await input.encrypt();

    await expect(this.confidentialATC.connect(this.signers.alice)[
      "createHold(string,string,address,string,address,string,bytes32,bytes,uint256)"
      ](
      "operationId",
      fromAccount,
      this.signers.alice.address,
      toAccount,
      this.signers.bob.address,
      "notaryId",
      encryptedHoldAmount.handles[0],
      encryptedHoldAmount.inputProof,
      0
    )).to.be.revertedWith("Coprocessor address mismatch");

  });

  it("only owner can create", async function () {
    const fromAccount = "alice";
    const createAmount = 1000;

    const registerFrom = await this.confidentialATC.connect(this.signers.alice).registerAccount(fromAccount, this.signers.alice.address);
    await registerFrom.wait();
    await expect(registerFrom).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs(fromAccount, this.signers.alice.address);
    await expect(
      this.confidentialATC.connect(this.signers.bob).create("operationId", fromAccount, this.signers.bob.address, createAmount, "")
    ).to.be.revertedWithCustomError(this.confidentialATC, "OwnableUnauthorizedAccount");
  });
});
