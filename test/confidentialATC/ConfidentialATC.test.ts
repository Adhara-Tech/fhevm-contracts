import { expect } from "chai";

import { createInstance } from "../instance";
import { getSigners, initSigners } from "../signers";
import { deployConfidentialATCFixture, reEncryptBalance } from "./ConfidentialATC.fixture";

describe.only("ConfidentialATC", function () {
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

  it.only("should create token in the contract", async function () {
    const createAmount = 1000;

    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(createAmount);
    const encryptedAmount = await input.encrypt();

    const ex = await this.confidentialATC.connect(this.signers.alice).registerAccount("alice");
    console.log("I got here")

    await expect(ex).to.emit(this.confidentialATC, "RegisterAccountExecuted").withArgs("alice");


    const encryptedBalance = await this.confidentialATC.getAvailableBalanceOf("alice");
    console.log("Encrypted Balance:", encryptedBalance);

    const tx = await this.confidentialATC.connect(this.signers.alice).create("operationId", "alice", encryptedBalance.handles[0], "create");
    await expect(tx).to.emit(this.confidentialATC, "CreateExecuted").withArgs("operationId", "alice", createAmount, "create");

    expect(
      await reEncryptBalance(this.signers.alice, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(createAmount);

    expect(await this.confidentialATC.totalSupply()).to.equal(createAmount);
  });

  it("should transfer tokens between two users", async function () {
    const createAmount = 10_000;
    const transferAmount = 1337;

    let tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, createAmount);
    await tx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    tx = await this.confidentialATC
      .connect(this.signers.alice)
      [
        "transfer(address,bytes32,bytes)"
      ](this.signers.bob.address, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);

    await expect(tx)
      .to.emit(this.confidentialATC, "Transfer")
      .withArgs(this.signers.alice, this.signers.bob, PLACEHOLDER);

    // Decrypt Alice's balance
    expect(
      await reEncryptBalance(this.signers.alice, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(createAmount - transferAmount);

    // Decrypt Bob's balance
    expect(
      await reEncryptBalance(this.signers.bob, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(transferAmount);
  });

  it("should not transfer tokens between two users if transfer amount is higher than balance", async function () {
    // @dev There is no transfer done since the create amount is smaller than the transfer
    //      amount.
    const createAmount = 1000;
    const transferAmount = 1337;

    let tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, createAmount);
    await tx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    tx = await this.confidentialATC["transfer(address,bytes32,bytes)"](
      this.signers.bob.address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof,
    );

    // @dev There is no error-handling in this version of ConfidentialATC.
    await expect(tx)
      .to.emit(this.confidentialATC, "Transfer")
      .withArgs(this.signers.alice, this.signers.bob, PLACEHOLDER);

    // Decrypt Alice's balance
    expect(
      await reEncryptBalance(this.signers.alice, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(createAmount);

    // Decrypt Bob's balance
    expect(
      await reEncryptBalance(this.signers.bob, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(0);
  });

  it("should be able to transferFrom only if allowance is sufficient", async function () {
    // @dev There is no transfer done since the create amount is smaller than the transfer
    //      amount.
    const createAmount = 10_000;
    const transferAmount = 1337;

    let tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, createAmount);
    await tx.wait();

    const inputAlice = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    inputAlice.add64(transferAmount);
    const encryptedAllowanceAmount = await inputAlice.encrypt();

    tx = await this.confidentialATC["approve(address,bytes32,bytes)"](
      this.signers.bob.address,
      encryptedAllowanceAmount.handles[0],
      encryptedAllowanceAmount.inputProof,
    );

    await expect(tx)
      .to.emit(this.confidentialATC, "Approval")
      .withArgs(this.signers.alice, this.signers.bob, PLACEHOLDER);

    // @dev The allowance amount is set to be equal to the transfer amount.
    // expect(
    //   await reEncryptAllowance(
    //     this.signers.alice,
    //     this.signers.bob,
    //     this.instance,
    //     this.confidentialATC,
    //     this.confidentialATCAddress,
    //   ),
    // ).to.equal(transferAmount);

    const bobErc20 = this.confidentialATC.connect(this.signers.bob);
    const inputBob1 = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.bob.address);
    inputBob1.add64(transferAmount + 1); // above allowance so next tx should actually not send any token
    const encryptedTransferAmount = await inputBob1.encrypt();

    const tx2 = await bobErc20["transferFrom(address,address,bytes32,bytes)"](
      this.signers.alice.address,
      this.signers.bob.address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof,
    );

    await expect(tx2)
      .to.emit(this.confidentialATC, "Transfer")
      .withArgs(this.signers.alice, this.signers.bob, PLACEHOLDER);

    // Decrypt Alice's balance
    expect(
      await reEncryptBalance(this.signers.alice, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(createAmount); // check that transfer did not happen, as expected

    // Decrypt Bob's balance
    expect(
      await reEncryptBalance(this.signers.bob, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(0); // check that transfer did not happen, as expected

    const inputBob2 = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.bob.address);
    inputBob2.add64(transferAmount); // below allowance so next tx should send token
    const encryptedTransferAmount2 = await inputBob2.encrypt();

    const tx3 = await bobErc20["transferFrom(address,address,bytes32,bytes)"](
      this.signers.alice.address,
      this.signers.bob.address,
      encryptedTransferAmount2.handles[0],
      encryptedTransferAmount2.inputProof,
    );
    await tx3.wait();

    // Decrypt Alice's balance
    expect(
      await reEncryptBalance(this.signers.alice, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(createAmount - transferAmount); // check that transfer did happen this time

    // Decrypt Bob's balance
    expect(
      await reEncryptBalance(this.signers.bob, this.instance, this.confidentialATC, this.confidentialATCAddress),
    ).to.equal(transferAmount); // check that transfer did happen this time

    // Verify Alice's allowance is 0
    // expect(
    //   await reEncryptAllowance(
    //     this.signers.alice,
    //     this.signers.bob,
    //     this.instance,
    //     this.confidentialATC,
    //     this.confidentialATCAddress,
    //   ),
    // ).to.equal(0);
  });

  it("should not be able to read the allowance if not spender/owner after initialization", async function () {
    const amount = 10_000;

    const inputAlice = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    inputAlice.add64(amount);
    const encryptedAllowanceAmount = await inputAlice.encrypt();

    const tx = await this.confidentialATC
      .connect(this.signers.alice)
      [
        "approve(address,bytes32,bytes)"
      ](this.signers.bob.address, encryptedAllowanceAmount.handles[0], encryptedAllowanceAmount.inputProof);

    await tx.wait();

    const allowanceHandleAlice = await this.confidentialATC.allowance(this.signers.alice, this.signers.bob);

    const { publicKey: publicKeyCarol, privateKey: privateKeyCarol } = await this.instance.generateKeypair();
    const eip712Carol = this.instance.createEIP712(publicKeyCarol, this.confidentialATCAddress);
    const signatureCarol = await this.signers.carol.signTypedData(
      eip712Carol.domain,
      { Reencrypt: eip712Carol.types.Reencrypt },
      eip712Carol.message,
    );

    await expect(
      this.instance.reencrypt(
        allowanceHandleAlice,
        privateKeyCarol,
        publicKeyCarol,
        signatureCarol.replace("0x", ""),
        this.confidentialATCAddress,
        this.signers.carol.address,
      ),
    ).to.be.rejectedWith("User is not authorized to reencrypt this handle!");
  });

  it("should not be able to read the balance if not user after initialization", async function () {
    // Mint is used to initialize the balanceOf(alice)
    const amount = 10_000;
    const tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, amount);
    await tx.wait();

    const balanceHandleAlice = await this.confidentialATC.balanceOf(this.signers.alice);

    const { publicKey: publicKeyBob, privateKey: privateKeyBob } = await this.instance.generateKeypair();
    const eip712Bob = this.instance.createEIP712(publicKeyBob, this.confidentialATCAddress);
    const signatureBob = await this.signers.bob.signTypedData(
      eip712Bob.domain,
      { Reencrypt: eip712Bob.types.Reencrypt },
      eip712Bob.message,
    );

    await expect(
      this.instance.reencrypt(
        balanceHandleAlice,
        privateKeyBob,
        publicKeyBob,
        signatureBob.replace("0x", ""),
        this.confidentialATCAddress,
        this.signers.bob.address,
      ),
    ).to.be.rejectedWith("User is not authorized to reencrypt this handle!");
  });

  it("receiver cannot be null address", async function () {
    const NULL_ADDRESS = "0x0000000000000000000000000000000000000000";
    const createAmount = 100_000;
    const transferAmount = 50_000;
    const tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, createAmount);
    await tx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    await expect(
      this.confidentialATC
        .connect(this.signers.alice)
        [
          "transfer(address,bytes32,bytes)"
        ](NULL_ADDRESS, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof),
    ).to.be.revertedWithCustomError(this.confidentialATC, "ATCInvalidReceiver");
  });

  it("sender who is not allowed cannot transfer using a handle from another account", async function () {
    const createAmount = 100_000;
    const transferAmount = 50_000;
    let tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, createAmount);
    await tx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    tx = await this.confidentialATC
      .connect(this.signers.alice)
      [
        "transfer(address,bytes32,bytes)"
      ](this.signers.carol.address, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);

    await tx.wait();

    const balanceHandleAlice = await this.confidentialATC.balanceOf(this.signers.alice.address);

    await expect(
      this.confidentialATC.connect(this.signers.bob).transfer(this.signers.carol.address, balanceHandleAlice),
    ).to.be.revertedWithCustomError(this.confidentialATC, "TFHESenderNotAllowed");
  });

  it("sender who is not allowed cannot transferFrom using a handle from another account", async function () {
    const createAmount = 100_000;
    const transferAmount = 50_000;

    let tx = await this.confidentialATC.connect(this.signers.alice).create(this.signers.alice, createAmount);
    await tx.wait();

    let input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(createAmount);
    const encryptedAllowanceAmount = await input.encrypt();

    tx = await this.confidentialATC
      .connect(this.signers.alice)
      [
        "approve(address,bytes32,bytes)"
      ](this.signers.carol.address, encryptedAllowanceAmount.handles[0], encryptedAllowanceAmount.inputProof);

    input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.carol.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    tx = await this.confidentialATC
      .connect(this.signers.carol)
      [
        "transferFrom(address,address,bytes32,bytes)"
      ](this.signers.alice.address, this.signers.carol.address, encryptedTransferAmount.handles[0], encryptedTransferAmount.inputProof);

    const allowanceHandleAlice = await this.confidentialATC.allowance(
      this.signers.alice.address,
      this.signers.carol.address,
    );

    await expect(
      this.confidentialATC
        .connect(this.signers.bob)
        .transferFrom(this.signers.alice.address, this.signers.bob.address, allowanceHandleAlice),
    ).to.be.revertedWithCustomError(this.confidentialATC, "TFHESenderNotAllowed");
  });

  it("sender who is not allowed cannot approve using a handle from another account", async function () {
    const amount = 100_000;
    const input = this.instance.createEncryptedInput(this.confidentialATCAddress, this.signers.alice.address);
    input.add64(amount);
    const encryptedAllowanceAmount = await input.encrypt();

    const tx = await this.confidentialATC
      .connect(this.signers.alice)
      [
        "approve(address,bytes32,bytes)"
      ](this.signers.carol.address, encryptedAllowanceAmount.handles[0], encryptedAllowanceAmount.inputProof);

    await tx.wait();

    const allowanceHandleAlice = await this.confidentialATC.allowance(
      this.signers.alice.address,
      this.signers.carol.address,
    );

    await expect(
      this.confidentialATC.connect(this.signers.bob).approve(this.signers.carol.address, allowanceHandleAlice),
    ).to.be.revertedWithCustomError(this.confidentialATC, "TFHESenderNotAllowed");
  });

  it("ConfidentialATCMintable - only owner can create", async function () {
    await expect(
      this.confidentialATC.connect(this.signers.bob).create(this.signers.bob, 1),
    ).to.be.revertedWithCustomError(this.confidentialATC, "OwnableUnauthorizedAccount");
  });
});
