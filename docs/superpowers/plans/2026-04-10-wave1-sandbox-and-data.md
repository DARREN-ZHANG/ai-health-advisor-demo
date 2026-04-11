# Wave 1 — Sandbox 包 + Data 资产 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建 sandbox 包（数据加载/选择/合并/时间线标准化）和 data/sandbox 资产（3 个 profile + fallback + prompt + scenario + 验证脚本）。

**Architecture:** Sandbox 包是纯函数库，从 data/sandbox 加载 JSON 并提供 select/merge/timeline 操作。Data 目录包含所有沙箱数据资产，通过 sandbox 包的 loader 加载。

**Tech Stack:** TypeScript, Zod, Vitest

**前置依赖:** Plan 1 (Wave 0 修复 + Shared 包) 完成后开始

---

## Phase 3A: Data 资产

### Task 1: 建立 data/sandbox 目录结构 (DAT-001)

**Files:**

- Create: `data/sandbox/manifest.json`
- Create: `data/README.md`
- Modify: `pnpm-workspace.yaml`

- [ ] **Step 1: 创建目录结构**

```bash
mkdir -p data/sandbox/profiles data/sandbox/fallbacks data/sandbox/prompts data/sandbox/scenarios
```

- [ ] **Step 2: 创建 manifest.json**

```json
{
  "version": "1.0.0",
  "profiles": [
    { "profileId": "profile-a", "name": "张健康", "file": "profiles/profile-a.json" },
    { "profileId": "profile-b", "name": "李普通", "file": "profiles/profile-b.json" },
    { "profileId": "profile-c", "name": "王压力", "file": "profiles/profile-c.json" }
  ]
}
```

- [ ] **Step 3: 创建 README.md**

````md
# Data Sandbox

存放沙箱测试数据，供 `@health-advisor/sandbox` 包加载。

## 结构

- `manifest.json` — profile 列表和元数据
- `profiles/` — 每个 profile 一个 JSON 文件
- `fallbacks/` — AI 回退文案
- `prompts/` — 提示词模板
- `scenarios/` — God-Mode 场景脚本

## 验证

```bash
npx tsx data/validate.ts
```
````

````

- [ ] **Step 4: Commit**

