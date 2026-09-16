/**
 * Backer explanatory market model. Synthetic choices; no accuracy or revenue claim.
 * 96 participants, 48 rounds, two binary-token books and prefunded inventories.
 * One initial YES + NO pair is backed by one locked unit. No tokens are minted,
 * redeemed or shorted during a run. Orders match at resting price with price-time
 * priority; unfilled orders expire after three rounds. Both trading parties pay
 * the scenario rate on executed notional. Volume counts each match exactly once.
 * Scenario comparisons share all keyed random draws and initial participants.
 */
const clamp = (x, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const round = (x, places = 8) => Number(x.toFixed(places));
const sum = (rows, getter) => rows.reduce((v, row) => v + getter(row), 0);

function random(seed, ...keys) {
  let x = (Number(seed) >>> 0) ^ 0x9e3779b9;
  for (const key of keys) {
    x = Math.imul(x ^ (key + 0x6d2b79f5), 0x85ebca6b);
    x ^= x >>> 13;
  }
  x = Math.imul(x ^ (x >>> 16), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

export const SCENARIOS = Object.freeze({
  baseline: { label: 'Baseline', feeRate: 0.01, participation: 0.72, shock: 0 },
  thin: { label: 'Thin liquidity', feeRate: 0.01, participation: 0.24, shock: 0 },
  fees: { label: 'Higher fees', feeRate: 0.035, participation: 0.72, shock: 0 },
  shock: { label: 'Attention shock', feeRate: 0.01, participation: 0.72, shock: 0.16 },
});

export function simulateMarket(scenario = 'baseline', seed = 41) {
  if (!(scenario in SCENARIOS)) throw new RangeError('Unknown scenario');
  if (!Number.isInteger(seed) || !Number.isFinite(seed)) throw new TypeError('Seed must be a finite integer');
  const config = SCENARIOS[scenario];
  const agents = Array.from({ length: 96 }, (_, id) => {
    const pairs = 25 + Math.floor(random(seed, id, 2) * 16);
    return {
      id,
      cash: 160 + random(seed, id, 1) * 160,
      yes: pairs,
      no: pairs,
      reservedCash: 0,
      reservedYes: 0,
      reservedNo: 0,
      bias: (random(seed, id, 3) - 0.5) * 0.52,
      risk: 0.25 + random(seed, id, 4) * 0.7,
      responsiveness: 0.5 + random(seed, id, 5) * 0.5,
      belief: clamp(0.5 + (random(seed, id, 3) - 0.5) * 0.52, 0.04, 0.96),
    };
  });
  const initialCash = sum(agents, a => a.cash);
  const initialYes = sum(agents, a => a.yes);
  const initialNo = sum(agents, a => a.no);
  const population = agents.map(a => ({ id: a.id, cash: round(a.cash), yes: a.yes, no: a.no, bias: round(a.bias), risk: round(a.risk) }));
  const books = { yes: { buy: [], sell: [] }, no: { buy: [], sell: [] } };
  const ledger = [];
  const series = [{ t: 0, price: 0.5, volume: 0 }];
  const tradedNotional = agents.map(() => 0);
  const activeIds = new Set();
  let sequence = 0;
  let orders = 0;
  let requestedQuantity = 0;
  let executedQuantity = 0;
  let volume = 0;
  let fees = 0;
  let spreadTotal = 0;
  let spreadSamples = 0;
  let lastPrice = 0.5;
  let noNegativeBalances = true;

  function release(order, amount = order.remaining) {
    const owner = agents[order.agent];
    if (order.side === 'buy') owner.reservedCash -= amount * order.price * (1 + config.feeRate);
    else owner[order.token === 'yes' ? 'reservedYes' : 'reservedNo'] -= amount;
  }

  function recordHealth() {
    noNegativeBalances &&= agents.every(a => a.cash >= -1e-7 && a.yes >= 0 && a.no >= 0
      && a.cash - a.reservedCash >= -1e-7 && a.yes - a.reservedYes >= 0 && a.no - a.reservedNo >= 0);
  }

  function submit(agent, token, side, price, wanted, t) {
    const reserveKey = token === 'yes' ? 'reservedYes' : 'reservedNo';
    const available = side === 'buy'
      ? Math.floor((agent.cash - agent.reservedCash + 1e-9) / (price * (1 + config.feeRate)))
      : agent[token] - agent[reserveKey];
    const quantity = Math.max(0, Math.min(wanted, available));
    if (!quantity) return;
    const order = { id: ++sequence, agent: agent.id, token, side, price, quantity, remaining: quantity, t };
    if (side === 'buy') agent.reservedCash += quantity * price * (1 + config.feeRate);
    else agent[reserveKey] += quantity;
    orders += 1;
    requestedQuantity += quantity;
    activeIds.add(agent.id);
    const opposing = books[token][side === 'buy' ? 'sell' : 'buy'];

    while (order.remaining > 0) {
      const index = opposing.findIndex(maker => maker.agent !== agent.id
        && (side === 'buy' ? maker.price <= price : maker.price >= price));
      if (index < 0) break;
      const maker = opposing[index];
      const q = Math.min(order.remaining, maker.remaining);
      const executionPrice = maker.price;
      const buyer = side === 'buy' ? agent : agents[maker.agent];
      const seller = side === 'sell' ? agent : agents[maker.agent];
      const notional = q * executionPrice;
      const partyFee = notional * config.feeRate;
      release(order, q);
      release(maker, q);
      buyer.cash -= notional + partyFee;
      seller.cash += notional - partyFee;
      buyer[token] += q;
      seller[token] -= q;
      fees += 2 * partyFee;
      volume += notional;
      executedQuantity += q;
      tradedNotional[buyer.id] += notional;
      tradedNotional[seller.id] += notional;
      order.remaining -= q;
      maker.remaining -= q;
      lastPrice = token === 'yes' ? executionPrice : 1 - executionPrice;
      ledger.push({ t, token, quantity: q, price: executionPrice, buyer: buyer.id, seller: seller.id,
        makerOrder: maker.id, takerOrder: order.id, buyerFee: round(partyFee), sellerFee: round(partyFee) });
      if (!maker.remaining) opposing.splice(index, 1);
    }
    if (order.remaining) {
      const own = books[token][side];
      own.push(order);
      own.sort((a, b) => (side === 'buy' ? b.price - a.price : a.price - b.price) || a.id - b.id);
    }
    recordHealth();
  }

  for (let t = 1; t <= 48; t++) {
    for (const book of Object.values(books)) {
      for (const side of ['buy', 'sell']) {
        book[side] = book[side].filter(order => {
          if (t - order.t < 3) return true;
          release(order);
          return false;
        });
      }
    }
    // The shock is a shared information change, not a fabricated resolved outcome.
    const commonSignal = 0.5 + Math.sin(t / 8) * 0.018 + (t >= 20 ? config.shock : 0);
    const schedule = [...agents].sort((a, b) => random(seed, t, a.id, 12) - random(seed, t, b.id, 12));
    for (const agent of schedule) {
      agent.belief = clamp(agent.belief * 0.82
        + (commonSignal + agent.bias + (random(seed, t, agent.id, 13) - 0.5) * 0.08) * 0.18, 0.03, 0.97);
      if (random(seed, t, agent.id, 14) > config.participation * agent.responsiveness) continue;
      const token = random(seed, t, agent.id, 15) > 0.5 ? 'yes' : 'no';
      const probability = token === 'yes' ? agent.belief : 1 - agent.belief;
      const book = books[token];
      const ask = book.sell[0]?.price ?? clamp(probability + 0.04, 0.02, 0.98);
      const bid = book.buy[0]?.price ?? clamp(probability - 0.04, 0.02, 0.98);
      const riskCost = (1 - agent.risk) * 0.018;
      const buyEdge = probability - ask * (1 + config.feeRate) - riskCost;
      const sellEdge = bid * (1 - config.feeRate) - probability - riskCost;
      let side;
      let limit;
      if (buyEdge > 0.008 && buyEdge >= sellEdge) {
        side = 'buy';
        limit = ask;
      } else if (sellEdge > 0.008) {
        side = 'sell';
        limit = bid;
      } else {
        side = random(seed, t, agent.id, 16) > 0.5 ? 'buy' : 'sell';
        // Reservation prices include fees; higher costs change willingness to trade.
        limit = side === 'buy' ? (probability - riskCost - 0.008) / (1 + config.feeRate)
          : (probability + riskCost + 0.008) / (1 - config.feeRate);
      }
      limit = round(clamp(limit, 0.02, 0.98), 3);
      const wanted = 2 + Math.floor(random(seed, t, agent.id, 17) * (4 + agent.risk * 7));
      submit(agent, token, side, limit, wanted, t);
    }
    const { buy, sell } = books.yes;
    const bid = buy[0]?.price;
    const ask = sell[0]?.price;
    if (bid !== undefined && ask !== undefined && ask >= bid) {
      spreadTotal += ask - bid;
      spreadSamples++;
    }
    series.push({ t, price: round(lastPrice, 4), volume: round(volume, 2) });
  }
  const finalCash = sum(agents, a => a.cash);
  const finalYes = sum(agents, a => a.yes);
  const finalNo = sum(agents, a => a.no);
  const totalPartyNotional = sum(tradedNotional, v => v);
  const concentration = totalPartyNotional ? sum([...tradedNotional].sort((a, b) => b - a).slice(0, 10), v => v) / totalPartyNotional : 0;
  const cashError = Math.abs(initialCash - finalCash - fees);
  return {
    scenario, seed, synthetic: true, label: config.label,
    agents: agents.length, rounds: 48, population,
    feeRate: config.feeRate, participation: config.participation,
    // Fill rate is share-weighted: each match fills a buyer and seller quantity.
    series, fillRate: round(requestedQuantity ? 2 * executedQuantity / requestedQuantity : 0),
    spread: spreadSamples ? round(spreadTotal / spreadSamples) : null,
    spreadSamples, volume: round(volume, 2), fees: round(fees, 2), concentration: round(concentration),
    orders, fills: ledger.length, requestedQuantity, executedQuantity, activeParticipants: activeIds.size,
    ledger, collateral: initialYes,
    accounting: { initialCash: round(initialCash), finalCash: round(finalCash), collectedFees: round(fees), cashError,
      initialYes, finalYes, initialNo, finalNo },
    invariants: { cashConserved: cashError < 1e-6, inventoryConserved: initialYes === finalYes && initialNo === finalNo, noNegativeBalances },
    semantics: {
      price: 'Last executed YES price, or one minus last NO price; a synthetic market mark, not accuracy.',
      volume: 'Executed notional counted once per matched trade.',
      fillRate: 'Twice matched quantity divided by total submitted quantity (both order sides).',
      spread: 'Mean observed two-sided YES quoted spread; rounds without two sides are excluded.',
      concentration: 'Top 10 participants share of buyer-plus-seller traded notional.',
      fees: 'Both parties pay the stated rate on executed notional. Synthetic credits only.',
    },
  };
}

function finiteRange(name, value, min, max = Infinity) {
  if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`${name} is out of range`);
  return value;
}

/**
 * Effective feeRate is total collected fees / once-counted matched volume.
 * Shares allocate gross fees; costRate applies to volume. Net may be negative.
 * This arithmetic scenario holds supplied volume constant, not demand elasticity.
 */
export function economics({ volume = 1_000_000, feeRate = 0.02, creatorShare = 0.2, liquidityShare = 0.15, costRate = 0.003 } = {}) {
  finiteRange('volume', volume, 0);
  for (const [name, value] of Object.entries({ feeRate, creatorShare, liquidityShare, costRate })) finiteRange(name, value, 0, 1);
  if (creatorShare + liquidityShare > 1) throw new RangeError('Fee allocations cannot exceed gross fees');
  const grossFees = volume * feeRate;
  const creatorRevenue = grossFees * creatorShare;
  const liquidityRevenue = grossFees * liquidityShare;
  const platformGross = grossFees - creatorRevenue - liquidityRevenue;
  const operatingCosts = volume * costRate;
  const retainedRevenue = platformGross - operatingCosts;
  return { volume, feeRate, creatorShare, liquidityShare, costRate,
    grossFees, creatorRevenue, liquidityRevenue, platformGross, operatingCosts, retainedRevenue,
    netMarginOnVolume: volume ? retainedRevenue / volume : 0 };
}

/** Alternative exits for a single YES position. Per-side fees apply to traded
 * notional. Settlement pays outcome × quantity and has no exit trade/fee. Losses
 * remain visible; redemption is neither creator revenue nor exchange revenue.
 */
export function binaryPayoff({ quantity = 100, entry = 0.4, exit = 0.65, outcome = 1, mode = 'exit', feeRate = 0.01 } = {}) {
  finiteRange('quantity', quantity, 0);
  finiteRange('entry', entry, 0, 1);
  finiteRange('exit', exit, 0, 1);
  finiteRange('feeRate', feeRate, 0, 1);
  if (!['exit', 'trade', 'settlement'].includes(mode)) throw new RangeError('Mode must be exit or settlement');
  if (![0, 1].includes(outcome)) throw new RangeError('Outcome must be 0 or 1');
  const settlement = mode === 'settlement';
  const entryNotional = quantity * entry;
  const entryFee = entryNotional * feeRate;
  const grossProceeds = quantity * (settlement ? outcome : exit);
  const exitFee = settlement ? 0 : grossProceeds * feeRate;
  const totalFees = entryFee + exitFee;
  const initialCost = entryNotional + entryFee;
  const netProceeds = grossProceeds - exitFee;
  const netPnl = netProceeds - initialCost;
  return { quantity, entry, exit, outcome, mode: settlement ? 'settlement' : 'exit', feeRate,
    entryNotional, entryFee, exitFee, totalFees, initialCost, grossProceeds, netProceeds,
    grossPnl: grossProceeds - entryNotional, netPnl, roiPercent: initialCost ? netPnl / initialCost * 100 : null };
}
