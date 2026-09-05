# Source Rights Review — legacy publishers (2026-09-05)

Reviewed by: Compute Current editorial desk, from GitHub-hosted `Terms Probe` runs
(`terms-probe.yml`, runs 2–6 on 2026-09-05). Every quotation below was read from the
publisher's own page on that date. This is an operator record, not legal advice; a lawyer
should confirm anything the site relies on commercially.

## What was checked

Two questions per publisher:

1. **Link-only lane** — may Compute Current show the item's *headline, a one-line
   description, publication date and a link to the publisher's page*, with the publisher
   named as the source, without the article text or image? This is what an RSS reader does.
2. **Full text** — may the pipeline fetch, store and republish the article body (which is
   what `text_use_basis` authorises)?

General framing that applies to every row:

- Headlines and hyperlinks are, in most jurisdictions, facts and references rather than
  protected expression, and publishers offer RSS feeds precisely so third-party readers can
  list them. That makes the link-only lane low risk *as long as* the lane shows only what the
  feed ships (title, short description, link), attributes the publisher, and drops a source on
  request.
- Almost every publisher's terms restrict *commercial use, redistribution, scraping and
  reproduction* of site content. Compute Current runs advertising, so it is a commercial site.
  A terms page that permits only "personal, non-commercial" use does not license republishing
  article text, and the review therefore leaves `text_use_basis: unreviewed` for all 27.
- Where a publisher writes rules for feeds or synopses (TechCrunch, ServeTheHome), the
  link-only lane must follow those rules exactly.
- Three publishers go further: Capacity and Uptime Institute prohibit redistributing or even
  summarising content without written consent, and Bloomberg pairs an express permission to
  link with a noncommercial-only licence and a ban on building any database from the service.
  Those need an email before any lane is enabled.

## Verdict key

| Verdict | Meaning |
| --- | --- |
| **Permitted (explicit)** | The publisher's own RSS or copyright policy allows headline + link (+ bounded snippet) with attribution. |
| **Low risk (feed offered, terms silent)** | The publisher ships a public RSS feed; its terms restrict copying/commercial use of site content but say nothing about feed listings. Headline + link + feed description only. |
| **Ask first** | Terms prohibit redistribution, summarising or linking without written consent, or forbid automated access outright. Do not enable without permission. |
| **Blocked / unreachable** | The runner could not fetch the feed or the terms page; nothing can be enabled until that changes. |

## Per-publisher findings

