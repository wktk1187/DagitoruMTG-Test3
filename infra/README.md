# インフラ構成（Terraform）

## 概要
- Cloud Run, Firestore, Pub/Sub, GCS, Vertex AI, Secret Manager, サービスアカウント、IAM最小権限
- Notion APIキー等はSecret Managerで安全に管理

## 初期セットアップ手順

1. GCPプロジェクト・バケット・サービスアカウント作成
2. `terraform init` で初期化
3. `terraform plan` で差分確認
4. `terraform apply` で本番反映

### 主要変数例（terraform.tfvars推奨）
```hcl
project_id     = "your-gcp-project-id"
region         = "asia-northeast1"
notion_api_key = "sk-..."
```

## セキュリティ・運用注意
- サービスアカウントには**必要最小限のIAMロール**のみ付与
- Notion APIキー等のシークレットは**Secret Manager**で管理し、Cloud Run等の実行サービスアカウントだけに`secretAccessor`権限を付与
- Terraform stateは**GCSバケット＋バージョニング**で保護
- Cloud Logging/Audit Logs有効化推奨

## 追加リソース
- Cloud Run, Firestore, Pub/Sub, GCS, Vertex AI, Cloud Tasks等のリソース定義は用途に応じて追加

---

## 環境分離（Terraform workspace運用例）

Terraformのworkspace機能を使うことで、本番・検証・開発など複数環境を安全に分離して管理できます。

### 1. workspaceの作成・切り替え

```sh
# 新しいworkspaceを作成（例: staging）
terraform workspace new staging

# workspaceを切り替え
terraform workspace select staging
```

### 2. 環境ごとの変数ファイルを用意

- 例: `production.tfvars`, `staging.tfvars`, `dev.tfvars` など
- それぞれのファイルで `project_id` や `bucket_name` などを切り替える

### 3. 適用

```sh
terraform apply -var-file=staging.tfvars
```

### 備考
- workspaceごとにstateファイルが分離されるため、本番・検証のリソース混在リスクを防げます
- 変数ファイルの管理・命名ルールはチームで統一してください

---

ご不明点・追加要件はご指示ください。 