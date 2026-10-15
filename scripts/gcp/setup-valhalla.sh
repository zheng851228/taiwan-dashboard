#!/usr/bin/env bash
# One-time (idempotent) Google Cloud setup for the Valhalla Cloud Run service.
# Run in Google Cloud Shell:  bash scripts/gcp/setup-valhalla.sh [PROJECT_ID]
set -euo pipefail

REPO_SLUG="zheng851228/taiwan-dashboard"
REGION="asia-east1"
AR_REPO="valhalla"
SERVICE="valhalla-tw"
POOL="github"
PROVIDER="github-oidc"
KEY_FILE="$HOME/valhalla-invoker-key.json"

PROJECT_ID="${1:-$(gcloud config get-value project 2>/dev/null || true)}"
if [ -z "$PROJECT_ID" ] || [ "$PROJECT_ID" = "(unset)" ]; then
  echo "找不到 PROJECT_ID。請執行: bash $0 <PROJECT_ID>" >&2
  exit 1
fi
echo "使用專案: $PROJECT_ID  (區域: $REGION)"
read -r -p "確認使用此專案? [y/N] " ans
case "$ans" in y|Y|yes|YES) ;; *) echo "已取消"; exit 1 ;; esac

gcloud config set project "$PROJECT_ID" >/dev/null
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
SA_DOMAIN="${PROJECT_ID}.iam.gserviceaccount.com"
RUNTIME_SA="valhalla-runtime@${SA_DOMAIN}"
DEPLOY_SA="valhalla-deployer@${SA_DOMAIN}"
INVOKER_SA="valhalla-invoker@${SA_DOMAIN}"

step() { printf '\n== %s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; }

step "1/7 啟用 API"
gcloud services enable run.googleapis.com artifactregistry.googleapis.com iam.googleapis.com \
  iamcredentials.googleapis.com sts.googleapis.com cloudresourcemanager.googleapis.com

step "2/7 Artifact Registry"
if ! gcloud artifacts repositories describe "$AR_REPO" --location "$REGION" >/dev/null 2>&1; then
  gcloud artifacts repositories create "$AR_REPO" --repository-format=docker \
    --location "$REGION" --description="Valhalla Taiwan images"
fi
POLICY_FILE="$(mktemp)"
cat > "$POLICY_FILE" <<'JSON'
[
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"tagState": "any"}},
  {"name": "keep-newest-2", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}}
]
JSON
gcloud artifacts repositories set-cleanup-policies "$AR_REPO" --location "$REGION" \
  --policy="$POLICY_FILE" --no-dry-run \
  || warn "無法設定清理政策(可略過,workflow 也會自行清理舊映像)"
rm -f "$POLICY_FILE"

step "3/7 服務帳戶與權限"
for sa in valhalla-runtime valhalla-deployer valhalla-invoker; do
  gcloud iam service-accounts describe "${sa}@${SA_DOMAIN}" >/dev/null 2>&1 \
    || gcloud iam service-accounts create "$sa" --display-name "$sa"
done
# Give IAM a moment to propagate new service accounts.
sleep 5

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/run.admin --condition=None >/dev/null
# repoAdmin (scoped to this one repo) = writer + permission to delete old images for pruning.
gcloud artifacts repositories add-iam-policy-binding "$AR_REPO" --location "$REGION" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/artifactregistry.repoAdmin >/dev/null
gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
  --member "serviceAccount:${DEPLOY_SA}" --role roles/iam.serviceAccountUser >/dev/null

step "4/7 Workload Identity Federation (GitHub: ${REPO_SLUG})"
gcloud iam workload-identity-pools describe "$POOL" --location global >/dev/null 2>&1 \
  || gcloud iam workload-identity-pools create "$POOL" --location global --display-name "GitHub"
if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --workload-identity-pool "$POOL" --location global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --workload-identity-pool "$POOL" --location global \
    --issuer-uri "https://token.actions.githubusercontent.com" \
    --attribute-mapping "google.subject=assertion.sub,attribute.repository=assertion.repository" \
    --attribute-condition "assertion.repository=='${REPO_SLUG}'"
fi
WIF_PROVIDER="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
gcloud iam service-accounts add-iam-policy-binding "$DEPLOY_SA" \
  --role roles/iam.workloadIdentityUser \
  --member "principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO_SLUG}" >/dev/null

step "5/7 Cloud Run invoker 權限"
SERVICE_URL=""
if gcloud run services describe "$SERVICE" --region "$REGION" >/dev/null 2>&1; then
  gcloud run services add-iam-policy-binding "$SERVICE" --region "$REGION" \
    --member "serviceAccount:${INVOKER_SA}" --role roles/run.invoker >/dev/null
  SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
  echo "已授權 ${INVOKER_SA} 呼叫 ${SERVICE}"
