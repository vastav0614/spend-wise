<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SpendWise

This project uses a Vite React frontend, an Express API, and SQLite for persistent local storage.

## Run Locally

**Prerequisites:** Node.js 22.5 or later (the project uses Node's built-in SQLite support).

1. Install dependencies with `npm install`
2. Create a `.env` file from `.env.example`
3. Optionally set `SQLITE_PATH` in `.env` to choose where the database file is saved
4. Start both services with `npm run dev:full`

The database is created automatically at `data/spendwise.sqlite`. Monetary values are stored as integer cents so expense, income, budget, EMI, and savings totals remain exact. The frontend calls `/api/*`, which is proxied to the Express server during local development.
