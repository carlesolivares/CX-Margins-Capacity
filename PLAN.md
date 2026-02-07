# Plan: Rework CX Manager

## Summary of changes

Simplify to a single-file import model, add team capacity management with people/roles, add project dates (kick-off, go-live, contract termination), and add margin simulation.

---

## 1. Rework data model (`src/types/index.ts`)

**Replace** current Invoice + Project types with a unified `ProjectRow` parsed from a single file:

```
ProjectRow {
  id, account, project,
  runRevenue, deployRevenue,        // "RUN 2026", "Deploy 2026" columns (EUR)
  runConso, deployConso,            // "Run conso 2026", "Deploy conso 2026" columns (JH days)
  isParent,                         // true if row has budget (runRevenue > 0 or deployRevenue > 0)
  kickOff, goLive, contractEnd,     // 3 key dates
}
```

**Add** `TeamMember` type:
```
TeamMember {
  id, name, role (CSM | CS | PMO | FDE | PM | Dev),
  q1Days, q2Days, q3Days, q4Days,  // available days per quarter
  dailyRate,                        // price per JH in EUR
}
```

**Keep** `CustomerMargin` and `TeamCapacity` but update calculations.

## 2. Rework file parser (`src/utils/fileParser.ts`)

Replace both parsers with a single `parseProjectFile()` that reads:
- Column detection: account, project, RUN 2026, Deploy 2026, Run conso 2026, Deploy conso 2026, kick-off, go-live, contract termination
- Parent detection: rows where RUN 2026 > 0 OR Deploy 2026 > 0 are parents; others are children (excluded from margin calc)
- Parse dates from kick-off / go-live / contract termination columns

## 3. Rework margin calculations (`src/utils/margins.ts`)

- **Deployment margin** per account: `(deployRevenue - deployConso * JH_RATE) / deployRevenue`
  - JH_RATE defaults to 400 but can be overridden by team member daily rates in simulation
- **RUN margin** per account: `(runRevenue - runConso * JH_RATE) / runRevenue`
- Only parent rows contribute
- Healthy: deployment >= 20%, RUN >= 80%
- Add simulation function that recalculates margins with adjusted capacity/rates

## 4. Rework store (`src/store/useStore.ts`)

- Replace `useInvoices()` + `useProjects()` with `useProjectData()` (single file)
- Add `useTeamMembers()` for team capacity CRUD
- Add `useSimulation()` for simulation overrides (adjusted days/rates)

## 5. Rework pages

### 5a. **Projects page** (simplified single-file import)
- Single file upload replacing both Invoices and Projects pages
- Table showing: Account, Project, Deploy Revenue, RUN Revenue, Deploy Conso (JH), RUN Conso (JH), Kick-off, Go-live, Contract End, Parent/Child badge
- Remove the old Invoices page entirely

### 5b. **New Team page** (`src/pages/Team.tsx`)
- Add/edit/delete team members
- Form: name, role (dropdown: CSM/CS/PMO/FDE/PM/Dev), Q1/Q2/Q3/Q4 days, daily rate
- Table showing all team members with totals
- Summary cards: total capacity per quarter, total capacity by role

### 5c. **New Simulation page** (`src/pages/Simulation.tsx`)
- Show current margins per customer
- Sliders/inputs to adjust: number of people per role, days per quarter, daily rates
- Real-time recalculation of margins based on adjusted capacity
- Side-by-side comparison: current vs simulated margins

### 5d. **Dashboard** (updated)
- Updated KPIs with new data model
- Timeline view showing project phases (deployment vs RUN) based on dates
- Updated charts

## 6. Update sidebar navigation

Replace: Dashboard | Invoices | Projects
With: Dashboard | Projects | Team | Simulation

## 7. Files to create/modify

**Modify:**
- `src/types/index.ts` - new data model
- `src/store/useStore.ts` - new hooks
- `src/utils/fileParser.ts` - single file parser
- `src/utils/margins.ts` - updated calculations + simulation
- `src/pages/Dashboard.tsx` - updated dashboard
- `src/components/KPICards.tsx` - updated KPIs
- `src/components/MarginTable.tsx` - updated table
- `src/components/MarginChart.tsx` - minor updates
- `src/components/CapacityChart.tsx` - updated for team data
- `src/App.tsx` - new navigation + pages
- `src/App.css` - styles for new components

**Delete:**
- `src/pages/Invoices.tsx` - replaced by unified Projects page

**Create:**
- `src/pages/Team.tsx` - team capacity management
- `src/pages/Simulation.tsx` - margin simulation
