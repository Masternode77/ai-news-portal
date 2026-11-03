# D2 시안 HTML 생성기(정적 목업 전용). 헤더·푸터를 4개 화면에 같은 마크업으로 넣기 위해 쓴다.
# 실행: python3 docs/design/d2/_partials.py  → home.html·article.html·article-column.html·list.html
from pathlib import Path

HERE = Path(__file__).parent
IMG = "../../../apps/site/public/generated/articles/"

def head(title):
    return f"""<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{title}</title>
<link rel="stylesheet" href="d2.css" />
</head>
<body>
<a class="skip" href="#main">본문으로 건너뛰기</a>
<div class="mock-banner">D2 시안 · 정적 목업 — "시안 예시" 표시 글은 실제 기사가 아닙니다</div>
"""

def header(current=""):
    links = [
        ("/archive/", "최신"),
        ("/column/", "The Current"),
        ("/category/power-grid/", "전력·계통"),
        ("/category/data-centers/", "데이터센터"),
        ("/category/semiconductors/", "반도체"),
        ("/category/capital-markets/", "자본시장"),
        ("/region/korea/", "한국"),
        ("/about/", "소개"),
    ]
    nav = "\n".join(
        f'    <a href="{h}"{" aria-current=\"page\"" if h == current else ""}>{t}</a>' for h, t in links
    )
    return f"""<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/"><span class="brand-mark" aria-hidden="true"></span>Compute Current <small>AI 인프라 인텔리전스</small></a>
    <nav class="site-nav" aria-label="사이트">
{nav}
    </nav>
  </div>
</header>
"""

FOOTER = """<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <h2>Compute Current</h2>
        <p style="margin:0;max-width:44ch">전력·데이터센터·반도체·자본 — AI 인프라의 병목을 출처와 함께 읽는 한국어 인텔리전스. 브리프는 AI 보조로 작성되고 모든 수치는 출처에 근거합니다.</p>
      </div>
      <div>
        <h2>읽기</h2>
        <ul>
          <li><a href="/archive/">아카이브</a></li>
          <li><a href="/column/">The Current</a></li>
          <li><a href="/author/josh-inn/">Josh Jiwoon Inn</a></li>
          <li><a href="/rss.xml">RSS</a> · <a href="/ko/rss.xml">한국어 RSS</a></li>
        </ul>
      </div>
      <div>
        <h2>정책</h2>
        <ul>
          <li><a href="/about/">About</a></li>
          <li><a href="/editorial-policy/">Editorial Policy</a> · <a href="/methodology/">Methodology</a></li>
          <li><a href="/ai-disclosure/">AI-assisted Disclosure</a></li>
          <li><a href="/advertising-policy/">Advertising</a> · <a href="/privacy/">Privacy</a> · <a href="/terms/">Terms</a></li>
          <li><a href="/contact/">Contact</a></li>
        </ul>
      </div>
    </div>
    <p class="fine">© Compute Current</p>
  </div>
</footer>
</body>
</html>
"""

def write(name, title, current, main):
    (HERE / name).write_text(head(title) + header(current) + main + FOOTER, encoding="utf-8")

# ---------------------------------------------------------------- 홈
S = '<span class="sample">시안 예시</span>'
BRIEFS = [
    ("power-grid", "전력·계통", "2시간 전", "수도권 신규 계통 접속 대기가 길어지며 비수도권 데이터센터 입지 검토가 늘고 있다",
     "브리프 요약 두 줄 자리. 원문이 밝힌 사실과 밝히지 않은 것을 구분해 쓰고, 수치는 출처에 근거한다. 길면 두 줄에서 말줄임 처리한다."),
    ("data-centers", "데이터센터", "5시간 전", "하이퍼스케일 임차 수요, 1단계 RFS 일정이 계약 조건의 중심으로 이동", "요약 자리 — 두 줄 말줄임 확인용 텍스트."),
    ("semiconductors", "반도체", "8시간 전", "HBM 공급 제약이 GPU 클러스터 증설 일정에 미치는 영향", "요약 자리 — 두 줄 말줄임 확인용 텍스트."),
    ("capital-markets", "자본시장", "어제", "데이터센터 프로젝트 파이낸싱, 임차인 신용과 잔존가치 가정이 금리보다 중요해졌다", "요약 자리 — 두 줄 말줄임 확인용 텍스트."),
    ("cooling", "냉각", "어제", "액체 냉각 전환이 랙 밀도 계약 조항을 바꾸는 방식", "요약 자리 — 두 줄 말줄임 확인용 텍스트."),
]