| Registry id | Publisher | Feed (runner, 2026-09-05) | Terms page | What the terms say | Link-only lane | Full text |
| --- | --- | --- | --- | --- | --- | --- |
| techcrunch-ai | TechCrunch (AI) | 200 | https://techcrunch.com/rss-terms-of-use/ | "If you choose to use a TechCrunch RSS feed, you are only permitted to display the content that is provided in the feed, with attribution to TechCrunch, and you must link to the full article on TechCrunch. You may not incorporate advertising into any TechCrunch RSS feed. You may not remove our attribution or links, or otherwise modify our feed content." ToS: personal, non-commercial use; no robots/scrapers. | **Permitted (explicit)** — feed items as shipped, attributed, linked; no ads inside the feed block | No |
| servethehome | ServeTheHome | 200 | https://www.servethehome.com/about/editorial-copyright-policies/ | "Up to 300 consecutive characters of any piece may be reproduced for the purpose of creating a synopsis of a piece, if and only if, the synopsis is being used to link back to the original article by an editorial news site. Up to one image from an article may also be used for the purpose of providing a synopsis and link back to the original piece. Any other use including copying in part or in whole of articles is not permitted." $10,000-per-use fee for non-compliant use; AI-training clause. | **Permitted (explicit)** — ≤300 characters + link back; one image allowed | No |
| siliconangle-ai | SiliconANGLE | 200 | https://siliconangle.com/terms-of-use/ | "You may view and/or print pages ... for your own personal use ... You must not: Republish material ... Reproduce, duplicate or copy material ... Redistribute content ... (unless content is specifically made for redistribution)." Linking section allows text links "that make sense within the context"; no framing. | **Low risk** — headline + link; the feed is content "made for redistribution" in the reader sense, but keep to the feed summary | No |
| theregister-data-centre | The Register | **404** (feed path dead) | https://www.theregister.com/profile/terms_and_conditions_of_use | "use the Website solely for your personal, non-commercial use (b) you will not copy or distribute any part of the Website without our prior written authorisation". | **Low risk** once a working feed URL is found | No |
| blocks-and-files | Blocks & Files | 200 | https://www.blocksandfiles.com/tc (Situation Publishing, same group as The Register) | "you use the Website solely for your personal, non-commercial use (b) you will not copy or distribute any part of the Website without our prior written authorisation". | **Low risk** — headline + link | No |
| datacenterdynamics | DCD | 200 | https://www.datacenterdynamics.com/en/terms-and-conditions/ | "No copying or distribution of material on the Website for any commercial or business use is permitted without our prior written consent"; no database of downloaded material; no re-circulating material to third parties "except where expressly permitted". | **Low risk** — headline + link only; no stored body text | No |
| datacenterknowledge | Data Center Knowledge | 200 | https://www.informatechtarget.com/terms-of-use/ (Informa TechTarget) | Viewing licence only; may not "use any data mining, robots or similar data gathering or extraction methods" or use the Services "other than for its intended purpose"; reprints via Wright's Media. | **Low risk** — headline + link from the feed; no crawling of article pages | No (reprint licence via Wright's Media) |
| utility-dive | Utility Dive | 200 | https://www.informatechtarget.com/terms-of-use/ (Informa TechTarget) | Same Informa TechTarget terms as above. | **Low risk** — headline + link | No |
| semiconductor-engineering | Semiconductor Engineering | 200 | https://semiengineering.com/terms-of-service/ | "authorizes you to view the content of this site for your own non-commercial and personal use. You may not copy any sections of this site, including but not limited to its content, data..." | **Low risk** — headline + link | No |
| toms-hardware | Tom's Hardware | 200 | https://futureplc.com/terms-and-conditions-us/ (Future plc) | "RULES ABOUT LINKING TO OUR SERVICES: You may link to our pages, provided you do so in a way that is fair and legal and does not damage our reputation or take advantage of it. You must not establish a link in such a way as to suggest any form of association, approval or endorsement." Content: "You must not use any part of the Content on our Services for commercial purposes without obtaining a license"; no bots or scrapers. | **Permitted (explicit linking rule)** — headline + link, no endorsement implied; no content reuse | No |
| storagereview | StorageReview | 200 | none found (404 on /terms-of-service, /terms-of-use) | Footer: "Copyright © 1998-2025 Flying Pig Ventures, LLC. All rights reserved." Public feed at storagereview.com/rss.xml. | **Low risk** — headline + link (default copyright, no stated restriction on feed use) | No |
| datacenterpost | Data Center POST | 200 | none found (404) | Footer: "Copyright © iMiller Public Relations". PR-agency news site. | **Low risk** — headline + link | No |
| nvidia-blog | NVIDIA Blog | 200 | https://www.nvidia.com/en-eu/about-nvidia/terms-of-service/ | Materials for "personal, non-commercial internal use only"; may not "use them for any commercial purpose"; may not "use any robot, spider, scraper, crawler ... to access, acquire, copy or monitor any portion of the Site"; content "may not be copied, reproduced, modified, published ... without NVIDIA's prior written permission". | **Low risk for feed listing, but the scraper clause forbids fetching article pages** — feed headline + link only | No |
| google-cloud-blog | Google Cloud Blog | 200 | https://policies.google.com/terms (generic Google ToS; no blog-specific page found) | Prohibits automated access "in violation of the machine-readable instructions on our web pages (for example, robots.txt files that disallow crawling...)". | **Low risk** — headline + link from the feed | No |
| aws-news-blog | AWS News Blog | 200 | https://aws.amazon.com/terms/ | "limited license to access and make personal use of the AWS Site"; excludes "any resale or commercial use ... any derivative use ... or any use of data mining, robots, or similar data gathering and extraction tools"; grants "a limited, revocable, and nonexclusive right to create a hyperlink to the home page". Only docs.aws.amazon.com is CC-BY-SA-4.0. | **Low risk** — feed headline + link (the hyperlink grant names the home page; article links are the feed's purpose) | No |
| microsoft-azure-blog | Microsoft Azure Blog | 200 | https://www.microsoft.com/en-us/legal/terms-of-use | "Unless otherwise specified, the Services are for your personal and non-commercial use. You may not modify, copy, distribute, transmit, display, perform, reproduce, publish..." Press releases/white papers may be used for "informational and non-commercial or personal use only" with the copyright notice. | **Low risk** — headline + link | No |
| cloudflare-blog | Cloudflare Blog | 200 | https://www.cloudflare.com/website-terms/ | Website terms govern www.cloudflare.com and sites linking to them; standard IP reservation. No feed-specific clause found. | **Low risk** — headline + link | No |
| meta-engineering | Engineering at Meta | 200 | https://www.facebook.com/policies (runner gets HTTP 400; Meta blocks unauthenticated fetch) | Not readable from the runner. Blog offers a public feed. | **Low risk** — headline + link; terms unverified | No |
| hugging-face-blog | Hugging Face Blog | 200 | https://huggingface.co/terms-of-service | "All materials that we produce, including the Website ... shall remain our exclusive property. You may not alter, reproduce, republish, license any of our proprietary materials, unless we expressly give you a written permission." | **Low risk** — headline + link | No |
| hpcwire | HPCwire | feed 200; site pages **403** | https://www.taborcommunications.com/terms-of-use/ (Tabor Communications) | "Registered User agrees not to resell or make any commercial use of the Service without the express written consent of HPCwire"; "Any use of materials on the website, including reproduction ..., any form of data extraction or data mining, or other commercial exploitation of any kind, without prior written permission" is prohibited. Article pages refuse the runner (403). | **Low risk** — feed headline + link only; article pages cannot be fetched anyway | No |
| insidehpc | insideHPC | **000** (TLS handshake failure) | unreachable | Site unreachable from the runner. | **Blocked / unreachable** | No |
| power-engineering | Power Engineering | **403** | 403 on /terms-of-use | Site refuses the runner entirely. | **Blocked** | No |
| datacenterfrontier | Data Center Frontier | **400** | https://www.endeavorbusinessmedia.com/endeavor-terms → 404 (Endeavor Business Media moved its terms page) | Terms page gone; feed returns 400. | **Blocked** until a working feed and terms page exist | No |
| venturebeat-ai | VentureBeat (AI) | 200; site pages **429** | https://venturebeat.com/terms-of-service/ (rate-limited) | Feed carries `<copyright>Copyright 2026, VentureBeat</copyright>`; terms not readable from the runner. | **Low risk** — headline + link; terms unverified | No |
| bloomberg-technology | Bloomberg Technology | 200 (homepage blocks bots) | https://www.bloomberg.com/notices/tos | General terms: "You agree to use the Service solely for your own noncommercial use"; no "scraper, robot, bot, spider, data mining" tools; "may not be used to construct a database of any kind"; "may not recirculate, redistribute or publish the analysis and presentation". Linking terms: "you may include a link(s) on your Web site to Bloomberg.com's publicly accessible Web pages"; "you may not frame any Web page from Bloomberg.com"; "you may not archive, cache, or mirror any Bloomberg.com Web page". | **Ask first** — plain links are expressly allowed, but the noncommercial-only licence and the database clause sit over a monetised, stored feed listing | No |
| capacity-media | Capacity (Delinian / techoraco) | redirects to capacityglobal.com | https://www.capacityglobal.com/terms-conditions/ | "You agree that you shall not: copy, publish, republish, redistribute, archive, store, adapt, alter, modify, translate, create derivative works from, summarise, photocopy, scan, syndicate, sell, license, frame, harvest, scrape ... any Content ... without the prior express written consent of Delinian." | **Ask first** — even summarising or storing is prohibited without consent | No |
| uptime-institute-journal | Uptime Institute Journal | 200 | https://uptimeinstitute.com/terms-of-use | "grants to User the right to access and use the Website, so long as such use is for internal information purposes, and User does not alter, copy, disseminate, redistribute or republish any content or feature of this Website ... any expanded access or use must be approved in writing by Uptime Institute." | **Ask first** — redistribution of any content requires written approval | No |

