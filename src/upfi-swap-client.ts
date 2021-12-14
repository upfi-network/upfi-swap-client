import anchor = require('@project-serum/anchor')
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { computePrice, computeSwapAmountOut } from './curve-stable-swap'
import * as utils from './utils'

interface Fees {
  adminTradeFee: anchor.BN
  adminDepositFee: anchor.BN
  adminWithdrawFee: anchor.BN
  tradeFee: anchor.BN
  normalizedFee: anchor.BN
}

interface TokenInfo {
  tokenMint: anchor.web3.PublicKey
  tokenVault: anchor.web3.PublicKey
  adminFee: anchor.web3.PublicKey
  balance: anchor.BN
}

interface SwapInfo {
  isInitialized: boolean
  isPaused: boolean
  bump: number
  initialAmpFactor: anchor.BN
  targetAmpFactor: anchor.BN
  startRampTs: anchor.BN
  stopRampTs: anchor.BN
  poolMint: anchor.web3.PublicKey
  futureAdminDeadline: anchor.BN
  futureAdminKey: anchor.web3.PublicKey
  adminKey: anchor.web3.PublicKey
  fees: Fees
  nCoins: anchor.BN
  tokens: TokenInfo[]
}

function convertFeesToBN(fees: Fees) {
  return {
    adminDepositFee: new anchor.BN(fees.adminDepositFee),
    adminWithdrawFee: new anchor.BN(fees.adminWithdrawFee),
    adminTradeFee: new anchor.BN(fees.adminTradeFee),
    normalizedFee: new anchor.BN(fees.normalizedFee),
    tradeFee: new anchor.BN(fees.tradeFee),
  }
}

export class UpfiSwapClient {
  program: anchor.Program

  swapInfoAddress: anchor.web3.PublicKey
  swapInfo: SwapInfo

  constructor(program: anchor.Program, swapInfoAddress: anchor.web3.PublicKey, swapInfo: SwapInfo) {
    this.program = program
    this.swapInfoAddress = swapInfoAddress
    this.swapInfo = swapInfo
    this.swapInfo.fees = convertFeesToBN(this.swapInfo.fees)
  }

  static async loadFromAddress(provider: anchor.Provider, swapInfoAddress: anchor.web3.PublicKey) {
    if (!(await utils.isExistsAccount(provider, swapInfoAddress))) {
      throw new Error('Not exists swap info address.')
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const idl = require('../idl/upfi_swap.json')
    const program = new anchor.Program(idl, idl.metadata.address, provider)
    const swapInfo = await program.account.swapInfo.fetch(swapInfoAddress)

    return new UpfiSwapClient(program, swapInfoAddress, swapInfo)
  }

  swapInstruction(
    swapper: anchor.web3.Keypair,
    amount_in: number | string | anchor.BN,
    min_amount_out: number | string | anchor.BN,
    src_token_wallet: anchor.web3.PublicKey,
    src_token_vault: anchor.web3.PublicKey,
    dest_token_vault: anchor.web3.PublicKey,
    dest_token_wallet: anchor.web3.PublicKey,
  ) {
    const instruction = this.program.instruction.swap(new anchor.BN(amount_in), new anchor.BN(min_amount_out), {
      accounts: {
        swapInfo: this.swapInfoAddress,

        srcTokenWallet: src_token_wallet,
        srcTokenVault: src_token_vault,
        destTokenVault: dest_token_vault,
        destTokenWallet: dest_token_wallet,

        swapper: swapper.publicKey,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [swapper],
    })
    return instruction
  }

  async fetchVaultAmounts() {
    const swapInfo = await this.program.account.swapInfo.fetch(this.swapInfoAddress)
    const amounts = []

    for (let idx = 0; idx < this.swapInfo.nCoins.toNumber(); idx++) {
      amounts.push(new anchor.BN(swapInfo.tokens[idx].balance))
    }
    return amounts
  }

  async getPrice(swapAmount: number, i: number, j: number) {
    const amountIn = new anchor.BN(swapAmount)
    const curAmounts = await this.fetchVaultAmounts()
    return computePrice(this.swapInfo.targetAmpFactor, amountIn, i, j, curAmounts, this.swapInfo.fees.tradeFee)
  }

  async getSwapAmountOut(swapAmount: number, i: number, j: number) {
    const amountIn = new anchor.BN(swapAmount)
    const curAmounts = await this.fetchVaultAmounts()
    return computeSwapAmountOut(this.swapInfo.targetAmpFactor, amountIn, i, j, curAmounts, this.swapInfo.fees.tradeFee)
  }
}
