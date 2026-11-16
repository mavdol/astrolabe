// MapQuill SDK, configured for the MapQuill sandbox endpoint.
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const logNormal = (median, spread) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()));

export async function geocode(address) {
  const slowPath = Math.random() < 0.06;

  await sleep(slowPath ? logNormal(420, 0.3) : logNormal(60, 0.3));

  if (Math.random() < 0.03) throw new Error("MapQuill: 429 Too Many Requests");

  return { address, lat: 45.76 + Math.random() / 100, lon: 4.83 + Math.random() / 100, provider: "mapquill" };
}