## Summary

| Verdict | Count | Publishers |
| --- | --- | --- |
| Permitted (explicit) | 3 | TechCrunch, ServeTheHome, Tom's Hardware |
| Low risk (feed offered, terms silent on listings) | 18 | SiliconANGLE, The Register*, Blocks & Files, DCD, Data Center Knowledge, Utility Dive, Semiconductor Engineering, StorageReview, Data Center POST, NVIDIA Blog, Google Cloud Blog, AWS News Blog, Microsoft Azure Blog, Cloudflare Blog, Engineering at Meta, Hugging Face Blog, VentureBeat, HPCwire |
| Ask first | 3 | Bloomberg, Capacity, Uptime Institute |
| Blocked / unreachable | 3 | insideHPC, Power Engineering, Data Center Frontier |
| Full text permitted | 0 | — |

\* The Register's registered feed path returns 404; a replacement feed URL is needed before the lane can run.

## What this changes in the registry

- `terms_url` and `reviewed_at: 2026-09-05` are recorded for every publisher whose terms
  page was read, and a one-line `rights_note` summarises the verdict.
- `text_use_basis` stays `unreviewed` and `allow_text_use` stays `false` for all 27, so
  `activeRegistryFeeds()` still returns only the government and open-licence sources. Nothing
  in this review authorises fetching or publishing article text.
- A link-only lane does not exist in the pipeline yet. Building one is a product decision:
  it needs its own gate (`link_only_basis` with the verdicts above), a card template that shows
  only feed-shipped fields, per-publisher rules (TechCrunch: no advertising inside the feed
  block; ServeTheHome: ≤300 characters), and a removal path via the contact address published
  in the terms.

## Recommended next actions

1. Email Bloomberg, Capacity (techoraco) and Uptime Institute before listing anything from them.
2. Find a current RSS URL for The Register (data centre section) and Data Center Frontier; retest with `Feed Probe`.
3. Retry VentureBeat, Power Engineering and insideHPC from a different network or ask them directly; the runner is blocked.
4. If the link-only lane is built, start with TechCrunch, ServeTheHome and Tom's Hardware (explicit permission) and the government feeds already authorised, then add the "low risk" group with attribution and a documented takedown path.