else
  echo "Cloud Run 服務 ${SERVICE} 尚未存在(第一次部署後才有)。"
  echo "為了不給整個專案過大的權限,invoker 角色改在服務上授權。"
  echo "第一次 workflow 部署成功後,請再執行一次本腳本(可重複執行),或手動執行:"
  echo "  gcloud run services add-iam-policy-binding ${SERVICE} --region ${REGION} \\"
  echo "    --member serviceAccount:${INVOKER_SA} --role roles/run.invoker"
fi

step "6/7 invoker 金鑰"
if [ -s "$KEY_FILE" ]; then
  echo "金鑰檔已存在: $KEY_FILE (略過建立)"
else
  KEY_ERR="$(mktemp)"
  if gcloud iam service-accounts keys create "$KEY_FILE" --iam-account "$INVOKER_SA" 2>"$KEY_ERR"; then
    chmod 600 "$KEY_FILE"
    rm -f "$KEY_ERR"
    cat <<MSG
金鑰已建立: $KEY_FILE
請在你的 Mac 上(repo 的 worker 目錄)把金鑰存成 Worker secret:
  1. 先把金鑰內容帶到 Mac(例如 Cloud Shell 的「下載」功能下載 $KEY_FILE 為 key.json)
  2. cd worker && npx wrangler secret put GCP_SERVICE_ACCOUNT_KEY --env production < key.json
  3. 完成後刪除 Mac 上的 key.json, 並在 Cloud Shell 執行: rm -f $KEY_FILE
MSG
    read -r -p "已存好 secret 並要現在刪除 Cloud Shell 上的金鑰檔? [y/N] " del
    case "$del" in y|Y|yes|YES) rm -f "$KEY_FILE"; echo "已刪除 $KEY_FILE" ;; *) echo "請記得之後執行: rm -f $KEY_FILE" ;; esac
  else
    if grep -qi 'disableServiceAccountKeyCreation\|constraint' "$KEY_ERR"; then
      warn "你的組織政策 (iam.disableServiceAccountKeyCreation) 禁止建立服務帳戶金鑰。"
      warn "請請組織管理員放行此專案,或改用其他驗證方式(例如 Worker 端改用 WIF)。"
    else
      warn "建立金鑰失敗:"; cat "$KEY_ERR" >&2
    fi
    rm -f "$KEY_ERR"
  fi
fi

step "7/7 預算 (選用, 每月 1 美元)"
BILLING="$(gcloud billing projects describe "$PROJECT_ID" --format='value(billingAccountName)' 2>/dev/null || true)"
BILLING_ID="${BILLING#billingAccounts/}"
if [ -z "$BILLING_ID" ]; then
  warn "此專案未綁定帳單帳戶或無權限查詢,略過預算設定。"
else
  gcloud services enable billingbudgets.googleapis.com >/dev/null 2>&1 || true
  if gcloud billing budgets list --billing-account "$BILLING_ID" --format='value(displayName)' 2>/dev/null \
      | grep -qx "valhalla-${PROJECT_ID}"; then
    echo "預算已存在,略過"
  else
    gcloud billing budgets create --billing-account "$BILLING_ID" \
      --display-name "valhalla-${PROJECT_ID}" --budget-amount 1USD \
      --filter-projects "projects/${PROJECT_ID}" \
      --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0 \
      || warn "建立預算失敗(可能權限不足),可到 Console > Billing > Budgets 手動建立"
  fi
fi

cat <<MSG

================ 完成!接下來請設定 ================
GitHub repo (${REPO_SLUG}) > Settings > Secrets and variables > Actions:
  Secrets:
    GCP_WIF_PROVIDER = ${WIF_PROVIDER}
    GCP_DEPLOY_SA    = ${DEPLOY_SA}
  Variables:
    GCP_PROJECT_ID   = ${PROJECT_ID}

然後到 Actions 手動執行 "Valhalla Taiwan image" workflow (workflow_dispatch) 進行第一次部署。
MSG
if [ -n "$SERVICE_URL" ]; then
  echo "Cloud Run URL (設為 Worker 變數 VALHALLA_PRIMARY_URL): ${SERVICE_URL}"
else
  echo "第一次部署成功後,取得 Cloud Run URL:"
  echo "  gcloud run services describe ${SERVICE} --region ${REGION} --format='value(status.url)'"
  echo "把它設為 Worker 變數 VALHALLA_PRIMARY_URL,並重新執行本腳本以授權 invoker。"
fi