def brief_items():
    out = []
    for i, (cat, label, when, title, summary) in enumerate(BRIEFS):
        cls = ' class="lead"' if i == 0 else ""
        out.append(f"""      <li{cls}><a href="/news/sample-{i}/" data-cat="{cat}">
        <div class="meta"><span class="cat">{label}</span><span class="label">브리프</span><time>{when}</time></div>
        <h3>{title}{S}</h3>
        <p>{summary}</p>
      </a></li>""")
    return "\n".join(out)

COLUMNS = [
    ("col_55e9ccd7116252dd-ercot-s-six-week-demand-record-turns-texas-interconnection-into-a-capacity-gate", "power-grid", "전력·계통", "2026-09-16",
     "ERCOT's six-week demand record turns Texas interconnection into a capacity gate", "/column/ercot-s-six-week-demand-record-turns-texas-interconnection-into-2026-09-16/"),
    ("col_4fcaacca965031d9-cooling-capacity-should-set-the-server-procurement-envelope", "cooling", "냉각", "2026-09-08",
     "Cooling Capacity Should Set the Server Procurement Envelope", "/column/cooling-capacity-should-set-the-server-procurement-envelope-2026-09-08/"),
    ("col_82697d9ea33d8c58-malaysia-s-server-trade-gap-turns-permit-enforcement-into-a-capacity-risk-signal", "supply-chain", "공급망", "2026-10-04",
     "Malaysia’s server-trade gap turns permit enforcement into a capacity-risk signal", "/column/malaysia-server-trade-gap-permit-enforcement-2026-10-04/"),
]

def column_cards():
    return "\n".join(f"""      <a class="card" href="{href}" data-cat="{cat}">
        <div class="card-media"><img src="{IMG}{d}/hero.webp" alt="" loading="lazy" /></div>
        <div class="card-body">
          <div class="meta"><span class="cat">{label}</span><time>{date}</time></div>
          <h3>{title}</h3>
        </div>
      </a>""" for d, cat, label, date, title, href in COLUMNS)

MIXED = [
    ("img", "eia-virginia-peak-load-virginia-s-commercial-power-growth-is-becoming-a-peak-load-test", "power-grid", "전력·계통", "분석", "2026-08-12",
     "Virginia's commercial power growth is becoming a peak-load test", "/news/eia-virginia-peak-load/", ""),
    ("text", None, "regulation", "규제·정책", "브리프", "2일 전",
     "전력 수요 관리 제도 개편안, 대형 부하 사업자의 접속 조건에 무엇을 요구하나" + S, "/news/sample-a/",
     "플레이스홀더 이미지만 있는 브리프는 이미지 대신 카테고리 색 띠와 요약으로 보여 준다(텍스트 카드)."),
    ("text", None, "ai-infrastructure", "AI 인프라", "브리프", "3일 전",
     "추론 수요가 학습 클러스터와 다른 입지 조건을 요구하는 이유" + S, "/news/sample-b/",
     "텍스트 카드 요약 자리 — 세 줄까지 보이고 넘치면 말줄임."),
]

def mixed_cards():
    out = []
    for kind, d, cat, label, lab, date, title, href, summary in MIXED:
        if kind == "img":
            out.append(f"""      <a class="card" href="{href}" data-cat="{cat}">
        <div class="card-media"><img src="{IMG}{d}/hero.webp" alt="" loading="lazy" /></div>
        <div class="card-body">
          <div class="meta"><span class="cat">{label}</span><span class="label">{lab}</span><time>{date}</time></div>
          <h3>{title}</h3>
        </div>
      </a>""")
        else:
            out.append(f"""      <a class="card text" href="{href}" data-cat="{cat}">
        <div class="card-body">
          <div class="meta"><span class="cat">{label}</span><span class="label">{lab}</span><time>{date}</time></div>
          <h3>{title}</h3>
          <p>{summary}</p>
        </div>
      </a>""")
    return "\n".join(out)