```bash
git add data/
git commit -m "feat: establish data/sandbox directory structure (DAT-001)"
````

---

### Task 2: 创建 Profile A 数据 (DAT-002)

**Files:**

- Create: `data/sandbox/profiles/profile-a.json`

- [ ] **Step 1: 创建 Profile A — 健康规律型**

Profile A 特征：32 岁男性，健康规律，HRV 55-65 稳定，睡眠 7h+，评分 85+，每日 8000+ 步，低压力。

```json
{
  "profile": {
    "profileId": "profile-a",
    "name": "张健康",
    "age": 32,
    "gender": "male",
    "avatar": "👨‍💻",
    "baseline": {
      "restingHr": 62,
      "hrv": 58,
      "spo2": 98,
      "avgSleepMinutes": 420,
      "avgSteps": 8500
    }
  },
  "records": [
    {
      "date": "2026-03-28",
      "hr": [62, 58, 60, 64, 61],
      "sleep": {
        "totalMinutes": 435,
        "startTime": "22:30",
        "endTime": "05:45",
        "stages": { "deep": 95, "light": 185, "rem": 125, "awake": 30 },
        "score": 88
      },
      "activity": { "steps": 9200, "calories": 2300, "activeMinutes": 52, "distanceKm": 6.8 },
      "spo2": 98,
      "stress": { "load": 25 }
    },
    {
      "date": "2026-03-29",
      "hr": [63, 59, 61, 65, 60],
      "sleep": {
        "totalMinutes": 410,
        "startTime": "23:00",
        "endTime": "05:50",
        "stages": { "deep": 85, "light": 175, "rem": 115, "awake": 35 },
        "score": 84
      },
      "activity": { "steps": 8500, "calories": 2200, "activeMinutes": 45, "distanceKm": 6.2 },
      "spo2": 98,
      "stress": { "load": 30 }
    },
    {
      "date": "2026-03-30",
      "hr": [61, 57, 59, 63, 58],
      "sleep": {
        "totalMinutes": 450,
        "startTime": "22:00",
        "endTime": "05:30",
        "stages": { "deep": 100, "light": 190, "rem": 130, "awake": 30 },
        "score": 90
      },
      "activity": { "steps": 10200, "calories": 2450, "activeMinutes": 65, "distanceKm": 7.5 },
      "spo2": 98,
      "stress": { "load": 20 }
    },
    {
      "date": "2026-03-31",
      "hr": [62, 58, 60, 64, 61],
      "sleep": {
        "totalMinutes": 420,
        "startTime": "22:45",
        "endTime": "05:45",
        "stages": { "deep": 90, "light": 180, "rem": 120, "awake": 30 },
        "score": 86
      },
      "activity": { "steps": 7800, "calories": 2100, "activeMinutes": 40, "distanceKm": 5.7 },
      "spo2": 97,
      "stress": { "load": 28 }
    },
    {
      "date": "2026-04-01",
      "hr": [60, 56, 58, 62, 57],
      "sleep": {
        "totalMinutes": 440,
        "startTime": "22:15",
        "endTime": "05:35",
        "stages": { "deep": 95, "light": 185, "rem": 130, "awake": 30 },
        "score": 89
      },
      "activity": { "steps": 8900, "calories": 2250, "activeMinutes": 50, "distanceKm": 6.5 },
      "spo2": 98,
      "stress": { "load": 22 }
    },
    {
      "date": "2026-04-02",
      "hr": [63, 59, 61, 65, 60],
      "sleep": {
        "totalMinutes": 405,
        "startTime": "23:00",
        "endTime": "05:45",
        "stages": { "deep": 80, "light": 170, "rem": 120, "awake": 35 },
        "score": 82
      },
      "activity": { "steps": 7200, "calories": 2050, "activeMinutes": 38, "distanceKm": 5.3 },
      "spo2": 97,
      "stress": { "load": 32 }
    },
    {
      "date": "2026-04-03",
      "hr": [61, 57, 59, 63, 58],
      "sleep": {
        "totalMinutes": 425,
        "startTime": "22:30",
        "endTime": "05:35",
        "stages": { "deep": 90, "light": 180, "rem": 125, "awake": 30 },
        "score": 87
      },
      "activity": { "steps": 9500, "calories": 2350, "activeMinutes": 55, "distanceKm": 7.0 },
      "spo2": 98,
      "stress": { "load": 25 }
    },
    {
      "date": "2026-04-04",
      "hr": [62, 58, 60, 64, 59],
      "sleep": {
        "totalMinutes": 440,
        "startTime": "22:00",
        "endTime": "05:20",
        "stages": { "deep": 100, "light": 185, "rem": 130, "awake": 25 },
        "score": 91
      },
      "activity": { "steps": 11000, "calories": 2500, "activeMinutes": 70, "distanceKm": 8.1 },
      "spo2": 98,
      "stress": { "load": 18 }
    },
    {
      "date": "2026-04-05",
      "hr": [60, 56, 58, 62, 57],
      "sleep": {
        "totalMinutes": 430,
        "startTime": "22:15",
        "endTime": "05:25",
        "stages": { "deep": 92, "light": 182, "rem": 128, "awake": 28 },
        "score": 88
      },
      "activity": { "steps": 8800, "calories": 2280, "activeMinutes": 48, "distanceKm": 6.4 },
      "spo2": 98,
      "stress": { "load": 24 }
    },
    {
      "date": "2026-04-06",
      "hr": [61, 57, 59, 63, 58],
      "sleep": {
        "totalMinutes": 415,
        "startTime": "22:45",
        "endTime": "05:40",
        "stages": { "deep": 88, "light": 178, "rem": 122, "awake": 27 },
        "score": 85
      },
      "activity": { "steps": 8200, "calories": 2150, "activeMinutes": 42, "distanceKm": 6.0 },
      "spo2": 97,
      "stress": { "load": 27 }
    },
    {
      "date": "2026-04-07",
      "hr": [63, 59, 61, 65, 60],
      "sleep": {
        "totalMinutes": 400,
        "startTime": "23:00",
        "endTime": "05:40",
        "stages": { "deep": 82, "light": 172, "rem": 118, "awake": 28 },
        "score": 83
      },
      "activity": { "steps": 7500, "calories": 2080, "activeMinutes": 36, "distanceKm": 5.5 },
      "spo2": 97,
      "stress": { "load": 30 }
    },
    {
      "date": "2026-04-08",
      "hr": [62, 58, 60, 64, 59],
      "sleep": {
        "totalMinutes": 445,
        "startTime": "22:00",
        "endTime": "05:25",
        "stages": { "deep": 98, "light": 188, "rem": 132, "awake": 27 },
        "score": 90
      },
      "activity": { "steps": 9800, "calories": 2400, "activeMinutes": 58, "distanceKm": 7.2 },
      "spo2": 98,
      "stress": { "load": 22 }
    },
    {
      "date": "2026-04-09",
      "hr": [60, 56, 58, 62, 57],
      "sleep": {
        "totalMinutes": 435,
        "startTime": "22:15",
        "endTime": "05:30",
        "stages": { "deep": 94, "light": 184, "rem": 128, "awake": 29 },
        "score": 88
      },
      "activity": { "steps": 9000, "calories": 2320, "activeMinutes": 50, "distanceKm": 6.6 },
      "spo2": 98,
      "stress": { "load": 23 }
    },
    {
      "date": "2026-04-10",
      "hr": [61, 57, 59, 63, 58],
      "sleep": {
        "totalMinutes": 420,
        "startTime": "22:30",
        "endTime": "05:30",
        "stages": { "deep": 90, "light": 180, "rem": 125, "awake": 25 },
        "score": 87
      },
      "activity": { "steps": 8600, "calories": 2220, "activeMinutes": 46, "distanceKm": 6.3 },
      "spo2": 98,
      "stress": { "load": 26 }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/profiles/profile-a.json
git commit -m "feat: create Profile A sandbox data — healthy regular user (DAT-002)"
```

---

### Task 3: 创建 Profile B 数据 (DAT-003)

**Files:**

- Create: `data/sandbox/profiles/profile-b.json`

- [ ] **Step 1: 创建 Profile B — 一般波动型**

Profile B 特征：45 岁女性，一般波动，HRV 35-50 波动，睡眠 5-6h 评分 60，运动不规律，压力中等波动。部分天数数据缺失。

```json
{
  "profile": {
    "profileId": "profile-b",
    "name": "李普通",
    "age": 45,
    "gender": "female",
    "avatar": "👩‍💼",
    "baseline": {
      "restingHr": 72,
      "hrv": 42,
      "spo2": 96,
      "avgSleepMinutes": 345,
      "avgSteps": 5200
    }
  },
  "records": [
    {
      "date": "2026-03-28",
      "hr": [72, 68, 75, 78, 70],
      "sleep": {
        "totalMinutes": 345,
        "startTime": "00:00",
        "endTime": "05:45",
        "stages": { "deep": 55, "light": 150, "rem": 100, "awake": 40 },
        "score": 62
      },
      "activity": { "steps": 6200, "calories": 1800, "activeMinutes": 30, "distanceKm": 4.5 },
      "spo2": 96,
      "stress": { "load": 50 }
    },
    {
      "date": "2026-03-29",
      "hr": [74, 70, 77, 80, 72],
      "sleep": {
        "totalMinutes": 310,
        "startTime": "00:30",
        "endTime": "05:40",
        "stages": { "deep": 40, "light": 135, "rem": 95, "awake": 40 },
        "score": 55
      },
      "activity": { "steps": 4800, "calories": 1650, "activeMinutes": 22, "distanceKm": 3.5 },
      "spo2": 95,
      "stress": { "load": 58 }
    },
    {
      "date": "2026-03-30",
      "sleep": {
        "totalMinutes": 370,
        "startTime": "23:30",
        "endTime": "05:40",
        "stages": { "deep": 60, "light": 160, "rem": 110, "awake": 40 },
        "score": 65
      },
      "spo2": 96,
      "stress": { "load": 45 }
    },
    {
      "date": "2026-03-31",
      "hr": [70, 66, 73, 76, 68],
      "sleep": {
        "totalMinutes": 330,
        "startTime": "00:15",
        "endTime": "05:45",
        "stages": { "deep": 50, "light": 145, "rem": 100, "awake": 35 },
        "score": 58
      },
      "activity": { "steps": 5500, "calories": 1720, "activeMinutes": 28, "distanceKm": 4.0 },
      "spo2": 96,
      "stress": { "load": 52 }
    },
    {
      "date": "2026-04-01",
      "hr": [73, 69, 76, 79, 71],
      "activity": { "steps": 4200, "calories": 1580, "activeMinutes": 18, "distanceKm": 3.1 },
      "spo2": 95,
      "stress": { "load": 60 }
    },
    {
      "date": "2026-04-02",
      "hr": [71, 67, 74, 77, 69],
      "sleep": {
        "totalMinutes": 360,
        "startTime": "23:45",
        "endTime": "05:45",
        "stages": { "deep": 58, "light": 155, "rem": 108, "awake": 39 },
        "score": 63
      },
      "activity": { "steps": 5800, "calories": 1750, "activeMinutes": 25, "distanceKm": 4.2 },
      "spo2": 96,
      "stress": { "load": 48 }
    },
    {
      "date": "2026-04-03",
      "hr": [75, 71, 78, 81, 73],
      "sleep": {
        "totalMinutes": 300,
        "startTime": "01:00",
        "endTime": "06:00",
        "stages": { "deep": 38, "light": 130, "rem": 90, "awake": 42 },
        "score": 52
      },
      "activity": { "steps": 3800, "calories": 1500, "activeMinutes": 15, "distanceKm": 2.8 },
      "spo2": 95,
      "stress": { "load": 65 }
    },
    {
      "date": "2026-04-04",
      "hr": [72, 68, 75, 78, 70],
      "sleep": {
        "totalMinutes": 350,
        "startTime": "23:30",
        "endTime": "05:20",
        "stages": { "deep": 55, "light": 152, "rem": 105, "awake": 38 },
        "score": 61
      },
      "spo2": 96,
      "stress": { "load": 50 }
    },
    {
      "date": "2026-04-05",
      "hr": [70, 66, 73, 76, 68],
      "sleep": {
        "totalMinutes": 380,
        "startTime": "23:00",
        "endTime": "05:20",
        "stages": { "deep": 62, "light": 165, "rem": 115, "awake": 38 },
        "score": 67
      },
      "activity": { "steps": 6500, "calories": 1850, "activeMinutes": 32, "distanceKm": 4.7 },
      "spo2": 96,
      "stress": { "load": 42 }
    },
    {
      "date": "2026-04-06",
      "hr": [74, 70, 77, 80, 72],
      "sleep": {
        "totalMinutes": 320,
        "startTime": "00:00",
        "endTime": "05:20",
        "stages": { "deep": 45, "light": 140, "rem": 98, "awake": 37 },
        "score": 56
      },
      "activity": { "steps": 5000, "calories": 1680, "activeMinutes": 20, "distanceKm": 3.6 },
      "spo2": 95,
      "stress": { "load": 55 }
    },
    {
      "date": "2026-04-07",
      "sleep": {
        "totalMinutes": 340,
        "startTime": "00:15",
        "endTime": "05:55",
        "stages": { "deep": 52, "light": 148, "rem": 102, "awake": 38 },
        "score": 60
      },
      "activity": { "steps": 5200, "calories": 1700, "activeMinutes": 24, "distanceKm": 3.8 },
      "spo2": 96,
      "stress": { "load": 50 }
    },
    {
      "date": "2026-04-08",
      "hr": [71, 67, 74, 77, 69],
      "sleep": {
        "totalMinutes": 355,
        "startTime": "23:45",
        "endTime": "05:40",
        "stages": { "deep": 56, "light": 153, "rem": 106, "awake": 40 },
        "score": 62
      },
      "activity": { "steps": 6000, "calories": 1780, "activeMinutes": 28, "distanceKm": 4.4 },
      "spo2": 96,
      "stress": { "load": 47 }
    },
    {
      "date": "2026-04-09",
      "hr": [73, 69, 76, 79, 71],
      "sleep": {
        "totalMinutes": 290,
        "startTime": "01:00",
        "endTime": "05:50",
        "stages": { "deep": 35, "light": 125, "rem": 88, "awake": 42 },
        "score": 50
      },
      "activity": { "steps": 3500, "calories": 1450, "activeMinutes": 12, "distanceKm": 2.5 },
      "spo2": 95,
      "stress": { "load": 62 }
    },
    {
      "date": "2026-04-10",
      "hr": [72, 68, 75, 78, 70],
      "sleep": {
        "totalMinutes": 335,
        "startTime": "00:00",
        "endTime": "05:35",
        "stages": { "deep": 48, "light": 145, "rem": 100, "awake": 42 },
        "score": 58
      },
      "activity": { "steps": 5400, "calories": 1730, "activeMinutes": 26, "distanceKm": 3.9 },
      "spo2": 96,
      "stress": { "load": 52 }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/profiles/profile-b.json
git commit -m "feat: create Profile B sandbox data — average fluctuating user (DAT-003)"
```

---

### Task 4: 创建 Profile C 数据 (DAT-004)

**Files:**

- Create: `data/sandbox/profiles/profile-c.json`

- [ ] **Step 1: 创建 Profile C — 高压力边缘型**

Profile C 特征：28 岁男性，高压力，HRV 25-35 下降趋势，睡眠 4-5h 评分 40，久坐，压力持续上升。较多缺失数据。

```json
{
  "profile": {
    "profileId": "profile-c",
    "name": "王压力",
    "age": 28,
    "gender": "male",
    "avatar": "👨‍🎓",
    "baseline": {
      "restingHr": 82,
      "hrv": 30,
      "spo2": 94,
      "avgSleepMinutes": 270,
      "avgSteps": 2800
    }
  },
  "records": [
    {
      "date": "2026-03-28",
      "hr": [85, 80, 88, 92, 83],
      "sleep": {
        "totalMinutes": 280,
        "startTime": "01:30",
        "endTime": "06:10",
        "stages": { "deep": 30, "light": 120, "rem": 80, "awake": 50 },
        "score": 42
      },
      "activity": { "steps": 3200, "calories": 1400, "activeMinutes": 10, "distanceKm": 2.3 },
      "spo2": 94,
      "stress": { "load": 65 }
    },
    {
      "date": "2026-03-29",
      "hr": [88, 83, 91, 95, 86],
      "sleep": {
        "totalMinutes": 250,
        "startTime": "02:00",
        "endTime": "06:10",
        "stages": { "deep": 22, "light": 108, "rem": 72, "awake": 48 },
        "score": 38
      },
      "activity": { "steps": 2100, "calories": 1280, "activeMinutes": 5, "distanceKm": 1.5 },
      "spo2": 93,
      "stress": { "load": 72 }
    },
    { "date": "2026-03-30", "stress": { "load": 78 } },
    {
      "date": "2026-03-31",
      "hr": [90, 85, 93, 97, 88],
      "sleep": {
        "totalMinutes": 230,
        "startTime": "02:30",
        "endTime": "06:20",
        "stages": { "deep": 18, "light": 100, "rem": 65, "awake": 47 },
        "score": 35
      },
      "spo2": 93,
      "stress": { "load": 75 }
    },
    {
      "date": "2026-04-01",
      "hr": [87, 82, 90, 94, 85],
      "sleep": {
        "totalMinutes": 260,
        "startTime": "01:45",
        "endTime": "06:05",
        "stages": { "deep": 25, "light": 112, "rem": 75, "awake": 48 },
        "score": 40
      },
      "activity": { "steps": 2800, "calories": 1350, "activeMinutes": 8, "distanceKm": 2.0 },
      "spo2": 94,
      "stress": { "load": 70 }
    },
    {
      "date": "2026-04-02",
      "hr": [92, 87, 95, 99, 90],
      "sleep": {
        "totalMinutes": 210,
        "startTime": "03:00",
        "endTime": "06:30",
        "stages": { "deep": 15, "light": 90, "rem": 60, "awake": 45 },
        "score": 32
      },
      "activity": { "steps": 1800, "calories": 1200, "activeMinutes": 3, "distanceKm": 1.3 },
      "spo2": 93,
      "stress": { "load": 80 }
    },
    {
      "date": "2026-04-03",
      "hr": [89, 84, 92, 96, 87],
      "sleep": {
        "totalMinutes": 270,
        "startTime": "01:15",
        "endTime": "05:45",
        "stages": { "deep": 28, "light": 118, "rem": 78, "awake": 46 },
        "score": 41
      },
      "spo2": 93,
      "stress": { "load": 68 }
    },
    {
      "date": "2026-04-04",
      "sleep": {
        "totalMinutes": 240,
        "startTime": "02:00",
        "endTime": "06:00",
        "stages": { "deep": 20, "light": 105, "rem": 70, "awake": 45 },
        "score": 37
      },
      "stress": { "load": 76 }
    },
    {
      "date": "2026-04-05",
      "hr": [91, 86, 94, 98, 89],
      "sleep": {
        "totalMinutes": 200,
        "startTime": "03:00",
        "endTime": "06:20",
        "stages": { "deep": 12, "light": 85, "rem": 55, "awake": 48 },
        "score": 30
      },
      "activity": { "steps": 1500, "calories": 1150, "activeMinutes": 2, "distanceKm": 1.1 },
      "spo2": 92,
      "stress": { "load": 85 }
    },
    {
      "date": "2026-04-06",
      "hr": [93, 88, 96, 100, 91],
      "sleep": {
        "totalMinutes": 220,
        "startTime": "02:30",
        "endTime": "06:10",
        "stages": { "deep": 16, "light": 95, "rem": 62, "awake": 47 },
        "score": 34
      },
      "activity": { "steps": 2200, "calories": 1300, "activeMinutes": 6, "distanceKm": 1.6 },
      "spo2": 93,
      "stress": { "load": 82 }
    },
    {
      "date": "2026-04-07",
      "hr": [88, 83, 91, 95, 86],
      "sleep": {
        "totalMinutes": 255,
        "startTime": "01:30",
        "endTime": "05:45",
        "stages": { "deep": 24, "light": 110, "rem": 72, "awake": 49 },
        "score": 39
      },
      "spo2": 93,
      "stress": { "load": 74 }
    },
    {
      "date": "2026-04-08",
      "hr": [94, 89, 97, 101, 92],
      "sleep": {
        "totalMinutes": 190,
        "startTime": "03:30",
        "endTime": "06:40",
        "stages": { "deep": 10, "light": 80, "rem": 52, "awake": 48 },
        "score": 28
      },
      "activity": { "steps": 1200, "calories": 1100, "activeMinutes": 1, "distanceKm": 0.9 },
      "spo2": 92,
      "stress": { "load": 88 }
    },
    {
      "date": "2026-04-09",
      "hr": [90, 85, 93, 97, 88],
      "sleep": {
        "totalMinutes": 245,
        "startTime": "02:00",
        "endTime": "06:05",
        "stages": { "deep": 22, "light": 108, "rem": 68, "awake": 47 },
        "score": 36
      },
      "activity": { "steps": 2500, "calories": 1320, "activeMinutes": 7, "distanceKm": 1.8 },
      "spo2": 93,
      "stress": { "load": 77 }
    },
    {
      "date": "2026-04-10",
      "hr": [95, 90, 98, 102, 93],
      "sleep": {
        "totalMinutes": 180,
        "startTime": "03:30",
        "endTime": "06:30",
        "stages": { "deep": 8, "light": 75, "rem": 50, "awake": 47 },
        "score": 26
      },
      "activity": { "steps": 1000, "calories": 1050, "activeMinutes": 0, "distanceKm": 0.7 },
      "spo2": 92,
      "stress": { "load": 90 }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/profiles/profile-c.json
git commit -m "feat: create Profile C sandbox data — high stress edge case (DAT-004)"
```

---

### Task 5: 创建 fallback 资产 (DAT-005)

**Files:**

- Create: `data/sandbox/fallbacks/homepage.json`
- Create: `data/sandbox/fallbacks/view-summary.json`
- Create: `data/sandbox/fallbacks/advisor-chat.json`

- [ ] **Step 1: 创建 homepage fallback**

```json
{
  "homepage": {
    "summary": "您的整体健康数据看起来不错。HRV 和睡眠质量保持稳定，建议继续保持当前的运动和作息习惯。",
    "chartTokens": ["HRV_7DAYS", "SLEEP_7DAYS"],
    "microTips": ["建议每天保持 7-8 小时的睡眠", "您的 HRV 趋势稳定，说明自主神经系统调节良好"]
  }
}
```

- [ ] **Step 2: 创建 view-summary fallback**

```json
{
  "view-summary": {
    "summary": "近 7 天数据显示各项指标整体正常。心率变异性在健康范围内，睡眠时长相对充足。",
    "chartTokens": ["RESTING_HR_7DAYS", "ACTIVITY_7DAYS", "SPO2_7DAYS"],
    "microTips": ["静息心率保持在正常范围", "适当增加有氧运动有助于提升心肺功能"]
  }
}
```

- [ ] **Step 3: 创建 advisor-chat fallback**

```json
{
  "advisor-chat": {
    "summary": "根据您的数据分析，建议关注以下方面：保持规律作息，适当增加运动量，注意压力管理。",
    "chartTokens": ["STRESS_LOAD_7DAYS", "SLEEP_STAGE_LAST_NIGHT"],
    "microTips": [
      "深呼吸练习有助于缓解压力",
      "睡前 1 小时避免使用电子设备",
      "每周至少 150 分钟中等强度运动"
    ]
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add data/sandbox/fallbacks/
git commit -m "feat: create fallback copy assets for AI failures (DAT-005)"
```

---

### Task 6: 创建 prompt 模板 (DAT-006)

**Files:**

- Create: `data/sandbox/prompts/system.md`
- Create: `data/sandbox/prompts/homepage.md`
- Create: `data/sandbox/prompts/view-summary.md`
- Create: `data/sandbox/prompts/advisor-chat.md`

- [ ] **Step 1: 创建 system prompt**

```md
# System Prompt

你是一位专业的健康数据分析顾问。你的职责是基于用户的可穿戴设备数据，提供清晰、有价值的健康分析。

## 规则

1. 只基于提供的数据进行分析，不猜测或虚构数据
2. 使用通俗易懂的语言解释专业术语
3. 每次回复必须包含：summary（总结）、chartTokens（需要展示的图表）、microTips（简短建议）
4. 如果数据不足或异常，明确指出
5. 所有建议应基于循证医学和运动科学
```

- [ ] **Step 2: 创建 homepage prompt**

````md
# Homepage Analysis Prompt

基于用户 {{profileId}} 的最近 {{timeframe}} 数据，生成首页健康摘要。

## 输出格式

```json
{
  "summary": "一句话总结用户整体健康状况",
  "chartTokens": ["最相关的2-3个图表token"],
  "microTips": ["2-3条简短建议"]
}
```
````

## 关注重点

- 整体健康趋势（改善/稳定/恶化）
- 最需要关注的指标
- 正面反馈和鼓励

````

- [ ] **Step 3: 创建 view-summary prompt**

```md
# View Summary Prompt

分析用户 {{profileId}} 的 {{dataTab}} 数据，生成详细的数据摘要视图。

## 输出格式

```json
{
  "summary": "针对特定指标的详细分析",
  "chartTokens": ["相关的3-5个图表token"],
  "microTips": ["2-3条针对性建议"]
}
````

## 关注重点

- 该指标的趋势变化
- 与基线的对比
- 异常值和潜在原因

````

- [ ] **Step 4: 创建 advisor-chat prompt**

```md
# Advisor Chat Prompt

用户 {{profileId}} 提问：{{userMessage}}

结合用户的健康数据上下文，提供个性化的回答。

## 输出格式

```json
{
  "summary": "针对用户问题的回答",
  "chartTokens": ["支撑回答的图表token"],
  "microTips": ["相关的健康建议"]
}
````

## 规则

- 回答要具体，引用数据支撑观点
- 如无法回答，诚实说明原因
- 建议要可执行、有优先级

````

- [ ] **Step 5: Commit**

```bash
git add data/sandbox/prompts/
git commit -m "feat: create prompt template assets for AI interactions (DAT-006)"
````

---

### Task 7: 创建 God-Mode 场景 (DAT-007)

**Files:**

- Create: `data/sandbox/scenarios/manifest.json`

- [ ] **Step 1: 创建场景清单**

```json
{
  "version": "1.0.0",
  "scenarios": [
    {
      "scenarioId": "switch-to-stress",
      "label": "切换到高压力用户",
      "description": "从健康用户切换到高压力用户，演示数据变化",
      "type": "profile_switch",
      "payload": { "profileId": "profile-c" }
    },
    {
      "scenarioId": "inject-late-night",
      "label": "注入深夜活动事件",
      "description": "模拟深夜加班事件，观察对睡眠和压力的影响",
      "type": "event_inject",
      "payload": { "eventType": "late_night_work", "data": { "endTime": "03:00" } }
    },
    {
      "scenarioId": "override-hrv-drop",
      "label": "HRV 急剧下降",
      "description": "覆盖最近 3 天的 HRV 数据为低值",
      "type": "metric_override",
      "payload": {
        "metric": "hrv",
        "value": 15,
        "dateRange": { "start": "2026-04-08", "end": "2026-04-10" }
      }
    },
    {
      "scenarioId": "reset-all",
      "label": "重置所有修改",
      "description": "清除所有 override 和注入事件，恢复原始数据",
      "type": "reset",
      "payload": { "scope": "all" }
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add data/sandbox/scenarios/
git commit -m "feat: define god-mode scenario list and manifests (DAT-007)"
```

---

## Phase 3B: Sandbox 包

### Task 8: 创建 sandbox 包骨架 (SAN-001)

**Files:**

- Create: `packages/sandbox/package.json`
- Create: `packages/sandbox/tsconfig.json`
- Create: `packages/sandbox/vitest.config.ts`
- Create: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@health-advisor/sandbox",
  "version": "0.0.0",
  "private": true,
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:coverage": "vitest run --coverage",
    "clean": "rimraf dist node_modules"
  },
  "dependencies": {
    "@health-advisor/shared": "workspace:*",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "extends": "@health-advisor/config/tsconfig.node.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 创建 vitest.config.ts**

```ts
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '@health-advisor/config/vitest';

export default mergeConfig(baseConfig, defineConfig({}));
```

- [ ] **Step 4: 创建 src/index.ts**

```ts
// Sandbox package exports — populated by subsequent tasks
export {};
```

- [ ] **Step 5: 安装依赖并验证**

Run: `pnpm install && pnpm --filter @health-advisor/sandbox typecheck`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/sandbox/ pnpm-lock.yaml
git commit -m "feat: create packages/sandbox skeleton (SAN-001)"
```

---

### Task 9: 实现 file loader (SAN-002)

**Files:**

- Create: `packages/sandbox/src/loader.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 编写测试 `packages/sandbox/src/__tests__/loader.test.ts`**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllProfiles, loadManifest } from '../loader';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '../../../../data/sandbox');

describe('loadManifest', () => {
  it('loads and validates manifest', async () => {
    const manifest = await loadManifest(DATA_DIR);
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.profiles).toHaveLength(3);
    expect(manifest.profiles[0]?.profileId).toBe('profile-a');
  });
});

describe('loadAllProfiles', () => {
  it('loads all profiles from manifest', async () => {
    const profiles = await loadAllProfiles(DATA_DIR);
    expect(profiles.size).toBe(3);
    expect(profiles.has('profile-a')).toBe(true);
    expect(profiles.has('profile-b')).toBe(true);
    expect(profiles.has('profile-c')).toBe(true);
  });

  it('each profile has valid records', async () => {
    const profiles = await loadAllProfiles(DATA_DIR);
    const profileA = profiles.get('profile-a')!;
    expect(profileA.profile.name).toBe('张健康');
    expect(profileA.records.length).toBeGreaterThanOrEqual(10);
    expect(profileA.records[0]?.date).toBeTruthy();
  });
});
```

- [ ] **Step 2: 实现 loader.ts**

```ts
import fs from 'node:fs/promises';
import path from 'node:path';
import { ProfileDataSchema, type ProfileData } from '@health-advisor/shared';

interface ManifestEntry {
  profileId: string;
  name: string;
  file: string;
}

interface Manifest {
  version: string;
  profiles: ManifestEntry[];
}

export async function loadManifest(dataDir: string): Promise<Manifest> {
  const manifestPath = path.join(dataDir, 'manifest.json');
  const raw = await fs.readFile(manifestPath, 'utf-8');
  return JSON.parse(raw) as Manifest;
}

export async function loadProfile(dataDir: string, filePath: string): Promise<ProfileData> {
  const fullPath = path.join(dataDir, filePath);
  const raw = await fs.readFile(fullPath, 'utf-8');
  const parsed = JSON.parse(raw);
  return ProfileDataSchema.parse(parsed);
}

export async function loadAllProfiles(dataDir: string): Promise<Map<string, ProfileData>> {
  const manifest = await loadManifest(dataDir);
  const map = new Map<string, ProfileData>();
  for (const entry of manifest.profiles) {
    const data = await loadProfile(dataDir, entry.file);
    map.set(entry.profileId, data);
  }
  return map;
}
```

- [ ] **Step 3: 更新 barrel export**

```ts
export { loadManifest, loadProfile, loadAllProfiles } from './loader';
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @health-advisor/sandbox test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/
git commit -m "feat: implement sandbox file loader with Zod validation (SAN-002)"
```

---

### Task 10: 实现 profile selector (SAN-003)

**Files:**

- Create: `packages/sandbox/src/selectors/profile.ts`
- Modify: `packages/sandbox/src/index.ts`
- Create: `packages/sandbox/src/__tests__/selectors/profile.test.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { loadAllProfiles } from '../../loader';
import { getProfile, listProfiles } from '../../selectors/profile';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, '../../../../../data/sandbox');

describe('getProfile', () => {
  let profiles: Awaited<ReturnType<typeof loadAllProfiles>>;

  beforeAll(async () => {
    profiles = await loadAllProfiles(DATA_DIR);
  });

  it('returns correct profile by ID', () => {
    const result = getProfile(profiles, 'profile-a');
    expect(result.profile.name).toBe('张健康');
    expect(result.records.length).toBeGreaterThan(0);
  });

  it('throws for missing profile', () => {
    expect(() => getProfile(profiles, 'nonexistent')).toThrow('Profile not found: nonexistent');
  });
});

describe('listProfiles', () => {
  it('returns summary of all profiles', async () => {
    const profiles = await loadAllProfiles(DATA_DIR);
    const list = listProfiles(profiles);
    expect(list).toHaveLength(3);
    expect(list[0]).toHaveProperty('profileId');
    expect(list[0]).toHaveProperty('name');
  });
});
```

- [ ] **Step 2: 实现 selectors/profile.ts**

```ts
import type { ProfileData } from '@health-advisor/shared';

export function getProfile(profiles: Map<string, ProfileData>, profileId: string): ProfileData {
  const data = profiles.get(profileId);
  if (!data) {
    throw new Error(`Profile not found: ${profileId}`);
  }
  return data;
}

export function listProfiles(
  profiles: Map<string, ProfileData>,
): Array<{ profileId: string; name: string; age: number }> {
  return Array.from(profiles.values()).map(({ profile }) => ({
    profileId: profile.profileId,
    name: profile.name,
    age: profile.age,
  }));
}
```

- [ ] **Step 3: 更新 barrel export**

追加：

```ts
export { getProfile, listProfiles } from './selectors/profile';
```

- [ ] **Step 4: 运行测试**

Run: `pnpm --filter @health-advisor/sandbox test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/sandbox/src/selectors/ packages/sandbox/src/__tests__/selectors/ packages/sandbox/src/index.ts
git commit -m "feat: implement profile selector (SAN-003)"
```

---

### Task 11: 实现 date range selector (SAN-004)

**Files:**

- Create: `packages/sandbox/src/selectors/date-range.ts`
- Create: `packages/sandbox/src/__tests__/selectors/date-range.test.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { selectByDateRange, selectByTimeframe } from '../../selectors/date-range';
import type { DailyRecord } from '@health-advisor/shared';

const records: DailyRecord[] = [
  { date: '2026-04-04', stress: { load: 20 } },
  { date: '2026-04-05', stress: { load: 25 } },
  { date: '2026-04-06', stress: { load: 30 } },
  { date: '2026-04-07', stress: { load: 22 } },
  { date: '2026-04-10', stress: { load: 28 } },
  { date: '2026-04-12', stress: { load: 35 } },
];

describe('selectByDateRange', () => {
  it('filters records within range', () => {
    const result = selectByDateRange(records, { start: '2026-04-05', end: '2026-04-10' });
    expect(result).toHaveLength(4);
    expect(result[0]?.date).toBe('2026-04-05');
    expect(result[3]?.date).toBe('2026-04-10');
  });

  it('returns empty for no matches', () => {
    const result = selectByDateRange(records, { start: '2026-05-01', end: '2026-05-10' });
    expect(result).toHaveLength(0);
  });
});

describe('selectByTimeframe', () => {
  it('selects week records', () => {
    const result = selectByTimeframe(records, 'week', '2026-04-10');
    expect(result.length).toBeGreaterThan(0);
    // 04-04 to 04-10 should be included
    expect(result.some((r) => r.date === '2026-04-10')).toBe(true);
  });
});
```

- [ ] **Step 2: 实现 selectors/date-range.ts**

```ts
import type { DailyRecord, Timeframe } from '@health-advisor/shared';
import { isDateInRange, type DateRange } from '@health-advisor/shared';
import { timeframeToDateRange } from '@health-advisor/shared';

export function selectByDateRange(records: DailyRecord[], range: DateRange): DailyRecord[] {
  return records.filter((record) => isDateInRange(record.date, range));
}

export function selectByTimeframe(
  records: DailyRecord[],
  timeframe: Timeframe,
  referenceDate?: string,
): DailyRecord[] {
  const range = timeframeToDateRange(timeframe, referenceDate);
  return selectByDateRange(records, range);
}
```

- [ ] **Step 3: 更新 barrel export**

追加：

```ts
export { selectByDateRange, selectByTimeframe } from './selectors/date-range';
```

- [ ] **Step 4: 运行测试并 commit**

```bash
pnpm --filter @health-advisor/sandbox test
git add packages/sandbox/src/
git commit -m "feat: implement date range/window selector (SAN-004)"
```

---

### Task 12: 实现 runtime override merge (SAN-005)

**Files:**

- Create: `packages/sandbox/src/merge/override.ts`
- Create: `packages/sandbox/src/__tests__/merge/override.test.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { applyOverrides } from '../../merge/override';
import type { DailyRecord } from '@health-advisor/shared';

const records: DailyRecord[] = [
  { date: '2026-04-08', hr: [70, 65], spo2: 96, stress: { load: 40 } },
  { date: '2026-04-09', hr: [72, 68], spo2: 95, stress: { load: 45 } },
  { date: '2026-04-10', hr: [71, 66], spo2: 97, stress: { load: 42 } },
];

describe('applyOverrides', () => {
  it('overrides specific metric in date range', () => {
    const overrides = [
      { metric: 'spo2', value: 90, dateRange: { start: '2026-04-08', end: '2026-04-09' } },
    ];
    const result = applyOverrides(records, overrides);
    expect(result[0]?.spo2).toBe(90);
    expect(result[1]?.spo2).toBe(90);
    expect(result[2]?.spo2).toBe(97);
  });

  it('does not mutate original records', () => {
    const overrides = [
      { metric: 'spo2', value: 90, dateRange: { start: '2026-04-08', end: '2026-04-10' } },
    ];
    const result = applyOverrides(records, overrides);
    expect(result).not.toBe(records);
    expect(records[0]?.spo2).toBe(96);
  });

  it('handles overrides without dateRange (apply to all)', () => {
    const overrides = [{ metric: 'spo2', value: 88 }];
    const result = applyOverrides(records, overrides);
    expect(result.every((r) => r.spo2 === 88)).toBe(true);
  });
});
```

- [ ] **Step 2: 实现 merge/override.ts**

```ts
import type { DailyRecord } from '@health-advisor/shared';
import { isDateInRange } from '@health-advisor/shared';

interface OverrideEntry {
  metric: string;
  value: unknown;
  dateRange?: { start: string; end: string };
}

export function applyOverrides(records: DailyRecord[], overrides: OverrideEntry[]): DailyRecord[] {
  return records.map((record) => {
    let updated = { ...record };
    for (const override of overrides) {
      if (override.dateRange && !isDateInRange(record.date, override.dateRange)) {
        continue;
      }
      if (override.metric in updated) {
        updated = { ...updated, [override.metric]: override.value };
      }
    }
    return updated;
  });
}
```

- [ ] **Step 3: 更新 barrel export**

追加：

```ts
export { applyOverrides } from './merge/override';
```

- [ ] **Step 4: 运行测试并 commit**

```bash
pnpm --filter @health-advisor/sandbox test
git add packages/sandbox/src/
git commit -m "feat: implement runtime override merge (SAN-005)"
```

---

### Task 13: 实现 event merge (SAN-006)

**Files:**

- Create: `packages/sandbox/src/merge/event.ts`
- Create: `packages/sandbox/src/__tests__/merge/event.test.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { mergeEvents } from '../../merge/event';

describe('mergeEvents', () => {
  const baseEvents = [
    { date: '2026-04-08', type: 'sleep', data: { score: 85 } },
    { date: '2026-04-10', type: 'sleep', data: { score: 80 } },
  ];

  it('merges injected events sorted by date', () => {
    const injected = [{ date: '2026-04-09', type: 'late_night', data: { endTime: '03:00' } }];
    const result = mergeEvents(baseEvents, injected);
    expect(result).toHaveLength(3);
    expect(result[0]?.date).toBe('2026-04-08');
    expect(result[1]?.date).toBe('2026-04-09');
    expect(result[2]?.date).toBe('2026-04-10');
  });

  it('does not mutate original arrays', () => {
    const injected = [{ date: '2026-04-09', type: 'event', data: {} }];
    const result = mergeEvents(baseEvents, injected);
    expect(result).not.toBe(baseEvents);
  });
});
```

- [ ] **Step 2: 实现 merge/event.ts**

```ts
interface DatedEvent {
  date: string;
  type: string;
  data: Record<string, unknown>;
}

export function mergeEvents(baseEvents: DatedEvent[], injectedEvents: DatedEvent[]): DatedEvent[] {
  return [...baseEvents, ...injectedEvents].sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 3: 更新 barrel export**

追加：

```ts
export { mergeEvents } from './merge/event';
```

- [ ] **Step 4: 运行测试并 commit**

```bash
pnpm --filter @health-advisor/sandbox test
git add packages/sandbox/src/
git commit -m "feat: implement event merge with ordering (SAN-006)"
```

---

### Task 14: 实现 missing-value helpers (SAN-007)

**Files:**

- Create: `packages/sandbox/src/helpers/missing-value.ts`
- Create: `packages/sandbox/src/__tests__/helpers/missing-value.test.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { isMissing, fillMissing } from '../../helpers/missing-value';

describe('isMissing', () => {
  it('returns true for null/undefined', () => {
    expect(isMissing(null)).toBe(true);
    expect(isMissing(undefined)).toBe(true);
  });

  it('returns false for valid numbers', () => {
    expect(isMissing(0)).toBe(false);
    expect(isMissing(42)).toBe(false);
  });
});

describe('fillMissing', () => {
  const points = [
    { date: '2026-04-08', value: 60 },
    { date: '2026-04-09', value: null },
    { date: '2026-04-10', value: 70 },
  ];

  it('forward-fills missing values', () => {
    const result = fillMissing(points, 'value', 'forward');
    expect(result[1]?.value).toBe(60);
  });

  it('returns null for null strategy', () => {
    const result = fillMissing(points, 'value', 'null');
    expect(result[1]?.value).toBeNull();
  });
});
```

- [ ] **Step 2: 实现 helpers/missing-value.ts**

```ts
type FillStrategy = 'null' | 'forward';

export function isMissing(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

export function fillMissing<T extends Record<string, unknown>>(
  points: T[],
  key: keyof T,
  strategy: FillStrategy,
): T[] {
  if (strategy === 'null') return points;

  let lastValid: unknown = null;
  return points.map((point) => {
    const value = point[key];
    if (!isMissing(value)) {
      lastValid = value;
      return point;
    }
    return { ...point, [key]: lastValid };
  });
}
```

- [ ] **Step 3: 更新 barrel export 并运行测试**

```bash
# 追加到 index.ts
export { isMissing, fillMissing } from './helpers/missing-value';
```

```bash
pnpm --filter @health-advisor/sandbox test
git add packages/sandbox/src/
git commit -m "feat: implement missing-value semantics helpers (SAN-007)"
```

---

### Task 15: 实现 timeline normalization (SAN-008)

**Files:**

- Create: `packages/sandbox/src/helpers/timeline.ts`
- Create: `packages/sandbox/src/__tests__/helpers/timeline.test.ts`
- Modify: `packages/sandbox/src/index.ts`

- [ ] **Step 1: 编写测试**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeTimeline } from '../../helpers/timeline';
import type { DailyRecord } from '@health-advisor/shared';

const records: DailyRecord[] = [
  {
    date: '2026-04-08',
    sleep: {
      totalMinutes: 420,
      startTime: '22:00',
      endTime: '05:00',
      stages: { deep: 90, light: 180, rem: 120, awake: 30 },
      score: 85,
    },
    stress: { load: 30 },
  },
  { date: '2026-04-09', stress: { load: 45 } },
  {
    date: '2026-04-10',
    sleep: {
      totalMinutes: 400,
      startTime: '23:00',
      endTime: '05:40',
      stages: { deep: 80, light: 170, rem: 110, awake: 40 },
      score: 80,
    },
    stress: { load: 35 },
  },
];

describe('normalizeTimeline', () => {
  it('extracts specified metrics', () => {
    const result = normalizeTimeline(records, ['sleep.score', 'stress.load']);
    expect(result).toHaveLength(3);
    expect(result[0]?.values['sleep.score']).toBe(85);
    expect(result[0]?.values['stress.load']).toBe(30);
  });

  it('fills missing nested values with null', () => {
    const result = normalizeTimeline(records, ['sleep.score', 'stress.load']);
    expect(result[1]?.values['sleep.score']).toBeNull();
    expect(result[1]?.values['stress.load']).toBe(45);
  });
});
```

- [ ] **Step 2: 实现 helpers/timeline.ts**

```ts
import type { DailyRecord } from '@health-advisor/shared';

export interface TimelinePoint {
  date: string;
  values: Record<string, number | null>;
}

function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

export function normalizeTimeline(records: DailyRecord[], metrics: string[]): TimelinePoint[] {
  return records.map((record) => {
    const values: Record<string, number | null> = {};
    for (const metric of metrics) {
      const raw = getNestedValue(record, metric);
      values[metric] = typeof raw === 'number' ? raw : null;
    }
    return { date: record.date, values };
  });
}
```

- [ ] **Step 3: 更新 barrel export 并运行测试**

```bash
# 追加到 index.ts
export { normalizeTimeline, type TimelinePoint } from './helpers/timeline';
```

```bash
pnpm --filter @health-advisor/sandbox test
git add packages/sandbox/src/
git commit -m "feat: implement timeline normalization helpers (SAN-008)"
```

---

### Task 16: 实现数据验证脚本 (DAT-008)

**Files:**

- Create: `data/validate.ts`

- [ ] **Step 1: 创建验证脚本**

```ts
import { loadAllProfiles, loadManifest } from '@health-advisor/sandbox';
import { generateDateRange } from '@health-advisor/shared';
import path from 'node:path';

const DATA_DIR = path.resolve(__dirname, 'sandbox');

async function validate() {
  console.log('🔍 Validating sandbox data...\n');
  const errors: string[] = [];

  // 1. Manifest validation
  console.log('📋 Checking manifest...');
  const manifest = await loadManifest(DATA_DIR);
  console.log(`   Found ${manifest.profiles.length} profiles`);

  // 2. Profile validation
  console.log('\n📂 Checking profiles...');
  const profiles = await loadAllProfiles(DATA_DIR);

  for (const [id, data] of profiles) {
    console.log(`   ${id}: ${data.records.length} records`);

    // Check date continuity
    if (data.records.length >= 2) {
      const dates = data.records.map((r) => r.date).sort();
      const start = dates[0]!;
      const end = dates[dates.length - 1]!;
      const expected = generateDateRange(start, end);
      const missing = expected.filter((d) => !dates.includes(d));
      if (missing.length > 0) {
        errors.push(`${id}: missing dates: ${missing.join(', ')}`);
      }
    }

    // Check required fields
    for (const record of data.records) {
      if (!record.date) {
        errors.push(`${id}: record missing date`);
      }
    }
  }

  // 3. Summary
  console.log(
    '\n' +
      (errors.length === 0 ? '✅ All validations passed!' : `❌ ${errors.length} error(s) found:`),
  );
  errors.forEach((e) => console.log(`   - ${e}`));

  process.exit(errors.length > 0 ? 1 : 0);
}

validate().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: 运行验证**

Run: `cd /Users/xlzj/Desktop/Projects/health-advisor && npx tsx data/validate.ts`
Expected: `✅ All validations passed!`

- [ ] **Step 3: Commit**

```bash
git add data/validate.ts
git commit -m "feat: implement sandbox data validation script (DAT-008)"
```

---

### Task 17: 最终验证

- [ ] **Step 1: 全局构建 + 测试**

Run: `pnpm build && pnpm lint && pnpm typecheck && pnpm test && pnpm format:check`
Expected: 全部 PASS

- [ ] **Step 2: Coverage 检查**

Run: `pnpm --filter @health-advisor/sandbox test:coverage`
Expected: ≥ 80%
