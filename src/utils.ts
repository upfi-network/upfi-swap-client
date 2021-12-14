import anchor = require('@project-serum/anchor')

export async function isExistsAccount(provider: anchor.Provider, pubkey: anchor.web3.PublicKey) {
  return await provider.connection.getAccountInfo(pubkey)
}