CHIPS = [("power-grid", "전력·계통"), ("data-centers", "데이터센터"), ("cloud-capacity", "클라우드 용량"), ("semiconductors", "반도체"),
         ("cooling", "냉각"), ("capital-markets", "자본시장"), ("regulation", "규제·정책"), ("supply-chain", "공급망"), ("ai-infrastructure", "AI 인프라")]

def chips(current=None):
    return "\n".join(
        f'      <a class="chip" data-cat="{s}" href="/category/{s}/"{" aria-current=\"page\"" if s == current else ""}>{t}</a>' for s, t in CHIPS
    )

HERO_DIR = "col_2a7e9ab01954bb9f-i-read-openai-s-monthly-doubling-coding-agent-curve-as-demand-not-as-a-cost-line"

home_main = f"""<main id="main" class="wrap">
  <section class="hero" aria-labelledby="hero-title" data-cat="ai-infrastructure">
    <div class="hero-media"><img src="{IMG}{HERO_DIR}/hero.webp" alt="" /></div>
    <div class="hero-body">
      <div class="meta"><span class="label essay">The Current</span><span class="cat">AI 인프라</span><time>2026-10-11</time></div>
      <h1 id="hero-title"><a href="/column/i-read-openai-s-monthly-doubling-coding-agent-curve-as-demand-no-2026-10-11/">I read OpenAI's monthly-doubling coding-agent curve as demand, not as a cost line</a></h1>
      <p class="deck">Epoch AI finds OpenAI researchers doubling coding-agent use roughly every month, and the list-price dollars attached to that curve measure usage, not what OpenAI pays.</p>
      <div class="byline"><span class="avatar" aria-hidden="true">JI</span><div><strong>Josh Jiwoon Inn</strong><br /><span>Founder &amp; Editor</span></div></div>
      <a class="btn" href="/column/i-read-openai-s-monthly-doubling-coding-agent-curve-as-demand-no-2026-10-11/">칼럼 읽기 →</a>
    </div>
  </section>

  <div class="home-grid section">
    <section aria-labelledby="briefs-title">
      <div class="section-head"><h2 id="briefs-title">최신 브리프</h2><a href="/archive/">전체 보기 →</a></div>
      <ul class="brief-list">
{brief_items()}
      </ul>
    </section>
    <aside>
      <section class="panel" aria-labelledby="current-title">
        <h2 id="current-title">The Current — 최근 칼럼</h2>
        <ol class="mini-list">
          <li><a href="/column/up-to-3-pod-density-is-a-benchmark-not-a-ram-budget-cut-2026-10-06/">Up to 3× pod density is a benchmark, not a RAM budget cut</a></li>
          <li><a href="/column/malaysia-server-trade-gap-permit-enforcement-2026-10-04/">Malaysia’s server-trade gap turns permit enforcement into a capacity-risk signal</a></li>
          <li><a href="/column/brussels-turned-waste-heat-into-a-permit-condition-i-read-the-eu-2026-10-04/">EU data center ratings could make heat reuse a commercial test</a></li>
        </ol>
      </section>
      <section class="panel" aria-labelledby="topics-title">
        <h2 id="topics-title">주제별로 보기</h2>
        <div class="chips">
{chips()}
        </div>
      </section>
    </aside>
  </div>

  <section class="section" aria-labelledby="col-title">
    <div class="section-head"><h2 id="col-title">The Current</h2><a href="/column/">칼럼 전체 →</a></div>
    <div class="cards">
{column_cards()}
    </div>
  </section>

  <section class="section" aria-labelledby="more-title">
    <div class="section-head"><h2 id="more-title">더 읽을거리</h2><a href="/archive/">아카이브 →</a></div>
    <div class="cards">
{mixed_cards()}
    </div>
  </section>

  <section class="cta">
    <div><h2>지난 글 전체</h2><p>브리프·분석·칼럼을 최신순으로 봅니다. RSS로 구독할 수 있습니다.</p></div>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="/archive/">아카이브</a><a class="btn ghost" href="/rss.xml">RSS</a></div>
  </section>
</main>
"""
write("home.html", "D2 시안 — 홈", "", home_main)

