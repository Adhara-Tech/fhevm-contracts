import { expect } from "chai";
import { ethers } from "hardhat";

import { awaitAllDecryptionResults } from "../asyncDecrypt";
import { createInstance } from "../instance";
import { getSigners, initSigners } from "../signers";
import { reEncryptBalance } from "./ConfidentialATC.fixture";
import { deployATCAndConfidentialATCWrappedFixture } from "./ConfidentialATCWrapped.fixture";

describe("ConfidentialATCWrapped using ATC with 6 decimals", function () {
  before(async function () {
    await initSigners();
    this.signers = await getSigners();
    this.instance = await createInstance();
  });

  beforeEach(async function () {
    const [atc, confidentialATCWrapped] = await deployATCAndConfidentialATCWrappedFixture(
      this.signers.alice,
      "Asset Token",
      "USD"
    );

    this.atc = atc;
    this.confidentialATCWrapped = confidentialATCWrapped;
    this.atcContractAddress = await atc.getAddress();
    this.confidentialATCWrappedAddress = await confidentialATCWrapped.getAddress();
  });

  it("name/symbol are automatically set", async function () {
    expect(await this.confidentialATCWrapped.name()).to.eq("Confidential Asset Token");
    expect(await this.confidentialATCWrapped.symbol()).to.eq("USDc");
  });

  it("can wrap", async function () {
    const fromAccount = "alice"
    const amountToWrap = ethers.parseUnits("100000", 6);
    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    expect(await this.atc.getAvailableBalanceOf(fromAccount)).to.equal(amountToWrap);

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    expect(await this.atc.getAvailableBalanceOf(fromAccount)).to.equal(0);

    // Check encrypted balance
    expect(
      await reEncryptBalance(
        this.signers.alice,
        fromAccount,
        this.instance,
        this.confidentialATCWrapped,
        this.confidentialATCWrappedAddress,
      ),
    ).to.equal(amountToWrap);
  });

  it("can unwrap", async function () {
    const fromAccount = "alice";
    const amountToWrap = ethers.parseUnits("10000", 6);
    const amountToUnwrap = ethers.parseUnits("5000", 6);

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).unwrap("operationId", fromAccount, this.signers.alice.address, amountToUnwrap);
    await tx.wait();

    await awaitAllDecryptionResults();

    expect(await this.atc.getAvailableBalanceOf(fromAccount)).to.equal(amountToUnwrap);

    expect(
      await reEncryptBalance(
        this.signers.alice,
        fromAccount,
        this.instance,
        this.confidentialATCWrapped,
        this.confidentialATCWrappedAddress,
      ),
    ).to.equal(amountToWrap-amountToUnwrap);
  });

  it("cannot transfer after unwrap has been called but decryption has not occurred", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const amountToWrap = ethers.parseUnits("10000", 6);
    const amountToUnwrap = ethers.parseUnits("5000", 6);
    const transferAmount = ethers.parseUnits("3000", 6);

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).unwrap("operationId", fromAccount, this.signers.alice.address, amountToUnwrap);
    await tx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCWrappedAddress, this.signers.alice.address);
    input.add64(transferAmount);
    const encryptedTransferAmount = await input.encrypt();

    await expect(this.confidentialATCWrapped.connect(this.signers.alice)[
      "transfer(string,string,address,string,address,bytes32,bytes)"
      ](
      "operationId",
      fromAccount,
      this.signers.alice.address,
      toAccount,
      this.signers.bob.address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof
    )).to.be.revertedWithCustomError(this.confidentialATCWrapped, "RestrictedAccount");
  });

  it("cannot create hold after unwrap has been called but decryption has not occurred", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const amountToWrap = ethers.parseUnits("10000", 6);
    const amountToUnwrap = ethers.parseUnits("5000", 6);
    const holdAmount = ethers.parseUnits("3000", 6);

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).unwrap("operationId", fromAccount, this.signers.alice.address, amountToUnwrap);
    await tx.wait();

    const input = this.instance.createEncryptedInput(this.confidentialATCWrappedAddress, this.signers.alice.address);
    input.add64(holdAmount);
    const encryptedHoldAmount = await input.encrypt();

    await expect(this.confidentialATCWrapped.connect(this.signers.alice)[
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
    )).to.be.revertedWithCustomError(this.confidentialATCWrapped, "RestrictedAccount");
  });

  it("cannot call twice unwrap before decryption", async function () {
    const fromAccount = "alice";
    const amountToWrap = ethers.parseUnits("10000", 6);
    const amountToUnwrap = ethers.parseUnits("5000", 6);

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).unwrap("operationId", fromAccount, this.signers.alice.address, amountToUnwrap);
    await tx.wait();

    await expect(
      this.confidentialATCWrapped.connect(this.signers.alice).unwrap("operationId", fromAccount, this.signers.alice.address, amountToUnwrap),
    ).to.be.revertedWithCustomError(this.confidentialATCWrapped, "RestrictedAccount");
  });

  it("cannot unwrap more than balance", async function () {
    const fromAccount = "alice";
    const amountToWrap = ethers.parseUnits("10000", 6);
    const amountToUnwrap = amountToWrap + BigInt("1");

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    tx = await this.confidentialATCWrapped.wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    tx = await this.confidentialATCWrapped.unwrap("operationId", fromAccount, this.signers.alice.address, amountToUnwrap);
    await tx.wait();

    await awaitAllDecryptionResults();

    expect(await this.atc.getAvailableBalanceOf("atc-wrapper-account")).to.equal(amountToWrap);
    expect(
      await reEncryptBalance(
        this.signers.alice,
        fromAccount,
        this.instance,
        this.confidentialATCWrapped,
        this.confidentialATCWrappedAddress,
      ),
    ).to.equal(amountToWrap);
  });

  it("transfers work outside of decryption period", async function () {
    const fromAccount = "alice";
    const toAccount = "bob"
    const amountToWrap = ethers.parseUnits("10000", 6);
    const amountToUnwrap = ethers.parseUnits("2000", 6);

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    tx = await this.confidentialATCWrapped.wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap);
    await tx.wait();

    let transfer1Amount = ethers.parseUnits("3000", 6);
    let input = this.instance.createEncryptedInput(this.confidentialATCWrappedAddress, this.signers.alice.address);
    input.add64(transfer1Amount);
    let encryptedTransferAmount = await input.encrypt();

    await this.confidentialATCWrapped.connect(this.signers.alice)[
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

    tx = await this.confidentialATCWrapped.unwrap("operationId", toAccount, this.signers.bob.address, amountToUnwrap);
    await tx.wait();

    await awaitAllDecryptionResults();

    let transfer2Amount = ethers.parseUnits("1000", 6);
    input = this.instance.createEncryptedInput(this.confidentialATCWrappedAddress, this.signers.bob.address);
    input.add64(transfer2Amount);
    encryptedTransferAmount = await input.encrypt();

    await this.confidentialATCWrapped.connect(this.signers.bob)[
      "transfer(string,string,address,string,address,bytes32,bytes)"
      ](
      "operationId",
      toAccount,
      this.signers.bob.address,
      fromAccount,
      this.signers.alice.address,
      encryptedTransferAmount.handles[0],
      encryptedTransferAmount.inputProof
    );

    expect(
      await reEncryptBalance(
        this.signers.alice,
        fromAccount,
        this.instance,
        this.confidentialATCWrapped,
        this.confidentialATCWrappedAddress,
      ),
    ).to.equal(amountToWrap - transfer1Amount + transfer2Amount);
    expect(
      await reEncryptBalance(
        this.signers.bob,
        toAccount,
        this.instance,
        this.confidentialATCWrapped,
        this.confidentialATCWrappedAddress,
      ),
    ).to.equal(transfer1Amount - amountToUnwrap - transfer2Amount);
  });

  it("amount > 2**64 cannot be wrapped", async function () {
    const fromAccount = "alice";
    const toAccount = "bob";
    const amountToWrap = BigInt(2 ** 64);

    let tx = await this.atc.connect(this.signers.alice).create("operationId", fromAccount, amountToWrap, "");
    await tx.wait();

    // Verify 2**64 - 1 is fine.
    tx = await this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap - BigInt(1));
    await tx.wait();

    tx = await this.confidentialATCWrapped.connect(this.signers.alice).unwrap("operationId", fromAccount, this.signers.alice.address, amountToWrap  - BigInt(1));
    await tx.wait();

    await awaitAllDecryptionResults();

    // Verify 2**64 is not fine
    await expect(
      this.confidentialATCWrapped.connect(this.signers.alice).wrap("operationId", fromAccount, this.signers.alice.address, amountToWrap),
    ).to.be.revertedWithCustomError(this.confidentialATCWrapped, "AmountTooHigh");
  });

  it("only gateway can call callback functions", async function () {
    await expect(
      this.confidentialATCWrapped.connect(this.signers.alice).callbackUnwrap(1, false)
    ).to.be.reverted;
  });
});

