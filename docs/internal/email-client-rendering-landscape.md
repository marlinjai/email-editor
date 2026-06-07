---
title: Email Client Rendering Landscape
type: documentation
summary: Market share, rendering engines, and the practical compatibility tiers (60 / 70 / 80 / 90%) that drive editor and compiler decisions.
tags: [research, mjml, compatibility, email-clients]
date: 2026-04-26
---

# Email Client Rendering Landscape

This document exists to ground architectural decisions in the editor and the MJML compiler. Whenever someone asks "can we just use a nested table here", or "do we need an Outlook fallback for this gradient", the answer depends on which slice of users we are willing to lose. The numbers below set the menu.

## TL;DR

In 2025-2026, three engines render the vast majority of opens:

| Tier | Engines covered | Approx. user share | What it means for output |
|------|-----------------|---------------------|--------------------------|
| 60% | Apple Mail (WebKit) only | ~60% | Modern CSS, flex, gradients, even some custom fonts. Almost anything works. |
| 70-75% | + Gmail (web + mobile, custom engine) | ~70-75% | Drop unsupported pseudo-classes, watch the 102 KB clip, no `<style>` in some Gmail variants. |
| 85-90% | + New Outlook (web + Outlook 365 web + iOS/Android Outlook on WebView) | ~85-90% | Still a web engine but more conservative. Test in Litmus. |
| 95%+ | + Classic Outlook for Windows (Word render engine, 2007 vintage) | ~95-97% | Forces table-only layouts. No flex, no real gradients, no nested table reliability past one level. Conditional comments mandatory. |

The cliff is between 90% and 95%. Crossing it costs a lot of engineering effort (and limits the design system) for the last few percent.

## The numbers, with sources

Apple Mail dominates because Mail Privacy Protection (MPP) inflates its open count. The literal "what client opened this email" varies by tracker, but the order is consistent.

- **Apple Mail (iPhone, iPad, macOS, MPP proxy opens): ~58-60%** of all tracked opens, Litmus, March-September 2025.
- **Gmail (web, iOS, Android): ~29-31%**.
- **Outlook (all variants combined): ~4-5%** of global opens.

Sources:
- [Litmus - Email Client Market Share and Popularity](https://www.litmus.com/email-client-market-share)
- [Email Industry Data Report 2025-2026 (clean.email)](https://clean.email/blog/insights/email-industry-report-2026)
- [Email Client Statistics 2025 (Mailmodo)](https://www.mailmodo.com/guides/email-client-statistics/)

These figures count opens across **all** senders. The picture changes for B2B.

## B2B is a different planet

In enterprise inboxes, Outlook still rules:

- **~60% of Fortune 500 companies use Outlook** as their primary mail client (via Microsoft 365 integration).
- **Outlook 365 + Gmail for Business hold ~71% of the enterprise email market** combined.
- B2B emails convert at ~2.4% on average vs ~3.2% for B2C, reflecting longer cycles.

For a SaaS or consultancy newsletter aimed at corporate buyers, Outlook coverage matters far more than the global 4-5% number suggests. A 4% global share can easily be a 40-60% share of the people you actually care about.

Sources:
- [B2B vs B2C email benchmarks (verified.email)](https://verified.email/blog/email-marketing/b2b-statistics-benchmarks-forecast-2026-2030)
- [Microsoft Outlook market share (6sense)](https://6sense.com/tech/email-management/microsoft-outlook-market-share)
- [Email Industry Data Report (clean.email)](https://clean.email/blog/insights/email-industry-report-2026)

## The Outlook split that actually matters

"Outlook" is not one product. There are three rendering paths, and the legacy one is the only painful one:

1. **New Outlook for Windows** (GA since August 2024, rolling out to enterprise through April 2026): web-engine based, similar to Outlook.com. Behaves like a normal browser. Not a problem.
2. **Outlook on the web, Outlook for Mac, mobile Outlook**: also web-engine based. Behave like a browser. Not a problem.
3. **Classic Outlook for Windows (2016 / 2019 / 2021 / 365 desktop)**: uses the **Microsoft Word 2007 rendering engine**. This is the one that breaks everything modern email developers want to do. The Word engine retires in **October 2026**, but Classic Outlook itself stays supported through 2029 for users who do not migrate.

So during 2026-2029 there is a shrinking but non-zero population of users on Classic Outlook with the Word renderer. Writing for them constrains:

- Layout: table-based only. No flex, no grid, no float reliability. Nested tables work for one level, get unreliable past two.
- Background images: need `mso-` conditional VML.
- Gradients: not supported. Need a flat colour fallback.
- Padding and margin on `<div>`: ignored. Spacing has to live in the table cell.
- Custom fonts: ignored. Falls back to Times New Roman.

Sources:
- [Will the New Outlook for Windows be Better for Email Developers? (Email on Acid)](https://www.emailonacid.com/blog/article/industry-news/new-outlook-for-windows/)
- [Making sense of Outlook's rendering engine (HTeuMeuLeu)](https://www.hteumeuleu.com/2020/outlook-rendering-engine/)
- [Outlook Email Rendering Issues (Litmus)](https://www.litmus.com/blog/a-guide-to-rendering-differences-in-microsoft-outlook-clients)

## What this means for our design choices

For each design decision, pick a tier and stick with it:

- **Newsletter, B2C, modern audience** → target **70-75%** (Apple + Gmail). Nest freely, use modern CSS, ignore Word.
- **Mainstream marketing, mixed audience** → target **85-90%** (add modern Outlook + mobile Outlook). Still mostly web engines. Nest one level safely.
- **Enterprise / B2B / financial / legal** → target **95%+** (add Classic Outlook). Word render constraints apply. No real nesting beyond one level. Treat any nested layout as "best effort with stacked-section fallback".

For the email-editor product specifically, the default audience for the first wave of users is closer to the 70-90% band (consultancy newsletters, small e-commerce, content creators). Classic Outlook compatibility is a stretch goal for the enterprise plan, not a requirement for v1.

## Open questions for the editor

- Do we expose a **client-target setting** in the editor (per template), so the user picks their tier and the compiler enforces it?
- Should the canvas show a **"will not render in Classic Outlook" warning** on blocks that use unsupported features (gradient backgrounds, nested layouts past one level, custom fonts)?
- For nested layouts (depth 2), do we always emit a Classic Outlook fallback (stacked sections), or only when the user opts into the higher-coverage tier?

These are open. They get answered when we design the nesting feature itself.
