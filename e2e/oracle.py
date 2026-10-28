"""Independent oracle for the browser suites (e2e/README.md).

Generates an adversarial Azure-DevOps-style CSV (oracle-issues.csv) in the current directory and
computes every expected dashboard and chart-builder figure from the specification, using only
the Python standard library. It shares no code with the TypeScript application.

Outputs: oracle-issues.csv, truth-management.json, truth-builder.json.
The data is seeded, so it is identical on every run except for dates relative to today."""
import csv, json, random, datetime as dt, sys

random.seed(20261020)
TODAY = dt.date.today()

# Mapping the verifier will apply in the UI (spec: explicit user decisions).
LABEL = {  # raw -> normalized label
    "Closed": "Closed", "Resolved": "Resolved", "Active": "Active", "New": "New", "Reopened": "Reopened",
    "Ready For QA": "Ready for QA", "Development in progress": "Development in Progress", "Blocked": "Blocked",
    "Removed": "Removed", "Awaiting Vendor": "Awaiting Vendor", "": "(No Status)",
}
CATEGORY = {  # normalized label -> workflow category after the UI mapping
    "Closed": "closed", "Resolved": "closed",
    "Active": "open", "New": "open", "Reopened": "open", "Ready for QA": "open", "Development in Progress": "open", "Blocked": "open",
    "Removed": "unmapped", "Awaiting Vendor": "unmapped", "(No Status)": "unmapped",
}
PRIORITY = {"Critical": "Critical", "High": "High", "Medium": "Medium", "Low": "Low", "TBD": "Unknown", "": "(No Priority)", "Sev-X": "Sev-X"}
HP = ["Critical", "High"]
PEOPLE = ["Ana Silva <ana@example.com>"] + [f"Dev {n:02d}" for n in range(1, 14)]
VARIANTS = {"Ana Silva <ana@example.com>": ["Ana Silva <ana@example.com>", "ANA SILVA <ana@example.com>", "  Ana Silva <ana@example.com> "]}

statuses = list(LABEL.keys())
status_w = [14, 6, 8, 12, 6, 7, 9, 3, 2, 2, 1]
prios = list(PRIORITY.keys())
prio_w = [10, 18, 30, 20, 3, 3, 2]
OFFSETS = [0, 3, 7, 8, 14, 15, 30, 31, 90, 400]  # bucket boundaries 0-7 / 8-14 / 15-30 / >30

rows, truth = [], []
N = 420
for i in range(1, N + 1):
    s = random.choices(statuses, status_w)[0]
    p = random.choices(prios, prio_w)[0]
    if i <= len(PEOPLE):  # first occurrence of each person = canonical spelling
        person = PEOPLE[i - 1]; raw_assignee = person
    else:
        r = random.random()
        if r < 0.08: person, raw_assignee = "Unassigned", ""
        elif r < 0.11: person, raw_assignee = "Unassigned", "Unassigned"
        else:
            # skewed workload so Top-N is meaningful
            person = PEOPLE[min(len(PEOPLE) - 1, int(random.expovariate(0.35)))]
            raw_assignee = random.choice(VARIANTS.get(person, [person]))
    k = i % 13
    if k == 11: created, created_raw = None, ""                       # missing
    elif k == 12: created, created_raw = "invalid", "31/02/2026"      # invalid (31 Feb)
    elif i % 37 == 0:
        d = TODAY + dt.timedelta(days=5); created, created_raw = d, d.strftime("%d/%m/%Y")  # future
    else:
        d = TODAY - dt.timedelta(days=OFFSETS[i % len(OFFSETS)]); created, created_raw = d, d.strftime("%d/%m/%Y")
    rid = str(9000 + i)
    if i in (40, 41, 42): rid = "5001"          # triplicate
    if i in (60, 61): rid = "5002"              # duplicate pair
    if i in (70, 71, 72, 73): rid = ""          # four blank IDs (never duplicates of each other)
    phrase = random.choice(["Login fails", "Crash, on save", 'Report "slow"', "Typo"])
    title = f"V3-MARKER-{i:04d} {phrase}"
    if i == 5: title = "=1+2 V3-MARKER-0005 formula"
    if i == 6: title = "+cmd V3-MARKER-0006 plus"
    rows.append([rid, random.choice(["Bug", "Bug", "Task"]), title, s, raw_assignee, p, random.choice(["1 - Critical", "2 - High", "3 - Medium"]), random.choice(["Web\\Login", "API\\Pay", "Mobile"]), created_raw, ""])
    truth.append({"id": rid, "title": title, "label": LABEL[s], "cat": CATEGORY[LABEL[s]], "priority": PRIORITY[p], "assignee": person, "created": created if isinstance(created, dt.date) else created, "raw_priority": p, "raw_status": s})

