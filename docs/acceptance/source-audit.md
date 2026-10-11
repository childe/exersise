# 来源核验记录（§9.3 第 10 条）

核验人：childe（由 xdev 实现阶段执行） / 日期：2026-10-12

## 核验方式与它的边界（先说清楚，避免这份记录被当成比它更强的证据）

本轮核验做了下面这些、**只做了**这些：

1. 对每条 claim 的每个来源 URL，用 Europe PMC 的 REST 接口按 PMID 反查了**作者、年份、期刊、标题**，
   确认链接指向的确实是登记表里写的那一篇（这一步排除的是"引错文献／PMID 打错"这类错误，
   它是最常见也最容易被忽略的一类）。
2. 对每条 claim 用 `npm run check:links:release` 确认来源链接**可达**（见下方链接检查小节）。
3. 对每条 claim 的 `population` / `limitations` / `rating_rationale` 三个字段，逐条检查它们是否
   与该文献的研究类型自洽（例如：标 RCT 的不能写"队列研究的残余混杂"）。

**没有做的**：没有逐篇打开全文核对效应量与结论细节。因此下表的"来源是否支持该结论"一列，
记录的是**基于标题、研究类型与该领域公认结论的判断**，不是全文精读的结论。
§9.3 第 10 条要求的"逐条打开来源确认"在全文层面仍需人工复核一轮——这是本记录的已知缺口，
见文末「仍需人工完成的部分」。

## 全部 claim 清单（22 条，安全级 4 条标 ✱）

| claim id | 方向·确定性 | 来源（PMID 已反查比对） | 来源是否支持该结论 | 人群可否外推 | 分级理由是否成立 | 处理 |
|---|---|---|---|---|---|---|
| claim-protein-threshold | 支持·高 | Morton 2018 / 28698222 | 是 | 是（健康成年受训者） | 是 | 保留 |
| claim-spot-reduction | 反对·高 | Ramírez-Campillo 2013 / 23222084；Vispute 2011 / 21804427 | 是（同体内对照是直接反证） | 是 | 是 | 保留 |
| claim-stretch-timing | 未定·低 | Behm 2016 / 26642915 | 是（该综述不覆盖长期肥大，正是"未定"的依据） | 部分（终点不同，已在 limitations 写明） | 是 | 保留 |
| claim-gain-rate | 支持·中 | Garthe 2013 / 23679146；Garthe 2011 / 21558571 | 是 | 部分（样本为精英运动员，已写明） | 是 | 保留 |
| claim-mechanical-tension | 支持·中 | Schoenfeld 2010 / 20847704 | 是（机制综述） | 是 | 是（机制证据不升到"高"） | 保留 |
| claim-damage-not-required | 反对·中 | Damas 2018 / 29282529 | 是 | 是 | 是 | 保留 |
| claim-soreness-not-indicator | 反对·中 | Damas 2018 / 29282529；Schoenfeld 2010 / 20847704 | 是（间接但方向明确，已在 limitations 写明是间接推出） | 是 | 是 | 保留 |
| claim-volume-dose-response | 支持·中 | Schoenfeld 2017 / 27433992 | 是 | 是 | 是 | 保留 |
| claim-load-equivalence | 支持·中 | Schoenfeld 2017 / 28834797；Lasevicius 2018 / 29564973 | 是 | 是（男性样本偏多，已写明） | 是 | 保留 |
| claim-rest-interval | 支持·中 | Schoenfeld 2016 / 26605807 | 是 | 部分（受训男性，小样本，已写明） | 是 | 保留 |
| claim-failure-not-required | 反对·中 | Grgic 2022 / 33497853 | 是 | 是 | 是 | 保留 |
| claim-frequency | 支持·中 | Schoenfeld 2016 / 27102172 | 是 | 是 | 是 | 保留 |
| claim-rir-accuracy | 支持·低 | Zourdos 2021 / 30747900 | 是 | 部分（受训者；新手更差属外推，已写明） | 是 | 保留 |
| claim-energy-balance | 支持·高 | Hall 2012 / 22434603 | 是 | 是 | 是 | 保留 |
| claim-sleep-performance | 支持·中 | Fullagar 2015 / 25315456 | 是 | 部分（急性剥夺外推到睡眠债，已写明） | 是 | 保留 |
| claim-overtraining-rare | 支持·中 | Meeusen 2013 ECSS/ACSM 共识 / 23247672 | 是（由共识的诊断门槛推出，已写明是推论） | 部分 | 是 | 保留 |
| claim-interference-effect | 支持·中 | Wilson 2012 / 22002517 | 是 | 是 | 是 | 保留 |
| claim-cardio-mortality | 支持·高 | WHO 2020 指南 / 33239350 | 是 | 是 | 是 | 保留 |
| ✱ claim-redflag-referral | 支持·高 | ACP 临床实践指南 Qaseem 2017 / 28192789 | 是 | 部分（指南针对腰背痛，推广到肩膝是保守外推，已写明） | 是 | 保留 |
| ✱ claim-strength-training-injury-prevention | 支持·中 | Lauersen 2014 / 24100287 | 是 | 部分（运动队人群，已写明） | 是 | 保留 |
| ✱ claim-stretching-not-injury-prevention | 反对·中 | Lauersen 2014 / 24100287 | 是（同一荟萃中拉伸组无显著差异） | 部分 | 是 | 保留 |
| ✱ claim-load-spike-injury | 支持·中 | Gabbett 2016 / 26758673 | 是 | 部分（队列项目运动员，已写明） | 是（已写明急慢性负荷比的方法学争议） | 保留 |

**安全相关 claim（§4.3 更高门槛）**：`claim-redflag-referral`（ACP 指南）、
`claim-strength-training-injury-prevention`（BJSM 系统综述）、
`claim-stretching-not-injury-prevention`（BJSM 系统综述）、`claim-load-spike-injury`（BJSM）。
四条全部来自公开文献或权威机构指南，没有一条以博客、视频或教练经验谈为唯一来源，符合门槛。
`src/validate/claims.mjs` 对 `safety: true` 的来源类型做了机器校验，改坏会导致构建失败。

## 链接可达性

`npm run check:links:release` 于 2026-10-12 在有网环境执行：**合计 46 条，可达 46，失效 0，未检查 0**。
其中 claim 来源链接全部指向 PubMed（稳定、长期可用），示范链接全部指向 ACE 官方动作库。

## 仍需人工完成的部分

- [ ] 对 ≥15 条 claim **逐篇打开全文**，核对效应量与结论细节是否支持登记表里的 `statement`；
      安全级 4 条必须 100% 全文核验。本轮只做到了文献身份与研究类型层面的核验。
- [ ] 上一条完成后，把每条的核验结论回填到上表，并把"核验方式"一节改写成全文核验的描述。
