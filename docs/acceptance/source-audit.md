# 来源核验记录（§9.3 第 10 条）

核验人：childe（由 xdev 实现阶段执行） / 第一轮：2026-10-12（文献身份层） / 第二轮：2026-10-12（结论实质层）

## 核验方式与它的边界

第二轮做的是**结论实质核验**：对 22 条 claim 的每一条来源，逐条取回该文献的**结构化摘要原文**
（Europe PMC `resultType=core`，按 PMID 精确检索），把摘要里的**结果段与结论段**逐句与登记表里的
`statement`、`direction`、`certainty`、`population`、`limitations` 对照，并在下表留下**支持该条的原句或效应量**。
23 个 PMID 中 22 个取回了摘要全文；唯一取不到摘要的是 Hall 2012（见下表与「仍需人工完成的部分」）。

**第一轮已做并仍然成立的**：按 PMID 反查作者／年份／期刊／标题，确认链接指向的确实是登记表里写的那一篇；
`npm run check:links:release` 确认全部来源可达。

**第二轮仍然没做的**：没有下载并通读 PDF 全文。摘要含结果与效应量时这一层已足以判断方向与分级；
但涉及亚组细节、方法学细节的判断仍以摘要所载为限，下表凡属此类都写进了 `limitations`。

## 本轮因实质核验而做出的修正（这是这一轮的主要产出）

| claim | 修正 | 依据 |
|---|---|---|
| claim-gain-rate | 确定性 中 → **低**，重写 limitations，并同步改了第 6 章正文里的标签与说法 | 两项来源都没有直接比较 0.25%–0.5%/周 这个区间：Garthe 2013 是增重试验（快增组多增的是脂肪、瘦体重两组无差异），Garthe 2011 的 0.7%/周 是**减重**速率。数值区间属外推 |
| claim-sleep-performance | 确定性 中 → **低**，statement 收窄为"削弱运动表现；对长期训练适应的证据更弱" | Fullagar 2015 摘要自述证据不一致，且只测急性睡眠剥夺对表现的影响，未测长期训练适应 |
| claim-overtraining-rare | 确定性 中 → **低** | ECSS/ACSM 共识没有任何人群的发生率比较，本条是从诊断门槛推出的实践判断 |
| claim-load-equivalence | 重写 limitations，写明等效区间 | Lasevicius 2018 在容量负荷相等时，20% 1RM 的股外侧肌 CSA 增幅 8.9% 明显低于 80% 1RM 的 19.5% |
| claim-failure-not-required | 补 limitations 的亚组结果 | Grgic 2022 主分析无差异，但"已受训者"亚组力竭对肥大有显著小优势（ES 0.15，95%CI 0.03–0.26） |
| claim-mechanical-tension | 补 limitations | Schoenfeld 2010 摘要只说三种机制"都可能起作用"，"张力为主"是正文论证而非定量比较 |
| claim-cardio-mortality | 补 limitations | WHO 2020 的暴露指标是**活动量**而不是实测心肺耐力，属相邻指标外推 |
| ✱ claim-redflag-referral | **增加直接来源** Downie 2013《Red flags to screen for malignancy and fracture in patients with low back pain》（PMID 24335669），并重写 limitations | ACP 2017 指南把红旗征人群排除在适用范围外，它支撑不了红旗征清单本身 |
| claim-energy-balance | 在 limitations 里写明本轮没能取到摘要 | Europe PMC 该条无 abstractText |

## 全部 claim 的实质核验（22 条，安全级 4 条标 ✱）

