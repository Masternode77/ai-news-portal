/**
 * The eight policy and transparency pages (ADR-005: static, no database).
 *
 * Text is the legacy site's published copy (src/pages/<slug>.astro, read
 * 2026-10-31), carried as content, not code (P9). Two pages changed where the
 * legacy wording no longer matched the rebuilt site:
 *   - ai-disclosure gains "How Korean briefs are made" (automated briefs and
 *     the checks they pass, packages/pipeline QA gates);
 *   - privacy drops the analytics consent banner text: the rebuilt site loads
 *     no analytics or advertising tags and sets no cookies.
 * Both need Josh's review before the cutover (docs/migration/phase5-cutover.md).
 *
 * Paragraphs are trusted static HTML (links, <code>, <strong> only); pages
 * render them with set:html.
 */

export const CONTACT_EMAIL = "briefings@computecurrent.com";

export interface PolicySection {
  heading: string;
  paragraphs: string[];
}

export interface PolicyPage {
  slug: string;
  eyebrow: string;
  title: string;
  description: string;
  lede: string;
  sections: PolicySection[];
  related: string[];
}

const mail = `<a href="mailto:${CONTACT_EMAIL}">${CONTACT_EMAIL}</a>`;

export const POLICY_PAGES: readonly PolicyPage[] = [
  {
    slug: "about",
    eyebrow: "About",
    title: "Compute Current tracks the infrastructure behind AI.",
    description:
      "About Compute Current, an AI infrastructure intelligence product for operators, investors, cloud capacity teams, data center developers, and infrastructure strategists.",
    lede: "Compute Current is an AI infrastructure intelligence product for operators, investors, cloud capacity teams, data center developers, and infrastructure strategists.",
    sections: [
      {
        heading: "What We Cover",
        paragraphs: [
          "We focus on data center capacity, cloud infrastructure, semiconductors, power availability, grid constraints, cooling, capital markets, enterprise AI deployment, policy, and operational risk.",
        ],
      },
      {
        heading: "What We Do Not Try To Be",
        paragraphs: [
          "Compute Current is not a generic AI blog. We do not force weakly related AI news into an infrastructure frame, and we do not stretch thin source material into long-form analysis.",
        ],
      },
      {
        heading: "Reader Promise",
        paragraphs: [
          "Every full memo is intended to answer what changed, why it matters for AI infrastructure, who benefits, who is exposed, and what bottleneck or decision point readers should watch next.",
        ],
      },
      {
        heading: "Two Kinds of Pages",
        paragraphs: [
          'The wire is an aggregation service: it collects and links to reporting published elsewhere, with a short pointer of our own, and the original stays the authoritative version. The Current is different: it is an original column written by our founder and editor, <a href="/author/josh-inn/">Josh Jiwoon Inn</a>, with AI-assisted drafting. The <a href="/terms/">terms of use</a> spell out both.',
        ],
      },
    ],
    related: ["editorial-policy", "methodology", "ai-disclosure"],
  },
  {
    slug: "advertising-policy",
    eyebrow: "Advertising Policy",
    title: "Commercial messages stay separate from the infrastructure record.",
    description: "How Compute Current separates advertising, sponsorship, affiliate links, and editorial reporting.",
    lede: "Compute Current may earn revenue through advertisements, sponsorships, and affiliate links. Those commercial relationships do not buy coverage, conclusions, or placement in editorial reporting.",
    sections: [
      {
        heading: "Advertisements",
        paragraphs: [
          "Paid advertising is visually labeled and kept separate from editorial articles, analysis, and source links. Advertising partners do not receive access to reader data beyond what is disclosed in our privacy policy.",
        ],
      },
      {
        heading: "Sponsorships and affiliate links",
        paragraphs: [
          'Sponsored material is clearly identified. When a link may earn Compute Current a commission, we disclose the affiliate relationship near the link and mark the link with <code>rel="sponsored"</code> where applicable.',
        ],
      },
      {
        heading: "Editorial control",
        paragraphs: [
          "The editorial team retains editorial control over what we cover, how we assess evidence, and what we conclude. Sponsors and advertisers cannot require positive coverage, suppress unfavorable reporting, or approve analysis.",
        ],
      },
      {
        heading: "Invalid activity",
        paragraphs: [
          "Do not click advertisements to support Compute Current, ask others to click them, or use automated or deceptive methods to create ad activity. Invalid clicks harm advertisers and violate our advertising agreements.",
        ],
      },
      {
        heading: "Questions or disclosures",
        paragraphs: [`To ask about an advertising placement, sponsorship disclosure, or an affiliate relationship, contact ${mail}.`],
      },
    ],
    related: ["editorial-policy", "privacy", "contact"],
  },
  {
    slug: "ai-disclosure",
    eyebrow: "AI-assisted Disclosure",
    title: "AI assists the workflow. Source facts set the boundary.",
    description:
      "Disclosure of how Compute Current uses AI-assisted tools for source review, categorization, summarization, drafting, and editorial checks.",
    lede: "Compute Current uses AI-assisted systems to help process source reporting into infrastructure intelligence. We use those systems as editorial tooling, not as a replacement for source attribution or quality controls.",
    sections: [
      {
        heading: "Where AI May Be Used",
        paragraphs: [
          "AI may assist with source review, coverage categorization, summarization, headline options, draft generation, repetition checks, and editorial review.",
        ],
      },
      {
        heading: "Where AI Is Constrained",
        paragraphs: [
          "Generated analysis must use source-specific facts. If the source is incomplete or the item lacks a concrete infrastructure angle, Compute Current avoids turning it into long-form analysis.",
        ],
      },
      {
        heading: "How Korean briefs are made",
        paragraphs: [
          "News briefs are drafted in Korean by an AI model from one linked source and published automatically only after automated checks pass: every figure, and every name written in Latin script, must appear in the source; quotations are capped at a short excerpt and wording too close to the source is rejected; banned phrasing and briefs that repeat an event already covered are rejected; and the source link stays on the page. A brief that fails a check is held or rejected, not published.",
        ],
      },
      {
        heading: "How Readers Can Verify",
        paragraphs: [
          "Article pages display source attribution and link to the original report. Compute Current keeps its own URL for its analysis while making the original reporting easy to verify.",
        ],
      },
      {
        heading: "Who Writes The Current",
        paragraphs: [
          'The Current, our analysis column, is written by <a href="/author/josh-inn/">Josh Jiwoon Inn</a>, Compute Current’s founder and editor, under his own name. Column essays are drafted with AI assistance against source-linked evidence, edited under his direction from a fixed set of published analytical positions, and must pass automated quality, attribution, and originality checks before publication. Each essay is an original work of analysis and opinion rather than a reproduction of any publisher’s article; short quotations are attributed to their source. The column never claims interviews, first-hand reporting, or credentials beyond what the author page states, and every essay lists the sources it argues from.',
        ],
      },
    ],
    related: ["about", "editorial-policy", "methodology"],
  },
  {
    slug: "contact",
    eyebrow: "Contact",
    title: "Route the right AI infrastructure signal.",
    description: "Contact Compute Current with source tips, corrections, methodology feedback, and partnership context.",
    lede: "Compute Current welcomes source tips, corrections, methodology feedback, and partnership context that can improve decision-useful AI infrastructure intelligence.",
    sections: [
      {
        heading: "Desk intake",
        paragraphs: [
          `Send the source URL, market, bottleneck, and why it matters for infrastructure readers to ${mail}.`,
          [
            ["Send a source tip", "Compute Current source tip"],
            ["Share a correction", "Compute Current correction"],
            ["Share methodology feedback", "Compute Current methodology feedback"],
            ["Share partnership context", "Compute Current partnership context"],
          ]
            .map(([label, subject]) => `<a href="mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject ?? "")}">${label}</a>`)
            .join(" · "),
        ],
      },
      {
        heading: "What to include",
        paragraphs: [
          "Your role: investor, operator, developer, vendor, cloud capacity team, or strategy group. The market or bottleneck you need to track. The source URL, correction detail, or methodology question that should be reviewed.",
        ],
      },
      {
        heading: "Best-fit requests",
        paragraphs: [
          "Power and grid diligence, AI data center capacity, tenant movement, cooling readiness, APAC/Korea reads, and capital exposure tracking.",
        ],
      },
    ],
    related: ["methodology", "editorial-policy"],
  },
  {
    slug: "editorial-policy",
    eyebrow: "Editorial Policy",
    title: "Infrastructure intelligence needs source discipline.",
    description:
      "Compute Current editorial standards, source attribution policy, AI-assisted content disclosure, and publication safeguards.",
    lede: "Compute Current uses automated collection and AI-assisted editorial tools, but source discipline, infrastructure relevance, and editing standards determine what appears publicly.",
    sections: [
      {
        heading: "Publication Standard",
        paragraphs: [
          "We do not publish long-form analysis when the source text is incomplete, off-topic, or too thin to support a durable infrastructure read. Narrow but useful items may appear as briefs or source-linked signals.",
        ],
      },
      {
        heading: "Source Attribution",
        paragraphs: [
          "Every article page links to the original source. Compute Current keeps its own URL for the analysis while making the original reporting easy to find.",
        ],
      },
      {
        heading: "AI-assisted Content Disclosure",
        paragraphs: [
          'AI systems may assist with source processing, categorization, summarization, headline options, drafting, and editing checks. The source article remains the authoritative record, and analysis must remain tied to source-specific facts. See the <a href="/ai-disclosure/">AI-assisted disclosure</a> for how Korean briefs are checked.',
        ],
      },
      {
        heading: "Quality Gates",
        paragraphs: [
          "Full Compute Current articles require source-specific facts, a clear infrastructure thesis, repetition checks, and enough evidence to support decision-useful analysis.",
        ],
      },
      {
        heading: "Language Guardrails",
        paragraphs: [
          "We avoid generic repeated infrastructure framing. Drafts are checked for repeated phrases, repeated sentence patterns, repeated paragraph structures, heading similarity, and overly familiar conclusions.",
        ],
      },
    ],
    related: ["about", "methodology", "ai-disclosure"],
  },
  {
    slug: "methodology",
    eyebrow: "Methodology",
    title: "Clear sources. Focused analysis. Nothing hidden.",
    description:
      "The principles behind Compute Current coverage: public sources, clear attribution, infrastructure focus, and reader-first analysis.",
    lede: "Compute Current exists to help readers understand what is actually constraining the AI buildout. These are the principles every published piece follows.",
    sections: [
      {
        heading: "We work from public reporting",
        paragraphs: [
          "Coverage is grounded in publicly available material: news reporting, company announcements, regulatory and financial filings, and primary technical publications. Every article links to the original source it draws on, and the source remains the authoritative record.",
        ],
      },
      {
        heading: "We stay inside our beat",
        paragraphs: [
          "The publication covers the physical and financial layer of AI: power and grid access, data centers, semiconductors and systems, cloud capacity, cooling, policy and siting, and the capital behind all of it. Stories outside that boundary do not get forced into it.",
        ],
      },
      {
        heading: "We separate facts from interpretation",
        paragraphs: [
          "Facts come from the linked source. The added value — why a development matters, who is affected, and what to watch next — is clearly editorial framing, and it must stay consistent with what the source actually supports. When the evidence is thin, we say less, not more.",
        ],
      },
      {
        heading: "We hold analysis to a quality bar",
        paragraphs: [
          "Not every item becomes a full analysis. Pieces are reviewed for accuracy against their source, for repetition, and for whether they genuinely help an infrastructure reader make a decision. Items that fall short run as shorter briefs with a source link, or not at all.",
        ],
      },
      {
        heading: "We disclose how we work",
        paragraphs: [
          'Production combines editorial tooling, including AI assistance, with fixed publication standards — described in the <a href="/ai-disclosure/">AI-assisted disclosure</a> and <a href="/editorial-policy/">editorial policy</a>. Corrections are applied directly to the published page; the fastest way to flag one is <a href="/contact/">the contact desk</a>.',
        ],
      },
    ],
    related: ["about", "editorial-policy", "ai-disclosure"],
  },
  {
    slug: "privacy",
    eyebrow: "Privacy Policy",
    title: "Your data, kept boring on purpose.",
    description: "How Compute Current handles data: server logs, cookies, analytics, and advertising services.",
    lede: "Compute Current is a publicly readable publication. This notice describes the data practices that apply when you read it. Effective date: October 31, 2026.",
    sections: [
      {
        heading: "Who operates this site",
        paragraphs: [`Compute Current publishes AI infrastructure coverage at https://www.computecurrent.com. For any privacy question or request, email ${mail}.`],
      },
      {
        heading: "What we collect automatically",
        paragraphs: [
          "Our hosting provider may process standard server logs, such as IP address, user agent, requested URL, and timestamp, to serve pages, protect the service from abuse, and diagnose failures. The operator sets and reviews applicable retention periods with the hosting provider and professional advisers.",
        ],
      },
      {
        heading: "Analytics and advertising",
        paragraphs: [
          "This site currently loads no analytics or advertising tags. If the operator enables measurement or advertising later, this notice is updated first, and any analytics or advertising cookies load only as the updated notice describes.",
          'When advertising is active, Google and its partners may use cookies, IP addresses, or other identifiers to serve and measure ads, including personalized advertising where applicable. You can control ad personalization in your Google account at <a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">adssettings.google.com</a>, and read how Google uses data from partner sites at <a href="https://policies.google.com/technologies/partner-sites" target="_blank" rel="noopener noreferrer">policies.google.com/technologies/partner-sites</a>.',
        ],
      },
      {
        heading: "Cookies",
        paragraphs: ["The site sets no cookies of its own and stores nothing in your browser."],
      },
      {
        heading: "Legal bases",
        paragraphs: [
          "Legal bases, consent wording, vendor disclosures, and retention periods require operator and legal review for the jurisdictions in which the site is offered. This notice does not determine the legal basis for a particular visitor or location.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          `Depending on your jurisdiction, you may have rights concerning personal data. To submit a privacy request, email ${mail}. The operator will assess requests under the applicable law and the services involved.`,
        ],
      },
      {
        heading: "Children",
        paragraphs: ["This site is professional infrastructure coverage and is not directed to children under 13. We do not knowingly collect personal information from children."],
      },
      {
        heading: "Changes",
        paragraphs: ["If this policy changes materially, the effective date above is updated and the new version is published at this address."],
      },
    ],
    related: ["terms", "editorial-policy", "ai-disclosure", "contact"],
  },
  {
    slug: "terms",
    eyebrow: "Terms of Use",
    title: "Read freely. Decide responsibly.",
    description: "Terms of use for Compute Current: content license, accuracy limits, no investment advice, and linking policy.",
    lede: "By reading Compute Current you agree to these terms. Effective date: July 24, 2026.",
    sections: [
      {
        heading: "What this site is",
        paragraphs: [
          'Compute Current publishes analysis and briefs about AI infrastructure: power, data centers, semiconductors, cloud capacity, cooling, policy, and capital flows. Coverage is source-linked and produced with AI-assisted editorial tooling as described in the <a href="/ai-disclosure/">AI-assisted disclosure</a> and <a href="/editorial-policy/">editorial policy</a>.',
        ],
      },
      {
        heading: "An aggregation and analysis service",
        paragraphs: [
          `The news wire on this site collects, links to, and briefly summarizes articles published by third parties. Wire cards and briefs are pointers to the original reporting, which remains the property and the responsibility of its publisher. Compute Current does not author third-party articles, does not republish their full text, does not vouch for them, and accepts no responsibility for their contents; the linked original is the authoritative version. Publishers who prefer not to be listed can write to ${mail} and the source is removed.`,
        ],
      },
      {
        heading: "The Current is original work",
        paragraphs: [
          'The Current is an original column written by <a href="/author/josh-inn/">Josh Jiwoon Inn</a> with AI-assisted drafting. Its essays are works of original authorship: analysis and opinion argued from cited evidence, not reproductions, translations, or rewrites of any publisher’s article. Short quotations are attributed to their source. Views expressed are the author’s own and are not statements of fact about any company beyond what the cited sources report; the limitation of liability below applies to them as to everything else on the site.',
        ],
      },
      {
        heading: "Not investment, legal, or engineering advice",
        paragraphs: [
          "Content is provided for general information only. Nothing here is investment advice, a recommendation to buy or sell any security, legal advice, or engineering guidance for a specific facility. Verify material facts against the linked primary sources before acting on them.",
        ],
      },
      {
        heading: "Accuracy and corrections",
        paragraphs: [
          `We work from public sources and apply quality checks, but errors can survive. If you find one, email ${mail} with the article link and the source for the correction; corrections are applied to the published page.`,
        ],
      },
      {
        heading: "License and linking",
        paragraphs: [
          "You may link to any page and quote brief excerpts with attribution and a link back. Republishing full articles, scraping the site into a competing feed, or training commercial models on the full text requires written permission. Third-party sources remain the property of their publishers.",
        ],
      },
      {
        heading: "Advertising and third-party links",
        paragraphs: [
          'Pages may carry clearly labeled advertising and links to external sites. We are not responsible for the content, terms, or privacy practices of external destinations. See the <a href="/privacy/">privacy policy</a> for how advertising and measurement cookies are handled.',
        ],
      },
      {
        heading: "No warranty; limitation of liability",
        paragraphs: [
          "The site is provided “as is” without warranties of any kind. To the maximum extent permitted by law, Compute Current is not liable for losses arising from reliance on published content or from interruptions of the service.",
        ],
      },
    ],
    related: ["privacy", "editorial-policy", "methodology", "contact"],
  },
];

const BY_SLUG = new Map(POLICY_PAGES.map((page) => [page.slug, page]));

export function policyPage(slug: string): PolicyPage | null {
  return BY_SLUG.get(slug) ?? null;
}

export function policyTitle(slug: string): string {
  return BY_SLUG.get(slug)?.eyebrow ?? slug;
}
