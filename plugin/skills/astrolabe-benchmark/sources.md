# Sources

Where the rules of this skill come from. Read it only when the user asks why a rule exists, where it comes from, or questions a default: name the source and give its link, say how far it supports the rule, and keep to what is listed here. Never cite a source from memory as if it backed a rule.

Each source lists the rules it backs, by the ids used in the rule tables of the other files. A source was read in full unless it says otherwise. The last section lists what is our own decision, with no outside source.

## Contents

- Benchmarking practice
- Time, load and latency
- Memory and energy
- Statistics and evaluations
- Judges and raters
- Usability and feature comparisons
- Cost
- Publishing benchmark results
- Charts and perception
- Colour and accessibility
- Titles, text and tables
- Exports
- Our own decisions

## Benchmarking practice

- Heiser, *Systems Benchmarking Crimes*. [page](https://gernot-heiser.org/benchmarking-crimes.html). F4–F9, F11, S1, S3, S5, S6, T1, T5, T9–T11, R1–R3, Q5, Q9, D4, D5
- Jain, *Common Mistakes and How to Avoid Them*, slides from *The Art of Computer Systems Performance Analysis*. [PDF](https://cs.uwaterloo.ca/~brecht/courses/Perf-Eval-Shared/readings/f20/raj-jain-common-mistakes.pdf). F1–F3, F5, F11, F13, S6, D8
- Kalibera & Jones, *Rigorous Benchmarking in Reasonable Time*, ISMM 2013. [DOI](https://doi.org/10.1145/2464157.2464160), [open copy](https://kar.kent.ac.uk/id/document/3127886). S1, S3, S4, S7, V55; the warm-up and run-count defaults
- Hoefler & Belli, *Scientific Benchmarking of Parallel Computing Systems*, SC15. [DOI](https://doi.org/10.1145/2807591.2807644). F11, S1, S6, S7, S10, D4, D5, D9–D11
- Blackburn et al., *Wake Up and Smell the Coffee*, Communications of the ACM 2008. [DOI](https://doi.org/10.1145/1378704.1378723); Bornholt's [summary](https://cs.utexas.edu/~bornholt/post/performance-evaluation.html). F13, R10, R11, D12
- Mytkowicz et al., *Producing Wrong Data Without Doing Anything Obviously Wrong!*, ASPLOS 2009. [DOI](https://doi.org/10.1145/1508244.1508275). T5 (abstract and introduction)
- Bailey, *Misleading Performance Claims in Parallel Computations*. [PDF](https://www.osti.gov/servlets/purl/964410). T10
- Gregg, *Benchmarking Checklist*. [post](https://brendangregg.com/blog/2018-06-30/benchmarking-checklist.html); *Active Benchmarking*. [page](https://www.brendangregg.com/activebenchmarking.html). F8, F10, S7, T8, R3, R7, Q5
- Papadopoulos et al., *Methodological Principles for Reproducible Performance Evaluation in Cloud Computing*, SPEC Research Group 2019. [technical report](https://research.spec.org/fileadmin/user_upload/documents/rg_cloud/endorsed_publications/SPEC_RG_2019_Methodological_Principles_for_Reproducible_Performance_Evaluation_in_Cloud_Computing.pdf). F15, F16, C7, D5, D9, D10
- Reuel et al., *BetterBench*, NeurIPS 2024. [paper](https://arxiv.org/abs/2411.12990). F12, F16, F17, D11 (main text and checklist)
- VUSec, *Threats to Validity in Security Research*. [page](https://vusec.net/threats-to-validity-in-security-research). D8
- van der Kouwe et al., *SoK: Benchmarking Flaws in Systems Security*, EuroS&P 2019. [abstract](https://trustworthy.systems/publications/abstracts/vanderKouwe_HABG_19.abstract). Background: about five benchmarking flaws per paper in top security venues

## Time, load and latency

- Tene, on coordinated omission and on merging histograms: [thread 1](https://groups.google.com/g/mechanical-sympathy/c/icNZJejUHfE/m/BfDekfBEs_sJ), [thread 2](https://groups.google.com/g/mechanical-sympathy/c/gfTGw580IrU). T6, T7
- wrk2. [README](https://github.com/giltene/wrk2). T6, T7, T12
- hyperfine. [README](https://github.com/sharkdp/hyperfine). T1, T12; at least 10 runs by default
- Zuplo, *How Not to Load Test an API*. [post](https://zuplo.com/blog/how-not-to-load-test-an-api). T8

## Memory and energy

- Semgrep, *Upgrading Semgrep from OCaml 4 to OCaml 5*. [post](https://semgrep.dev/blog/2025/upgrading-semgrep-from-ocaml-4-to-ocaml-5). R8, R9
- Vitess, memory measurement in a pull request. [PR](https://github.com/vitessio/vitess/pull/8804). R8
- Oliveira, *Throughput per Megabyte: A Pilot Benchmark of Language-Stack Efficiency for Self-Hosted HTTP Services on a Raspberry Pi*, 2026. [paper](https://arxiv.org/abs/2609.11932). R9
- Raffin & Trystram, *Dissecting the software-based measurement of CPU energy consumption*, 2024. [paper](https://arxiv.org/abs/2401.15985). R4
- CNCF, *The road to Scaphandre v1.0*. [post](https://www.cncf.io/blog/2023/10/11/the-road-to-scaphandre-v1-0-challenges-and-improvements-to-come-on-it-energy-consumption-evaluation/). R4
- Machado, Eitzinger, Hager et al., *On the Challenges of Energy-Efficiency Analysis in HPC Systems*, 2025. [paper](https://arxiv.org/abs/2512.03697). R5, R6

## Statistics and evaluations

- Miller, *Adding Error Bars to Evals*, 2024. [paper](https://arxiv.org/abs/2411.00640). S1, S2, S8, Q3, Q4, Q12; the interval methods
- Kapoor et al., *AI Agents That Matter*, 2024. [paper](https://arxiv.org/abs/2407.01502). F5, F9, Q4, C1–C4, C8; five repeats per item (main text and appendices A–B)
- Singh et al., *The Leaderboard Illusion*, 2025. [paper](https://arxiv.org/abs/2504.20879). S9, P3, P4 (main text and recommendations)
- Xu et al., *Benchmark Data Contamination of Large Language Models: A Survey*. [paper](https://arxiv.org/abs/2406.04244); Deng et al., *Unveiling the Spectrum of Data Contamination in Language Models*. [paper](https://arxiv.org/abs/2406.14644). Q10 (abstract and introduction)

## Judges and raters

- Zheng et al., *Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena*, NeurIPS 2023. [paper](https://arxiv.org/abs/2306.05685). Q6–Q9, Q11, P1, P2, P6, P8
- Panickssery, Bowman & Feng, *LLM Evaluators Recognize and Favor Their Own Generations*, 2024. [paper](https://arxiv.org/abs/2404.13076). Q7 (abstract, introduction and main findings)
- Krippendorff's alpha conventions. [CASRAI guide](https://casrai.org/guides/krippendorffs-alpha); Beckler et al. [paper](https://escholarship.org/content/qt3393g51v/qt3393g51v.pdf?t=rxhpvw). P7
- boundev, inter-rater agreement for model evaluations. [post](https://www.boundev.ai/blog/inter-rater-agreement-llm-eval-kappa-alpha). P8; 100 double-rated items by default
- A clinical study's minimum number of units for an alpha target. [article](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8942671/). The double-rating default

## Usability and feature comparisons

- ISO 9241-11, the definition of usability. [standard](https://www.iso.org/standard/63500.html). U1 (paywalled: its definition, quoted identically by every secondary source)
- Hornbæk & Law, *Meta-analysis of correlations among usability measures*, CHI 2007. [DOI](https://doi.org/10.1145/1240624.1240722). U2
- UsabilityGeek, on time on task for failed tasks. [post](https://usabilitygeek.com/?p=7748). U3
- Nielsen Norman Group: [Quantitative Studies: How Many Users to Test?](https://www.nngroup.com/articles/quantitative-studies-how-many-users/), [5 Test Users: Qual vs Quant](https://www.nngroup.com/articles/5-test-users-qual-quant/). U6
- Kujawski, weighted scoring, Lawrence Berkeley National Laboratory. [paper](https://escholarship.org/content/qt0cp6j7sj/qt0cp6j7sj.pdf?t=lnq8j7); Ishizaka, rank reversal. [paper](https://eprints.whiterose.ac.uk/167778/3/ishizaka_4_revSS.pdf); Steele et al., Risk Analysis 2009. [record](https://www.scilit.net/publications/d2b36814b5f32678591b071d5c12fc24). U5

## Cost

- TPC pricing. [overview](https://www.tpc.org/pricing/PriceOverview.pdf), [specification](https://www.tpc.org/TPC_Documents_Current_Versions/pdf/TPC-Pricing_v2.9.0.pdf). C5 (overview only)
- Nambiar et al., *Shaping the Landscape of Industry Standard Benchmarks: Contributions of the TPC*, 2012. [DOI](https://doi.org/10.1007/978-3-642-32627-1_1). C4, C6

## Publishing benchmark results

- DeWitt clauses: Cube. [post](https://dev.to/cubejs/dewitt-clause-or-can-you-benchmark-database-and-get-away-with-it-284); Databricks. [post](https://www.databricks.com/blog/2021/11/08/eliminating-the-dewitt-clause-for-database-benchmarking.html); Dan Luu. [post](https://danluu.com/anon-benchmark); Wheeler. [essay](https://dwheeler.com/essays/dewitt-clause.html); ITPro Today, on New York's case against Network Associates. [archived article](https://web.archive.org/web/20250121022134/https://www.itprotoday.com/early-versions/dewitt-clauses-serving-the-wrong-master). F14

## Charts and perception

- Cleveland & McGill, *Graphical Perception*, Journal of the American Statistical Association 1984. [DOI](https://doi.org/10.1080/01621459.1984.10478080). V1, V52 (through Heer & Bostock and Talbot et al., who replicate it)
- Heer & Bostock, *Crowdsourcing Graphical Perception*, CHI 2010. [DOI](https://doi.org/10.1145/1753326.1753357). V1, V2 (experiment 1)
- Talbot, Setlur & Anand, *Four Experiments on the Perception of Bar Charts*, IEEE TVCG 2014. [DOI](https://doi.org/10.1109/TVCG.2014.2346320); Waldner et al., radial and linear charts, 2019. [PDF](https://www.cg.tuwien.ac.at/research/publications/2019/waldner-2019-rld/waldner-2019-rld-paper.pdf). V52 (summaries)
- Correll, Bertini & Franconeri, *Truncating the Y-Axis: Threat or Menace?*, CHI 2020. [DOI](https://doi.org/10.1145/3313831.3376222). D1–D3, V8 (abstract, discussion, conclusion)
- Correll & Gleicher, *Error Bars Considered Harmful*, IEEE TVCG 2014. [DOI](https://doi.org/10.1109/TVCG.2014.2346298). V11, V12 (abstract, design goals, conclusion)
- Belia, Fidler, Williams & Cumming, *Researchers Misunderstand Confidence Intervals and Standard Error Bars*, Psychological Methods 2005. [DOI](https://doi.org/10.1037/1082-989X.10.4.389). V11, V13 (abstract)
- Cumming & Finch, *Inference by Eye*, American Psychologist 2005. [DOI](https://doi.org/10.1037/0003-066X.60.2.170). V13 (through secondary sources)
- Hofman, Goldstein & Hullman, *How Visualizing Inferential Uncertainty Can Mislead Readers About Treatment Effects*, CHI 2020. [PDF](https://mucollective.northwestern.edu/files/2020-Visualizing-Inferential-Uncertainty.pdf). V14 (abstract, discussion)
- Weissgerber et al., *Beyond Bar and Line Graphs*, PLOS Biology 2015. [article](https://journals.plos.org/plosbiology/article?id=10.1371/journal.pbio.1002128). V15
- Isenberg, Bezerianos, Dragicevic & Fekete, *A Study on Dual-Scale Data Charts*, IEEE TVCG 2011. [DOI](https://doi.org/10.1109/TVCG.2011.160); Datawrapper, *Why not to use two axes*. [post](https://www.datawrapper.de/blog/dualaxis/). V5 (the study read through Datawrapper)
- Qu & Hullman, *Keeping Multiple Views Consistent*, IEEE InfoVis 2017. [PDF](https://mucollective.northwestern.edu/files/2017-consistency-InfoVis.pdf); Wilke, *Fundamentals of Data Visualization*, ch. 21. [book](https://clauswilke.com/dataviz/multi-panel-figures.html). V6, V35 (Qu & Hullman: abstract, figure 2, conclusion)
- Pandey et al., *How Deceptive are Deceptive Visualizations?*, CHI 2015. [DOI](https://doi.org/10.1145/2702123.2702608). V7 (summaries)
- Menge et al., *Logarithmic scales in ecological data presentation may cause misinterpretation*, Nature Ecology & Evolution 2018. [DOI](https://doi.org/10.1038/s41559-018-0610-7). V9 (abstract and summaries)
- Zhao, Qu & Sedlmair, *Neighborhood Perception in Bar Charts*, CHI 2019. [PDF](https://visvar.github.io/assets/pdf/zhao2019barperception.pdf); Fygenson, Franconeri & Bertini, *The Arrangement of Marks Impacts Afforded Messages*, IEEE VIS 2023. [paper](https://arxiv.org/abs/2308.13321). V10
- Hoffswell, Li & Liu, *Techniques for Flexible Responsive Visualization Design*, CHI 2020. [PDF](https://mail.zcliu.cs.umd.edu/responsiveVis/responsive_vis_CHI20.pdf). V53 (abstract, corpus analysis)

## Colour and accessibility

- W3C, Understanding WCAG 2.2: [Use of Color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html), [Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html). V18, V19
- W3C, [Complex Images tutorial](https://www.w3.org/WAI/tutorials/images/complex/). V46
- Elavsky et al., Chartability. [workbook](https://chartability.github.io/POUR-CAF/). V19, V27, V34, V40, V47–V50 (its critical heuristics; the WCAG motion criteria behind V50 not read)
- Crameri, Shephard & Heron, *The misuse of colour in science communication*, Nature Communications 2020. [article](https://pmc.ncbi.nlm.nih.gov/articles/PMC7595127/). V18, V23
- Okabe & Ito, *Color Universal Design*. [page](https://jfly.uni-koeln.de/color/). V18, V22, V28
- Datawrapper, *Colors for data vis style guides*. [post](https://www.datawrapper.de/blog/colors-for-data-vis-style-guides). V17, V20–V22 (first two thirds)

## Titles, text and tables

- Kong, Liu & Karahalios, *Frames and Slants in Titles of Visualizations on Controversial Topics*, CHI 2018. [DOI](https://doi.org/10.1145/3173574.3174012). V25, V41 (abstract, conclusion; tested on controversial topics, not benchmarks)
- Stokes et al., *Striking a Balance: Reader Takeaways and Preferences when Integrating Text and Charts*, 2022. [paper](https://arxiv.org/abs/2208.01780). V28 (line charts only)
- Lundgard & Satyanarayan, *Accessible Visualization via Natural Language Descriptions*, 2021. [paper](https://arxiv.org/abs/2110.04406). V46
- Cole, *Too many digits: the presentation of numerical data*, Archives of Disease in Childhood 2015. [article](https://pmc.ncbi.nlm.nih.gov/articles/PMC4483789). V30
- Schwabish, *Ten Guidelines for Better Tables*, Journal of Benefit-Cost Analysis 2020. [DOI](https://doi.org/10.1017/bca.2020.11). V29, V32 (through a summary only)
- Aisch, *In Defense of Interactive Graphics*. [post](http://www.vis4.net/blog/in-defense-of-interactive-graphics/). V33, V37
- Gigerenzer, Gaissmaier, Kurz-Milcke, Schwartz & Woloshin, *Helping Doctors and Patients Make Sense of Health Statistics*, Psychological Science in the Public Interest 2007. [DOI](https://doi.org/10.1111/j.1539-6053.2008.00033.x), [PDF](https://www.stat.berkeley.edu/~aldous/157/Papers/health_stats.pdf). V57: relative figures are nontransparent and look big; give the absolute values (passages on relative and absolute risks)
- Goldstein & Spiegelhalter, *League Tables and Their Limitations*, Journal of the Royal Statistical Society A 1996. [DOI](https://doi.org/10.2307/2983325), [preprint](https://www.bristol.ac.uk/media-library/sites/cmm/migrated/documents/limitations-of-league-tables.pdf). V57: a winner is never read from overlapping intervals, and candidates that cannot be separated are said to be so (preprint; figures not seen)
- Shneiderman, *The Eyes Have It*, 1996. [DOI](https://doi.org/10.1109/VL.1996.545307). V38 ("overview first, details on demand"; not read)

## Exports

- GitHub, [images for light and dark mode](https://github.blog/developer-skills/github/how-to-make-your-images-in-markdown-on-github-adjust-for-dark-mode-and-light-mode/). V45: the README card in both modes
- [The Open Graph protocol](https://ogp.me/). The page's preview image, its size and its text alternative

## Our own decisions

Rules and values we chose, with no outside source. Say so when the user asks about them: they are reasoned defaults, open to change.

- Derived from other rules: F19 (F3 and R8 applied to a criterion named without its form, after test runs measured only what their tool reported), U4 (from F15 and Q5), V4 (V20 and V21), V31 (S1, T8 and Q5), V44 (S1 applied to the Markdown report), V54 (D1 and V1 applied row by row).
- Design decisions: V3, V16, V24, V26, V36, V39, V42, V43, V51; T13, from what our own benchmarks of script suites showed; publishing, H1–H9.
- From an outside review of the specs: F18 (raw data written by the program that measures, every number computed by astrolabe), V56 (declared figures marked as declared), and S11 (primary comparisons declared before measuring, as clinical trials declare their primary endpoints).
- Thresholds within sourced rules: about 10 measurements or fewer for plotting every point (V15), 8 colours (V20), the table sizes of V32, the row limit of V54, the 2× threshold of V55, the order of V38, and the 80- and 60-character limits of F2 and V25.
- Defaults: at least 10 runs per configuration, 5 repeats per item, 100 double-rated items, runs on two days and two times of day for services you do not control. Each rests on the source named beside it above; the value is ours.