| claim id | 方向·确定性 | 来源 | 摘要里支持该结论的原句／效应量 | 判定 |
|---|---|---|---|---|
| claim-protein-threshold | 支持·高 | Morton 2018 / 28698222 | "Protein supplementation beyond total protein intakes of **1.62 g/kg/day** resulted in **no further** RET-induced gains in FFM"（49 项 RCT，1863 人） | 直接支持，分级成立 |
| claim-spot-reduction | 反对·高 | Ramírez-Campillo 2013 / 23222084；Vispute 2011 / 21804427 | 单腿训练 12 周："fat mass … reduction **was not achieved in the trained body segment**"；腹部训练 6 周："no significant effect … on android fat / abdominal skinfold" | 两项同体内对照直接反证，分级成立 |
| claim-stretch-timing | 未定·低 | Behm 2016 / 26642915 | 综述终点是急性表现、ROM 与损伤发生率（SS −3.7%、DS +1.3%），**全文不涉及肌肥大** | 来源不覆盖该终点，这正是"未定·低"的依据；已写入 limitations |
| claim-gain-rate | 支持·低 | Garthe 2013 / 23679146；Garthe 2011 / 21558571 | 增重试验："BW increased more in NCG (3.9%) … **FM increased more in NCG** (15±4 vs 3±3%)，LBM 两组无差异"；减重试验的 0.7%/周 是减重速率 | 只支持方向，不支持具体区间 → **已降级为低**并重写 limitations |
| claim-mechanical-tension | 支持·中 | Schoenfeld 2010 / 20847704 | "mechanical tension, muscle damage, and metabolic stress **all can play a role**" | 机制综述，方向支持；"主要驱动"属正文论证 → 已写入 limitations，分级维持中 |
| claim-damage-not-required | 反对·中 | Damas 2018 / 29282529 | "we conclude that **muscle damage is not the process that mediates or potentiates** RT-induced muscle hypertrophy" | 直接反证，分级成立 |
| claim-soreness-not-indicator | 反对·中 | Damas 2018 / 29282529；Schoenfeld 2010 / 20847704 | 同上；并有"protocols that do not promote significant muscle damage still induce **similar** hypertrophy" | 由"损伤≠肥大"推到"酸痛≠效果指标"，是间接推论，已在 limitations 写明 |
| claim-volume-dose-response | 支持·中 | Schoenfeld 2017 / 27433992 | "Each additional set … increase in ES of **0.023**（约 +0.37% 增幅）… a **graded dose-response** relationship"（34 组／15 研究） | 直接支持，分级成立 |
| claim-load-equivalence | 支持·中 | Schoenfeld 2017 / 28834797；Lasevicius 2018 / 29564973 | "Changes in measures of muscle hypertrophy were **similar** between conditions"（全部做到力竭）；但 20% 1RM 组 CSA 8.9% < 80% 组 19.5% | 支持，但有下界 → **已补写适用区间 30%–80% 1RM** |
| claim-rest-interval | 支持·中 | Schoenfeld 2016 / 26605807 | "Muscle thickness was significantly greater for **LONG**（3 min）compared to SHORT（1 min）in the anterior thigh"（n=21，8 周） | 直接支持；小样本、受训男性，已写入 limitations |
| claim-failure-not-required | 反对·中 | Grgic 2022 / 33497853 | "Training to muscle failure **does not seem to be required**"（肥大 ES 0.22，95%CI −0.11–0.55） | 直接支持该否定句；已补亚组例外 |
| claim-frequency | 支持·中 | Schoenfeld 2016 / 27102172 | "frequencies of training **twice a week** promote superior hypertrophic outcomes to once a week"（容量相等） | 直接支持，分级成立 |
| claim-rir-accuracy | 支持·低 | Zourdos 2021 / 30747900 | RIR 误差：9RPE 时 2.05±1.73 次，7RPE 时 3.65±2.46，5RPE 时 **5.15±2.92** | 直接支持"越近越准、远处高估"；单项 n=25 受训男性 → 低 |
| claim-energy-balance | 支持·高 | Hall 2012 / 22434603 | **本轮未取到摘要**（Europe PMC 无 abstractText） | 核验只到标题与综述范围层；已在 limitations 写明，列为本轮唯一缺口 |
| claim-sleep-performance | 支持·低 | Fullagar 2015 / 25315456 | "conflicting findings mean that the **extent … remain uncertain**"；"the few published studies … **in athletes** report a reduction in sport-specific performance" | 来源自述证据不一致、且不覆盖训练适应 → **已降级为低并收窄 statement** |
| claim-overtraining-rare | 支持·低 | Meeusen 2013 ECSS/ACSM / 23247672 | 共识讲的是 OTS 的排除诊断与"**no**（markers）meet all the criteria"，**没有发生率数据** | 实践推论而非来源结论 → **已降级为低** |
| claim-interference-effect | 支持·中 | Wilson 2012 / 22002517 | "resistance training concurrently with **running**, but not cycling, resulted in significant decrements in both hypertrophy and strength"；频率/时长与肥大负相关（−0.26…−0.75） | 直接支持，且解释了本教程"选骑行、控时长"的处方 |
| claim-cardio-mortality | 支持·高 | WHO 2020 指南 / 33239350 | "All adults should undertake **150–300 min** moderate-intensity … per week"，结局集含全因死亡 | 支持"规律有氧降低全因死亡"；暴露指标是活动量 → 已写明外推 |
| ✱ claim-redflag-referral | 支持·高 | Downie 2013 / 24335669（红旗征直接来源）；Qaseem 2017 ACP / 28192789 | ACP 指南的适用人群**排除**红旗征患者（它讲的是非侵入性治疗）；红旗征筛查本身由 Downie 2013 的系统综述支撑 | **原来源支撑不了本条** → 已补直接来源并重写 limitations |
| ✱ claim-strength-training-injury-prevention | 支持·中 | Lauersen 2014 / 24100287 | "**strength training reduced sports injuries to less than 1/3**"（RR 0.315，95%CI 0.207–0.480；25 项 RCT、26610 人） | 直接支持，效应量明确；人群为运动队 → 维持中 |
| ✱ claim-stretching-not-injury-prevention | 反对·中 | Lauersen 2014 / 24100287 | "proved **no beneficial effect for stretching**（RR 0.963，95%CI 0.846–1.095）" | 同一荟萃中的直接无效结果，分级成立 |
| ✱ claim-load-spike-injury | 支持·中 | Gabbett 2016 / 26758673 | "**Excessive and rapid increases in training loads** are likely responsible for a large proportion of non-contact, soft-tissue injuries"；提出 acute:chronic workload ratio | 方向直接支持；ACWR 的方法学争议已在 limitations 写明 |

**安全相关 claim（§4.3 更高门槛）**：四条全部来自系统综述或权威机构指南，没有一条以博客、视频或教练经验谈为唯一来源。
四条都做了摘要层逐句核验；其中 `claim-redflag-referral` 在本轮被发现原来源不支撑清单本身，已补直接来源。
`src/validate/claims.mjs` 对 `safety: true` 的来源类型做机器校验，改坏会导致构建失败。

## 链接可达性

`npm run check:links:release` 于 2026-10-12（第二轮后重跑）：**合计 47，可达 47，失效 0，未检查 0**。
claim 来源全部指向 PubMed，示范链接全部指向 ACE 官方动作库。

## 仍需人工完成的部分

- [ ] Hall 2012（22434603）：取不到摘要，需要人工打开全文确认其对"长期体重方向由能量收支决定"的表述。
- [ ] 若要把分级从"摘要层核验"升到"全文精读核验"，需要逐篇下载 PDF 核对效应量的计算与亚组细节；
      本轮已把所有**摘要层能判断的分歧**都改进了登记表，剩下的是方法学层面的复核。
