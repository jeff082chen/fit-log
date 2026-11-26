# Fit Log

個人重訓與身體組成紀錄網頁。手機優先，可加到主畫面當 App 使用。

- 網址：https://jeff082chen.github.io/fit-log/
- 前端：Vite + React + TypeScript，部署在 GitHub Pages（推送到 `main` 會自動部署）
- 資料庫：Supabase（Postgres＋登入＋資料列權限，每個帳號只能讀寫自己的資料）

## 功能

| 頁面 | 內容 |
|---|---|
| 看板 | 目前第幾輪 Cycle、持續天數、訓練／休息天數、各項目完成度與尚未進行的項目；點項目就記一筆，可手動開始新 Cycle |
| 訓練 | 依類別（腿／推／拉／引體／核心）記錄每組 kg 與次數，自動帶入上次的內容；單邊動作分左右；估算 1RM 與「與上次比」 |
| 身體 | 日期、體重、體脂率、骨骼肌量；自動算年齡、去脂體重、FFMI、標準化 FFMI 與趨勢圖 |
| 資料 | 匯出 Excel（給 AI 分析）／JSON（完整備份）、匯入、身高與出生日期、Cycle 目標、動作清單 |

## 資料規則

- 訓練：kg 一律記實際使用的總重量（兩顆啞鈴＝兩顆加總、槓鈴含槓）；kg 留空＝沿用前一組；引體輔助存成負數（-20＝輔助 20 kg）。
- 估算 1RM＝max(有效重量 × (1 + 次數/30))；引體的有效重量＝體重＋kg；自重與核心以總次數為進步指標。
- Cycle：各項目達到目標次數後，下一筆紀錄自動進入新的一輪；「開始新 Cycle」可手動換輪。
- 匯出的 Excel 內含「AI 解析說明」頁，開新對話時把檔案交給 AI 即可分析。

## 開發

```bash
npm install
npm run dev      # 本機開發
npm test         # 計算邏輯測試
npm run build
```

資料庫結構在 `supabase/schema.sql`（在 Supabase SQL Editor 執行一次）。
`src/db.ts` 裡的 Supabase URL 與 publishable key 是設計給前端公開使用的，資料由登入與 RLS 保護。
