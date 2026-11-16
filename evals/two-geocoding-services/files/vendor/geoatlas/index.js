// GeoAtlas SDK, configured for the GeoAtlas sandbox endpoint.
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const logNormal = (median, spread) => median * Math.exp(spread * Math.sqrt(-2 * Math.log(Math.random())) * Math.cos(2 * Math.PI * Math.random()));

export async function geocode(address) {
  await sleep(logNormal(85, 0.35));

  if (Math.random() < 0.004) throw new Error("GeoAtlas: 503 Service Unavailable");

  return { address, lat: 45.76 + Math.random() / 100, lon: 4.83 + Math.random() / 100, provider: "geoatlas" };
}
