<?xml version="1.0" encoding="UTF-8"?>
<!--
  Human-readable rendering for /rss.xml when opened in a browser.
  Feed readers never see this; browsers without XSLT support simply show XML.
-->
<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform" xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="en">
      <head>
        <meta charset="UTF-8"/>
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title><xsl:value-of select="/rss/channel/title"/> — Feed</title>
        <style>
          :root { color-scheme: light; }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            background: #ffffff;
            color: #1d1d1f;
            font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Arial, sans-serif;
            -webkit-font-smoothing: antialiased;
          }
          .wrap { max-width: 720px; margin: 0 auto; padding: 48px 20px 80px; }
          .notice {
            display: flex; gap: 10px; align-items: flex-start;
            padding: 14px 16px; border-radius: 14px;
            background: #f5f5f7; color: #6e6e73; font-size: 14px; line-height: 1.5;
            margin-bottom: 28px;
          }
          .notice strong { color: #1d1d1f; font-weight: 600; }
          h1 { margin: 0 0 6px; font-size: 28px; letter-spacing: -0.02em; }
          .desc { margin: 0 0 18px; color: #6e6e73; font-size: 15px; line-height: 1.5; }
          .actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 36px; }
          .btn {
            display: inline-flex; align-items: center; min-height: 36px; padding: 0 16px;
            border-radius: 999px; text-decoration: none; font-size: 14px; font-weight: 600;
            background: #0071e3; color: #ffffff;
          }
          .btn.quiet { background: #f5f5f7; color: #1d1d1f; }
          .item { padding: 18px 0; border-top: 1px solid rgba(0, 0, 0, 0.08); }
          .item a { color: #1d1d1f; text-decoration: none; font-size: 17px; font-weight: 600; letter-spacing: -0.01em; line-height: 1.35; }
          .item a:hover { color: #0071e3; }
          .item p { margin: 6px 0 0; color: #6e6e73; font-size: 14px; line-height: 1.55; }
          .item .date { display: block; margin-top: 8px; color: #a1a1a6; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="wrap">
          <div class="notice">
            <div>
              <strong>This is the Compute Current news feed.</strong>
              Copy this page&#8217;s address into any feed reader (Feedly, Inoreader, NetNewsWire&#8230;)
              to get every new analysis automatically. It updates several times a day.
            </div>
          </div>
          <h1><xsl:value-of select="/rss/channel/title"/></h1>
          <p class="desc"><xsl:value-of select="/rss/channel/description"/></p>
          <div class="actions">
            <a class="btn" href="/follow/">How to follow</a>
            <a class="btn quiet" href="/">Back to the site</a>
          </div>
          <xsl:for-each select="/rss/channel/item">
            <div class="item">
              <a>
                <xsl:attribute name="href"><xsl:value-of select="link"/></xsl:attribute>
                <xsl:value-of select="title"/>
              </a>
              <p><xsl:value-of select="description"/></p>
              <span class="date"><xsl:value-of select="pubDate"/></span>
            </div>
          </xsl:for-each>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
