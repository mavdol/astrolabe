// The same work for every runtime: build records, serialize them, parse them back, sort and sum.
const RECORD_COUNT = 200_000;

let state = 42;

const nextRandom = () => {
  state = (Math.imul(state, 1103515245) + 12345) >>> 0;

  return state / 4294967296;
};

const records = Array.from({ length: RECORD_COUNT }, (_, index) => ({
  id: index,
  name: `item-${index}`,
  price: Math.round(nextRandom() * 10000) / 100,
  tags: ["a", "b", "c"].filter(() => nextRandom() < 0.5),
}));

const parsed = JSON.parse(JSON.stringify(records));

parsed.sort((first, second) => first.price - second.price || first.id - second.id);

const total = parsed.reduce((sum, record) => sum + record.price * record.tags.length, 0);

if (!Number.isFinite(total)) process.exit(1);
