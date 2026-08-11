# Manage Income Page (Edit/Add/Delete)

## Plan Steps:

### 1. Backend/API (Done)
- [x] server/index.ts: PUT /api/income/:id, DELETE /api/income/:id
- [x] src/lib/financeApi.ts: updateIncomeEntry, deleteIncomeEntry

### 2. Frontend (Done)
- Transform AddIncomePage.tsx to ManageIncomePage
- List incomes cards/grid
- Edit modal form (populate formData)
- Delete confirm + refresh
- New income toggle/button

### 3. Test
- [ ] Add incomes → list
- [ ] Edit → update API/local
- [ ] Delete → remove
- `npm run dev` → /add-income now manage

### 4. UX
- Progress % to target like savings?
- Recurrence toggle explain
- Sort by date/source


