# Secret Manager IaC TODO

## 現状
- シークレット（notion-api-key, slack-bot-token）はGCPコンソールで手動作成・登録している
- Terraformリソース（google_secret_manager_secret, google_secret_manager_secret_version）は一時コメントアウト中
- secretAccessor権限付与リソースのみIaCで管理

## TODO（あとでIaC化・自動化するためのメモ）
- TerraformでSecret Managerシークレット作成・バージョン登録を再度IaC化する
  - providerのバージョンや記法に注意（replication { automatic {} } など）
- シークレット値の管理方法（terraform.tfvarsやCI/CD経由の安全な注入）を決める
- 本番運用時は「手動登録→IaC化」への移行タイミング・手順を明確にする
- 既存のsecretAccessorリソースのsecret_idが手動作成名と一致しているか定期的に確認

---

何か変更・再設計があればこのファイルに追記してください。 