# ---------------------------------------------------------------- 기사(브리프, 플레이스홀더 → 이미지 없음)
article_main = f"""<main id="main" class="wrap">
  <article class="article" data-cat="power-grid">
    <div class="article-head">
      <nav class="crumbs" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">/</span><a href="/category/power-grid/">전력·계통</a></nav>
      <h1>수도권 신규 계통 접속 대기가 길어지며 비수도권 데이터센터 입지 검토가 늘고 있다{S}</h1>
      <div class="meta"><span class="cat">전력·계통</span><span class="label">브리프</span><time datetime="2026-11-03T09:00:00+09:00">2026년 11월 3일 09:00</time></div>
      <div class="byline" style="margin-top:16px"><span class="avatar" aria-hidden="true">CC</span><div><strong>Compute Current</strong><br /><span>AI 보조 브리프 · 출처 2건</span></div></div>
    </div>

    <div class="prose">
      <section class="summary-box">
        <div class="kicker">요약</div>
        <p>브리프 요약 문단 자리(`summary_ko`). 원문이 밝힌 사실을 먼저 쓰고, 원문이 밝히지 않은 것을 구분해 적는다. 이 시안의 문장은 레이아웃 확인용이며 실제 사실이 아니다.</p>
        <p>두 번째 문단 자리. 줄 간격 1.7, 본문 폭 680px(약 40자)에서 한국어 줄바꿈이 어절 단위로 끊기는지 확인한다.</p>
      </section>

      <h2>왜 중요한가</h2>
      <p>`why_it_matters_ko` 자리. 본문은 17px, 줄 간격 1.8, `word-break: keep-all`로 어절이 중간에서 끊기지 않는다. 기술 용어는 RFS, PUE, MW처럼 영어 그대로 둔다.</p>
      <p>두 번째 문단 자리. 문단 사이 18px 간격으로 스캔하기 쉽게 한다.</p>

      <section class="lens">
        <h2>Expert Lens</h2>
        <p>`expert_lens_ko` 자리. 편집자의 해석은 배경색 블록으로 사실 요약과 시각적으로 분리한다. 다음에 확인할 신호를 마지막 문장에 둔다.</p>
      </section>

      <h2>출처</h2>
      <ul class="sources">
        <li><a href="#" rel="noopener nofollow">출처 매체 이름 A {S}<span>2026-11-02</span></a></li>
        <li><a href="#" rel="noopener nofollow">출처 매체 이름 B {S}<span>2026-11-01</span></a></li>
      </ul>

      <p class="disclosure">이 브리프는 공개 출처를 바탕으로 AI 보조 도구로 작성됐고 모든 수치는 위 출처에 근거합니다. 작성 방식은 <a href="/ai-disclosure/">AI-assisted Disclosure</a>와 <a href="/methodology/">Methodology</a>에 있습니다.</p>
    </div>
  </article>

  <section class="section" aria-labelledby="rel-title">
    <div class="section-head"><h2 id="rel-title">관련 글</h2><a href="/category/power-grid/">전력·계통 전체 →</a></div>
    <div class="cards">
{column_cards()}
    </div>
  </section>
</main>
"""
write("article.html", "D2 시안 — 기사(브리프)", "", article_main)

# ---------------------------------------------------------------- 기사(칼럼, 실제 이미지)
col_main = f"""<main id="main" class="wrap">
  <article class="article" data-cat="power-grid">
    <div class="article-head">
      <nav class="crumbs" aria-label="위치"><a href="/">홈</a><span aria-hidden="true">/</span><a href="/column/">The Current</a></nav>
      <h1>ERCOT's six-week demand record turns Texas interconnection into a capacity gate</h1>
      <p class="deck">Six weeks of ERCOT load above the 2023 record, alongside a moratorium on new data-center interconnections, means Texas buyers should price interconnection delay as a delivery risk.</p>
      <div class="meta"><span class="label essay">The Current</span><span class="cat">전력·계통</span><time datetime="2026-09-16">2026년 9월 16일</time></div>
      <div class="byline" style="margin-top:16px"><span class="avatar" aria-hidden="true">JI</span><div><strong><a href="/author/josh-inn/">Josh Jiwoon Inn</a></strong><br /><span>Founder &amp; Editor, Compute Current</span></div></div>
    </div>
    <figure class="article-hero">
      <img src="{IMG}col_55e9ccd7116252dd-ercot-s-six-week-demand-record-turns-texas-interconnection-into-a-capacity-gate/hero.webp" alt="" />
      <figcaption>대표 이미지(편집 일러스트)</figcaption>
    </figure>
    <div class="prose">
      <section class="summary-box"><div class="kicker">핵심 주장</div><p>`thesis` / `deck` 자리 — 칼럼은 한 문단 핵심 주장을 상단에 고정한다.</p></section>
      <p>칼럼 본문 자리(`article_body`). 레거시 칼럼 7건은 영어 본문이므로 영어 타이포(같은 17px/1.8)에서도 읽기 폭이 유지되는지 확인한다. The quick brown fox jumps over the lazy dog, repeated to fill a realistic English paragraph width for the column reading measure.</p>
      <h2>Expert Lens</h2>
      <p>섹션 제목은 21px, 위 여백 40px.</p>
      <p class="disclosure">The Current는 Josh Jiwoon Inn이 AI 보조 도구로 초안을 잡고 직접 편집·발행합니다. 인터뷰·현장 취재를 주장하지 않으며, 모든 수치는 출처 매체에 근거합니다. <a href="/ai-disclosure/">AI-assisted Disclosure</a></p>
    </div>
  </article>
</main>
"""
write("article-column.html", "D2 시안 — 기사(칼럼)", "/column/", col_main)

