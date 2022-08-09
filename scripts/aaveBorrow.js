/* eslint-disable no-process-exit */
// yarn hardhat node
// yarn hardhat run scripts/readPrice.js --network localhost
const { ethers, getNamedAccounts } = require("hardhat")
const { getWeth, AMOUNT } = require("./getWeth")
const { networkConfig } = require("../helper-hardhat-config")

async function deposit() {
    await getWeth()
    const { deployer } = await getNamedAccounts()
    const lendingPool = await getLendingPool(deployer)
    const wethTokenAddress = networkConfig[network.config.chainId].wethToken
    await approveErc20(wethTokenAddress, lendingPool.address, AMOUNT, deployer)
    console.log("Depositing WETH...")
    await lendingPool.deposit(wethTokenAddress, AMOUNT, deployer, 0)
    console.log("Deposited...")
    let { availableBorrowsETH, totalDebtETH } = await getBorrowUserData(lendingPool, deployer)

    // get dai/eth pair price from aggregator contract
    const daiPrice = await getDaiPrice()
    // get dai that can be borrowed with eth as collateral
    const amountDaiToBorrow = availableBorrowsETH.toString() * 0.9 * (1 / daiPrice.toNumber())
    const amountDaiToBorrowWei = ethers.utils.parseEther(amountDaiToBorrow.toString())

    // borrow dai from available borrow eth
    await borrow(networkConfig[network.config.chainId].daiToken, lendingPool, amountDaiToBorrowWei, deployer)
    await getBorrowUserData(lendingPool, deployer)
    await repay(networkConfig[network.config.chainId].daiToken, lendingPool, amountDaiToBorrowWei, deployer)
    await getBorrowUserData(lendingPool, deployer)
}

async function repay(daiTokenAddress, lendingPool, amount, account) {
    await approveErc20(daiTokenAddress, lendingPool.address, amount, account)

    const tx = await lendingPool.repay(daiTokenAddress, amount, 1, account)
    await tx.wait(1)
    console.log(`Repaid`)
}

async function borrow(daiTokenAddress, lendingPool, amount, account) {
    const tx = await lendingPool.borrow(daiTokenAddress, amount, 1, 0, account)
    await tx.wait(1)
    console.log(`Borrowed`)
}

async function getDaiPrice() {
    const daiEthPriceFeed = await ethers.getContractAt(
        "AggregatorV3Interface",
        networkConfig[network.config.chainId].daiEthPriceFeed
    )
    const price = (await daiEthPriceFeed.latestRoundData())[1]
    console.log(`The DAI/ETH price is ${price.toString()}`)
    return price
}

async function approveErc20(wethTokenAddress, address, amount, deployer) {
    const iERC20 = await ethers.getContractAt("IERC20", wethTokenAddress, deployer)
    const txResponse = await iERC20.approve(address, amount)
    await txResponse.wait(1)
    console.log(`Approved spender`)
}

async function getLendingPool(account) {
    const lendingPoolAddressesProvider = await ethers.getContractAt(
        "ILendingPoolAddressesProvider",
        networkConfig[network.config.chainId].lendingPoolAddressesProvider,
        account
    )
    const lendingPoolAddress = await lendingPoolAddressesProvider.getLendingPool()
    const lendingPool = await ethers.getContractAt("ILendingPool", lendingPoolAddress, account)
    return lendingPool
}

async function getBorrowUserData(lendingPool, account) {
    const { totalCollateralETH, totalDebtETH, availableBorrowsETH } = await lendingPool.getUserAccountData(account)
    console.log(`You have ${totalCollateralETH} worth of ETH deposited.`)
    console.log(`You have ${totalDebtETH} worth of ETH borrowed.`)
    console.log(`You can borrow ${availableBorrowsETH} worth of ETH.`)
    return { availableBorrowsETH, totalDebtETH }
}

deposit()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error)
        process.exit(1)
    })
