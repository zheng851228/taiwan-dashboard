#!/bin/bash
# 121-snapshot-honesty.patch 套用腳本
# 在 taiwan-dashboard repo 根目錄執行（patch 檔放在同一目錄）
set -e
git checkout main && git pull --ff-only
git checkout -b 121-snapshot-honesty
git apply --check 121-snapshot-honesty.patch && git apply 121-snapshot-honesty.patch
git add -A
git commit -m "121 裁示落地：快照誠實化＋CI 修復＋部署準備

- 修 CI check.sh（#76 過時斷言，main 曾紅燈）＋ wrangler production 補 PROVIDER_SNAPSHOT_MODE=kv
- 後端：快照強制 fetched_at/source/stale_after＋讀取 gate＋isProxy 自動化斷言；排程失敗告警＋空快照不覆蓋；bbox 護欄
- 前端：「即時」→「快照路況（X 分鐘前）」＋資料時間；降級 UX（誠實的缺席）；首屏 30 秒總結條＋回饋入口；重建 dist
- 測試 253/253 全綠，npm run check exit 0"
git push -u origin 121-snapshot-honesty
echo "完成。回報 Muse 開 PR。"
