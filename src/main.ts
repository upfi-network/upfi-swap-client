import path = require('path')
import anchor = require('@project-serum/anchor')
import { ASSOCIATED_TOKEN_PROGRAM_ID, Token, TOKEN_PROGRAM_ID } from '@solana/spl-token'
import { UpfiSwapClient } from './upfi-swap-client'

// eslint-disable-next-line @typescript-eslint/no-var-requires
require('dotenv').config({ path: path.join(__dirname, '../.env') })

const USDC_USDT_UPFI_SWAP_INFO_ADDRESS = new anchor.web3.PublicKey('GmfrfDZrcBHTyYKejQfLvb4AL3g4WT1SFqjiMmM6RJTZ')

async function main() {
  const provider = anchor.Provider.env()
  const client = await UpfiSwapClient.loadFromAddress(provider, USDC_USDT_UPFI_SWAP_INFO_ADDRESS)

  // Token rate depends on amount swap
  console.log('UPFI/USDC: ', await client.getPrice(1_000_000, 2, 0))
  console.log('UPFI/USDT: ', await client.getPrice(1_000_000, 2, 1))
  console.log('USDC/USDT: ', await client.getPrice(1_000_000, 0, 1))
  console.log('USDT/USDC: ', await client.getPrice(1_000_000, 1, 0))

  const tokenMintUSDC = client.swapInfo.tokens[0].tokenMint
  const tokenMintUSDT = client.swapInfo.tokens[1].tokenMint
  const tokenMintUPFI = client.swapInfo.tokens[2].tokenMint

  const tokenVaultUSDC = client.swapInfo.tokens[0].tokenVault
  const tokenVaultUSDT = client.swapInfo.tokens[1].tokenVault
  const tokenVaultUPFI = client.swapInfo.tokens[2].tokenVault

  // Get USDC user associated token address
  const src_token_wallet = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMintUSDC,
    provider.wallet.publicKey,
  )

  // Get UPFI user associated token address
  const dest_token_wallet = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    tokenMintUPFI,
    provider.wallet.publicKey,
  )

  const swapAmountIn = 1_000_000 // 1 USDC

  // const minSwapAmountOut = 0 // allow any amountOut, avoid slippage errors
  const minSwapAmountOut = await client.getSwapAmountOut(swapAmountIn, 0, 2)
  console.log('minSwapAmountOut:', minSwapAmountOut)

  // Swap Instruction: USDC -> UPFI
  const swapInstruction = client.swapInstruction(
    (provider.wallet as any).payer,
    swapAmountIn,
    minSwapAmountOut,
    src_token_wallet,
    tokenVaultUSDC,
    tokenVaultUPFI,
    dest_token_wallet,
  )
  const tx = new anchor.web3.Transaction()
  tx.add(swapInstruction)

  const txSignature = await provider.send(tx, [(provider.wallet as any).payer])
  console.log('Transaction signature:', txSignature)
}

main()
