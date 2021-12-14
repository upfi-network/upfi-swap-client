import anchor = require('@project-serum/anchor')

const ZERO = new anchor.BN(0)
const ONE = new anchor.BN(1)
const FEE_DENOMINATOR = new anchor.BN(100_000)

/**
 * Compute the StableSwap invariant
 * @param amp Amplification coefficient (A)
 * @param xp Swap balance of tokens
 * Ref: https://github.com/curvefi/curve-contract/blob/7116b4a261580813ef057887c5009e22473ddb7d/tests/simulation.py#L31
 */
export function computeD(amp = ZERO, xp = [ZERO, ZERO]) {
  /*
  D invariant calculation in non-overflowing integer operations iteratively
  A * sum(x_i) * n**n + D = A * D * n**n + D**(n+1) / (n**n * prod(x_i))
  Converging solution:
  D[j+1] = (A * n**n * sum(x_i) - D[j]**(n+1) / (n**n prod(x_i))) / (A * n**n - 1)
  */

  const n_coins = new anchor.BN(xp.length)
  const Ann = amp.mul(n_coins) // A*n^n
  const S = xp.reduce((prev, cur) => prev.add(cur), ZERO) // sum(x_i), a.k.a S
  if (S.isZero()) {
    return S
  }

  let dPrev = ZERO
  let d = S
  while (d.sub(dPrev).abs().gt(ONE)) {
    dPrev = d
    let dP = d

    for (const x of xp) {
      dP = dP.mul(d).div(x.mul(n_coins).add(ONE)) //+1 is to prevent /0
    }

    // d = (ann * sum_x + d_prod * n_coins) * d / ((ann - 1) * d + (n_coins + 1) * d_prod)
    const numerator = d.mul(Ann.mul(S).add(dP.mul(n_coins)))
    const denominator = d.mul(Ann.sub(ONE)).add(dP.mul(n_coins.add(ONE)))
    d = numerator.div(denominator)
  }

  return d
}

/**
 * Compute Y amount in respect to X on the StableSwap curve
 * @param amp Amplification coefficient (A)
 * @param x The quantity of underlying asset
 * Ref: https://github.com/curvefi/curve-contract/blob/7116b4a261580813ef057887c5009e22473ddb7d/tests/simulation.py#L55
 */
export function computeY(amp = ZERO, i = 0, j = 0, x = ZERO, xp = [ZERO, ZERO]) {
  /*
  Calculate x[j] if one makes x[i] = x
  Done by solving quadratic equation iteratively.
  x_1**2 + x1 * (sum' - (A*n**n - 1) * D / (A * n**n)) = D ** (n + 1) / (n ** (2 * n) * prod' * A)
  x_1**2 + b*x_1 = c
  x_1 = (x_1**2 + c) / (2*x_1 + b)
  */
  const n_coins = new anchor.BN(xp.length)
  const ann = amp.mul(n_coins) // A*n^n

  const d = computeD(amp, xp)
  let c = d
  let sum_x_new = ZERO

  for (let idx = 0; idx < xp.length; idx++) {
    if (idx == i) {
      sum_x_new = sum_x_new.add(x)
      c = c.mul(d).div(x.mul(n_coins))
    } else if (idx != j) {
      sum_x_new = sum_x_new.add(xp[idx])
      c = c.mul(d).div(xp[idx].mul(n_coins))
    } else {
      continue
    }
  }

  // c =  D ** (n + 1) / (n ** (2 * n) * prod' * A)
  c = c.mul(d).div(ann.mul(n_coins))
  // b = sum' - (A*n**n - 1) * D / (A * n**n) = sum' + D / (A * n**n) - D
  const b = d.div(ann).add(sum_x_new).sub(d)

  let yPrev = ZERO
  let y = d
  while (y.sub(yPrev).abs().gt(ONE)) {
    yPrev = y
    y = y.mul(y).add(c).div(new anchor.BN(2).mul(y).add(b))
  }

  return y
}

/**
 * Compute Y amount in respect to D on the StableSwap curve
 * @param amp Amplification coefficient (A)
 * @param xp Swap balance of tokens
 * Ref: https://github.com/curvefi/curve-contract/blob/7116b4a261580813ef057887c5009e22473ddb7d/tests/simulation.py#L31
 */
export function computeYD(amp = ZERO, i = 0, xp = [ZERO, ZERO], d = ZERO) {
  /*
  Calculate x[j] if one makes x[i] = x
  Done by solving quadratic equation iteratively.
  x_1**2 + x1 * (sum' - (A*n**n - 1) * D / (A * n**n)) = D ** (n + 1) / (n ** (2 * n) * prod' * A)
  x_1**2 + b*x_1 = c
  x_1 = (x_1**2 + c) / (2*x_1 + b)
  */
  const n_coins = new anchor.BN(xp.length)
  const ann = amp.mul(n_coins) // A*n^n

  let c = d
  let sum_x_new = ZERO

  for (let idx = 0; idx < xp.length; idx++) {
    if (idx != i) {
      sum_x_new = sum_x_new.add(xp[idx])
      c = c.mul(d).div(xp[idx].mul(n_coins))
    } else {
      continue
    }
  }

  // c =  D ** (n + 1) / (n ** (2 * n) * prod' * A)
  c = c.mul(d).div(ann.mul(n_coins))
  // b = sum' - (A*n**n - 1) * D / (A * n**n) = sum' + D / (A * n**n) - D
  const b = d.div(ann).add(sum_x_new).sub(d)

  let yPrev = ZERO
  let y = d
  while (y.sub(yPrev).abs().gt(ONE)) {
    yPrev = y
    y = y.mul(y).add(c).div(new anchor.BN(2).mul(y).add(b))
  }

  return y
}

export function computeSwapAmountOut(amp = ZERO, swap_amount = ZERO, i = 0, j = 0, xp = [ZERO, ZERO], tradeFee = ZERO) {
  const x = xp[i].add(swap_amount)
  const y = computeY(amp, i, j, x, xp)
  const dy = xp[j].sub(y)
  const dy_fee = dy.mul(tradeFee).div(FEE_DENOMINATOR)
  return dy.sub(dy_fee).toNumber()
}

export function computePrice(amp = ZERO, swap_amount = ZERO, i = 0, j = 0, xp = [ZERO, ZERO], tradeFee = ZERO) {
  const x = xp[i].add(swap_amount)
  const y = computeY(amp, i, j, x, xp)
  const dy = xp[j].sub(y)
  const dy_fee = dy.mul(tradeFee).div(FEE_DENOMINATOR)
  return dy.sub(dy_fee).toNumber() / swap_amount.toNumber()
}
