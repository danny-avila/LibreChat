# LibreChat DevContainer (簡易セットアップ)

## 使い方
1. VS Codeで開く → コマンドパレット「Dev Containers: Reopen in Container」
2. 初回ビルド完了後、自動で `.devcontainer/post-create.sh` が走り、依存インストールとビルドを実施
3. ルートに `.env` が無い場合、自動でテンプレートから作成されます
4. 起動:
   - バックエンド: `npm run backend:dev`
   - フロント: `cd client && npm run dev -- --host --port 3000`
5. ブラウザで `http://localhost:3000` を表示

## 環境変数
- `.devcontainer/env.template` を `.env` にコピーし、必要に応じて修正
- 最低限: `PORT=3080`, `MONGO_URI=mongodb://mongodb:27017/LibreChat`

## 同梱サービス
- MongoDB (27017), Meilisearch (7700), PostgreSQL/pgvector (5432), RAG API (8000)

## トラブルシュート
- `librechat.yaml` が無いと警告が出ます。必要に応じてルートに配置してください。
- RAG API のDB接続エラーが出る場合は、`.env` の Postgres 資格情報と `docker-compose.yml` の `vectordb` 設定を揃えてください。