header = ["ID", "Work Item Type", "Title", "State", "Assigned To", "Priority", "Severity", "Area Path", "Created Date", "Tags"]
with open("oracle-issues.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f); w.writerow(header); w.writerows(rows)

# ---------- expected figures ----------
def count(pred, recs): return sum(1 for r in recs if pred(r))

def figures(recs):
    total = len(recs)
    by = lambda key: {v: count(lambda r: r[key] == v, recs) for v in sorted({r[key] for r in recs})}
    hp_open = {p: count(lambda r, p=p: r["cat"] == "open" and r["priority"] == p, recs) for p in HP}
    people = sorted({r["assignee"] for r in recs})
    assignees = {}
    for a in people:
        mine = [r for r in recs if r["assignee"] == a]
        assignees[a] = {
            "total": len(mine), "closed": count(lambda r: r["cat"] == "closed", mine), "open": count(lambda r: r["cat"] == "open", mine),
            "Critical": count(lambda r: r["priority"] == "Critical", mine), "High": count(lambda r: r["priority"] == "High", mine),
            "reopened": count(lambda r: r["label"] == "Reopened", mine), "readyForQa": count(lambda r: r["label"] == "Ready for QA", mine),
        }
    matrix_all, matrix_open = {}, {}
    for r in recs:
        matrix_all.setdefault(r["assignee"], {}).setdefault(r["priority"], 0); matrix_all[r["assignee"]][r["priority"]] += 1
        if r["cat"] == "open":
            matrix_open.setdefault(r["assignee"], {}).setdefault(r["priority"], 0); matrix_open[r["assignee"]][r["priority"]] += 1
    # Aging: open records, valid created <= today, whole days.
    buckets = {"0–7 days": 0, "8–14 days": 0, "15–30 days": 0, "More than 30 days": 0}
    future = missing = invalid = 0
    for r in recs:
        if r["cat"] != "open": continue
        c = r["created"]
        if c is None: missing += 1; continue
        if c == "invalid": invalid += 1; continue
        age = (TODAY - c).days
        if age < 0: future += 1; continue
        key = "0–7 days" if age <= 7 else "8–14 days" if age <= 14 else "15–30 days" if age <= 30 else "More than 30 days"
        buckets[key] += 1
    incomplete = count(lambda r: r["raw_status"] == "" or r["cat"] == "unmapped" or r["raw_priority"] == "" or r["raw_priority"] == "Sev-X" or r["id"] == "" or (r["created"] is None and r["cat"] == "open"), recs)
    return {
        "total": total,
        "closed": count(lambda r: r["cat"] == "closed", recs), "open": count(lambda r: r["cat"] == "open", recs),
        "unmapped": count(lambda r: r["cat"] == "unmapped", recs),
        "closureRate": round(100 * count(lambda r: r["cat"] == "closed", recs) / total, 1) if total else None,
        "hpOpen": hp_open, "hpOpenTotal": sum(hp_open.values()),
        "reopened": count(lambda r: r["label"] == "Reopened", recs), "readyForQa": count(lambda r: r["label"] == "Ready for QA", recs),
        "blocked": count(lambda r: r["label"] == "Blocked", recs), "unassigned": count(lambda r: r["assignee"] == "Unassigned", recs),
        "status": by("label"), "priority": by("priority"), "assignees": assignees, "matrixAll": matrix_all, "matrixOpen": matrix_open,
        "aging": {"buckets": buckets, "future": future, "missing": missing, "invalid": invalid},
        "incomplete": incomplete,
        "priorityOpen": {p: count(lambda r, p=p: r["priority"] == p and r["cat"] == "open", recs) for p in sorted({r["priority"] for r in recs})},
    }

valid = truth  # no blank rows in this file
seen, unique = set(), []
for r in valid:
    if r["id"] and r["id"] in seen: continue
    if r["id"]: seen.add(r["id"])
    unique.append(r)

# Data-quality score (spec weights 15,15,15,10,10,15,10,10; pass>=98).
def pct(a, b): return 100 * a / b
dims = {
    "idCompleteness": (15, pct(count(lambda r: r["id"] != "", valid), len(valid))),
    "statusCompleteness": (15, pct(count(lambda r: r["raw_status"] != "", valid), len(valid))),
    "statusMapping": (15, pct(count(lambda r: r["raw_status"] != "" and r["cat"] != "unmapped", valid), count(lambda r: r["raw_status"] != "", valid))),
    "priorityCompleteness": (10, pct(count(lambda r: r["raw_priority"] != "", valid), len(valid))),
    "priorityMapping": (10, pct(count(lambda r: r["raw_priority"] not in ("", "Sev-X"), valid), count(lambda r: r["raw_priority"] != "", valid))),
    "assigneeCompleteness": (15, pct(count(lambda r: True, [r for r, row in zip(valid, rows) if row[4].strip() != ""]), len(valid))),
    "dateValidity": (10, pct(count(lambda r: r["created"] != "invalid" and not (isinstance(r["created"], dt.date) and r["created"] > TODAY), valid), len(valid))),
    "duplicateIds": (10, pct(count(lambda r: r["id"] != "", unique), count(lambda r: r["id"] != "", valid))),
}
overall = sum(w * s for w, s in dims.values()) / sum(w for w, _ in dims.values())

ids = [r["id"] for r in valid if r["id"]]
dup_records = sum(1 for r in valid if r["id"] and ids.count(r["id"]) > 1)
out = {
    "today": TODAY.isoformat(),
    "all": figures(valid),
    "unique": figures(unique),
    "duplicates": {"records": dup_records, "distinct": len({i for i in ids if ids.count(i) > 1}), "extra": len(valid) - len(unique), "blankIds": count(lambda r: r["id"] == "", valid)},
    "quality": {"overall": overall, "dims": {k: v[1] for k, v in dims.items()}},
    "titles": [r["title"] for r in valid],
}
json.dump(out, open("truth-management.json", "w", encoding="utf-8"), default=str, ensure_ascii=False, indent=1)
a = out["all"]
print(f"records={a['total']} closed={a['closed']} open={a['open']} unmapped={a['unmapped']} hpOpen={a['hpOpen']} reopened={a['reopened']} rfqa={a['readyForQa']} unassigned={a['unassigned']} aging={a['aging']} dups={out['duplicates']} dq={overall:.2f}")

# ---------- Custom Chart Builder cross-tabs ----------
def xtab(recs, a, b):
    m = {}
    for r in recs:
        m.setdefault(r[a], {}).setdefault(r[b], 0)
        m[r[a]][r[b]] += 1
    return m

state_assignee = xtab(valid, "label", "assignee")
builder = {
    "total": len(valid),
    "assigneePriority": xtab(valid, "assignee", "priority"),
    "assigneeStatus": xtab(valid, "assignee", "label"),
    "priorityStatus": xtab(valid, "priority", "label"),
    "statusAssigneePct": {s: {a: round(100 * n / sum(row.values()), 1) for a, n in row.items()} for s, row in state_assignee.items()},
    "pctTotalByPriority": {p: round(100 * count(lambda r, p=p: r["priority"] == p, valid) / len(valid), 1) for p in sorted({r["priority"] for r in valid})},
    "openClosed": {c: count(lambda r, c=c: r["cat"] == c, valid) for c in ("open", "closed", "unmapped")},
}
json.dump(builder, open("truth-builder.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
