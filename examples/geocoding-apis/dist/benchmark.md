# Which geocoding API should replace ours, given latency, match rate and price?

Benchmark `geocoding-apis`, version 1.0.0. Baseline: Geo A.

## Results

### Median latency

Time from scheduled send to full response, successful requests only. The median, in ms; lower is better. Intervals: 95%, by bootstrap, resampling items. Failed attempts are left out: values cover successful attempts only.

| Candidate | Median (ms) | 95% interval | p95 | p99 | max | n | Failures |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Geo A (baseline) | 81.7 | 80.1 to 83.6 | 179.2 | 249.1 | 465.8 | 1000 | 0 |
| Geo B | 58.4 | 56.3 to 60.6 | 207.4 | 342.1 | 1161.3 | 1000 | 0 |

### 95th percentile latency

Same measurement, 95th percentile of the merged samples. The 95th percentile, in ms; lower is better. Intervals: 95%, by bootstrap, resampling items. Failed attempts are left out: values cover successful attempts only.

| Candidate | 95th percentile (ms) | 95% interval | n | Failures |
| --- | ---: | ---: | ---: | ---: |
| Geo A (baseline) | 179 | 173 to 185 | 1000 | 0 |
| Geo B | 207 | 195 to 224 | 1000 | 0 |

### Match rate

Share of addresses located within 50 m of our surveyed position. The share, in %; higher is better. Intervals: 95%, by Student's t. Failed attempts count as zero.

| Candidate | Share (%) | 95% interval | n | Failures |
| --- | ---: | ---: | ---: | ---: |
| Geo A (baseline) | 95 | 94 to 96 | 1000 | 0 |
| Geo B | 96 | 96 to 97 | 1000 | 0 |

### Cost per 1,000 requests

List price per 1,000 requests at the plan tested, read on the public price page (declared). The total, in USD; lower is better. Declared by the author, not computed from raw data.

| Candidate | Total (USD) | 95% interval | n | Failures |
| --- | ---: | ---: | ---: | ---: |
| Geo A (baseline) | 0.5 (declared) | — | 1 | — |
| Geo B | 0.75 (declared) | — | 1 | — |

## Against Geo A

Each candidate against the baseline, Geo A. A verdict is read from the interval of the effect and the smallest difference that matters to the author: better or worse when the interval lies past it, likely when the direction is clear but the size may fall short, equivalent when the interval lies inside it, inconclusive otherwise. These are the claims of the benchmark. Their intervals are widened together for the 4 comparisons (Bonferroni), so they hold jointly.

| Comparison | Effect | Interval | Verdict | Notes |
| --- | ---: | ---: | --- | --- |
| Geo B, median latency | −29% | −32 to −25% (98.75%) | better | successful attempts only |
| Geo B, 95th percentile latency | +16% | +5 to +29% (98.75%) | likely worse | successful attempts only |
| Geo B, match rate | +1.2 points | 0.0 to +2.4 points (98.75%) | likely better |  |
| Geo B, cost per 1,000 requests | +50% | — | worse | declared values |

## Method

- Computed from raw data by astrolabe: Median latency, 95th percentile latency, Match rate. Declared by the author: Cost per 1,000 requests.
- Comparisons: 4 primary, 0 exploratory.
- Observed: session 4 (planned 4); address 1000 (planned 1000).
- Warm-up: 50 untimed requests per session; state: warm.
- Order: candidates alternate within each session.
- Declared conditions: none declared.
- Workload: 1,000 delivery addresses sampled from our own orders, with surveyed coordinates. One address per request, 5 requests per second, open model.

### Candidates

Declared by the author.

**Geo A (baseline)**, version v2

- Configuration: timeout ms 3000; retries 0
- Publication terms: terms of service, 2026-06, read at https://example.com/geo_a/terms on 2026-11-02. Restriction on publishing results: none found
- Variants tried: none other than the one measured
- Service: region eu-west, plan standard, version 2026-09
- Price: per request (variable 0.5, per 1,000 requests); source: public price page, read on 2026-11-02

**Geo B**, version v5

- Configuration: timeout ms 3000; retries 0
- Publication terms: terms of service, 2026-03, read at https://example.com/geo_b/terms on 2026-11-02. Restriction on publishing results: none found
- Variants tried: none other than the one measured
- Service: region eu-central, plan pay as you go, version 2026-10
- Price: per request (variable 0.75, per 1,000 requests); source: public price page, read on 2026-11-02

### Environment

- Client: One VM in eu-west, same for both candidates
- Software: k6 1.3
- Tools: k6

### Limitations

- Two days and one client region; addresses are from one country.
- List prices only; volume discounts were not requested.

---

<sub>results sha256 `c0706f89a5b7` · 2026-11-16 · source https://github.com/example/geocoding-apis · built with astrolabe-bench 0.1.0</sub>
