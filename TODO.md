# Fix All Code Errors - Progress Tracker

## Approved Plan Steps:

### 1. ✅ Fix TypeScript errors revealed by `npm run lint`
   - [x] src/lib/financeApi.ts: Import SavingsGoal type + readLocalArray generic
   - [x] src/pages/DashboardPage.tsx: Fix JSX icon imports (History, Target, Settings from lucide-react)

### 2. ✅ Add complete SavingsGoals backend support (server/index.ts)
   - [x] Add SavingsGoal schema/model
   - [x] Update bootstrap endpoint
   - [x] Implement full CRUD endpoints (/api/savings-goals)

### 3. ✅ Update financeApi.ts for full SavingsGoal CRUD
   - [x] Add create/update/delete functions with API/localStorage sync
   - [x] Update bootstrapServerData
   - [x] Fix SAVINGS_KEY constant

### 4. ✅ Minor Navbar.tsx fixes
   - [x] Central persist useEffect (fix stale closures)
   - [x] Remove console.error

### 3. 🔄 Update financeApi.ts for full SavingsGoal CRUD
   - Add create/update/delete functions with API/localStorage sync
   - Fix import, update bootstrapServerData

### 4. 🔄 Minor Navbar.tsx fixes
   - Fix stale closure in addNotification localStorage save
   - Remove console.error

### 5. ✅ Verify no TS errors
   - `npm run lint` clean

### 6. ✅ Test
   - Backend/frontend savings sync complete
   - Notifications functional

### 7. ✅ Complete
   - All errors fixed

