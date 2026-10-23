# Security Policy

## Reporting a vulnerability privately

Please use [GitHub private vulnerability reporting](https://github.com/zheng851228/taiwan-dashboard/security/advisories/new): open this repository's **Security → Advisories → Report a vulnerability**. Do not disclose vulnerability details in public issues or pull requests.

If the button is unavailable, private vulnerability reporting may not be enabled. Open an issue asking only for a private security contact or for private reporting to be enabled, without including vulnerability details, credentials, or exploit steps. See [GitHub's reporting instructions](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/report-privately).

Include the affected component and commit or URL, reproduction steps, expected and actual behavior, and potential impact. Redact credentials and personal information; use minimal, non-destructive examples.

## Scope and response

Reports about the current `main` branch and this project's frontend / Cloudflare Worker integration are welcome, including script injection, unsafe URL handling, server-side credential disclosure, and broken access restrictions. General route accuracy, stale upstream data, and UI defects belong in the bug issue form unless they demonstrate a security impact. Vulnerabilities in third-party services should be reported to their operators; issues in this project's use of those services are in scope.

Maintainers review reports, request clarification where needed, and coordinate fixes and disclosure through a private advisory. There is no guaranteed response or fix deadline, and older revisions do not have a separate maintenance commitment.

## Public browser key and server-side secrets

The MapTiler browser key in `js/map-provider-config.js` is intentionally public: browser map requests must include it. The production key is protected by domain restrictions for the GitHub Pages origin. Merely finding this key in source or browser requests is not a vulnerability. A demonstrated bypass or misuse of those restrictions is still reportable; this exclusion does not cover private server credentials.

TDX credentials, the CWA API key, and private routing credentials belong only on the server side (Worker environment / secrets), never in frontend bundles, issues, logs, or screenshots. Please report accidental exposure privately and do not copy the secret into a public report.

中文簡述：安全問題請使用 GitHub 私人漏洞回報；若未開放，僅公開詢問私下聯絡管道，不公開漏洞細節。MapTiler 瀏覽器金鑰原本即為公開，正式金鑰以網域限制保護；單純發現它不算漏洞。TDX／CWA 等伺服器憑證外洩則應私下回報。