# ---------------------------------------------------------------- 목록(카테고리)
ROWS = [
    (None, "power-grid", "전력·계통", "브리프", "2시간 전", BRIEFS[0][3] + S, BRIEFS[0][4]),
    ("col_55e9ccd7116252dd-ercot-s-six-week-demand-record-turns-texas-interconnection-into-a-capacity-gate", "power-grid", "전력·계통", "The Current", "2026-09-16",
     "ERCOT's six-week demand record turns Texas interconnection into a capacity gate",
     "Six weeks of ERCOT load above the 2023 record, alongside a moratorium on new data-center interconnections, means Texas buyers should price interconnection delay."),
    (None, "power-grid", "전력·계통", "브리프", "3일 전", "대형 부하 접속 요청이 몰리는 변전소, 계통 보강 일정이 입지를 결정한다" + S, "요약 자리 — 텍스트 행(썸네일 없음)."),
    ("eia-data-center-load-timing-data-center-load-is-turning-spare-generation-into-a-timing-problem", "power-grid", "전력·계통", "분석", "2026-08-12",
     "Data-center load is turning spare generation into a timing problem",
     "EIA's high-demand case shows why near-term data-center growth is first a dispatch, fuel, and regional price problem."),
    ("eia-virginia-peak-load-virginia-s-commercial-power-growth-is-becoming-a-peak-load-test", "power-grid", "전력·계통", "분석", "2026-08-12",
     "Virginia's commercial power growth is becoming a peak-load test", "요약 자리."),
]

def rows():
    out = []
    for i, (d, cat, label, lab, date, title, summary) in enumerate(ROWS):
        thumb = f'<div class="thumb"><img src="{IMG}{d}/hero.webp" alt="" loading="lazy" /></div>' if d else ""
        cls = ' class="has-thumb"' if d else ""
        labcls = "label essay" if lab == "The Current" else "label"
        out.append(f"""    <li><a{cls} href="#" data-cat="{cat}">
      {thumb}
      <div>
        <div class="meta"><span class="cat">{label}</span><span class="{labcls}">{lab}</span><time>{date}</time></div>
        <h3>{title}</h3>
        <p>{summary}</p>
      </div>
    </a></li>""")
    return "\n".join(out)

list_main = f"""<main id="main" class="wrap">
  <header class="page-head" data-cat="power-grid">
    <div class="kicker">카테고리</div>
    <h1>전력·계통</h1>
    <p>계통 접속, 전력 조달, 발전·송전 투자 — 데이터센터 입지를 결정하는 전력 문제를 다룹니다. <span class="sample">설명 문구 시안</span></p>
  </header>
  <div class="chips" style="margin:16px 0 20px">
{chips("power-grid")}
  </div>
  <ul class="rows">
{rows()}
  </ul>
  <nav class="pager" aria-label="페이지"><a href="#" rel="prev">← 이전</a><span aria-current="page">1</span><a href="#">2</a><a href="#" rel="next">다음 →</a></nav>
</main>
"""
write("list.html", "D2 시안 — 목록(카테고리)", "/category/power-grid/", list_main)
print("ok")
