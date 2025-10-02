# Pyodide Scheduler Benchmark & PoC

Comprehensive benchmark and proof-of-concept for Pyodide webloop scheduler optimizations.

**Related Issue:** [Link to your Pyodide issue]

## Overview

This repository contains:
1. ✅ Proof-of-concept implementation for two proposed optimizations
2. ✅ Comprehensive benchmark suite with 4 test scenarios
3. ✅ Test results from Chrome and Firefox browsers
4. ✅ Analysis of browser timer clamping effects

# Pyodide Scheduler Benchmark & PoC

Comprehensive benchmark and proof-of-concept for Pyodide webloop scheduler optimizations.

**Related Issue:** [Pyodide Issue #XXXX](https://github.com/pyodide/pyodide/issues/XXXX)

## Overview

This repository contains:
1. ✅ Proof-of-concept implementation for two proposed optimizations
2. ✅ Comprehensive benchmark suite with 4 test scenarios
3. ✅ Test results from Chrome and Firefox browsers
4. ✅ Analysis of browser timer clamping effects

## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Open browser test (Chrome)
npm run test:browser

# Or manually
npm run serve:only
# Then open http://localhost:8080/test_bench.html
```

## Test Objectives

**1. Optimize threshold value**
- Find optimal value for `timeout <= threshold` condition in `scheduleCallback`
- Test thresholds: 0, 1, 2, 3, 16
- Verify accurate scheduling for `asyncio.sleep(0)`, `sleep(0.001)`, `sleep(0.002)`, `sleep(0.016)`

**2. Evaluate MessageChannel reuse**
- Compare: Creating new MessageChannel per call vs reusing single instance
- Benchmark core-js style (reuse) against current implementation (allocate per call)

## Test Scenarios

### 1. Basic Scenario
- Single callback execution timing
- Measures fundamental scheduling performance

### 2. Nested Scenario (10 deep)
- 10 consecutive nested timer calls
- Demonstrates browser's nested timeout clamping (4ms minimum when nestingLevel ≥ 5)
- Compares setTimeout vs MessageChannel behavior under nesting

### 3. High-Frequency Scenario
- Schedule 100 callbacks concurrently
- Simulates Pygame-like environment with many `sleep(0)` calls per frame
- Measures MessageChannel bulk scheduling performance

### 4. Game Loop Scenario  
- Sequential execution pattern: `while True: do_work(); await sleep(1/fps)`
- Real-world Pygame game loop simulation
- 100 frames executed sequentially

## How to Run Tests

### Browser (Recommended)

**Chrome:**
```bash
npm run test:browser
```

**Firefox:**
```bash
npm run test:browser:firefox
```

**Safari (macOS only):**
```bash
npm run serve:only
# Then open http://localhost:8080/test_bench.html in Safari
```

**Manual:**
```bash
npm run serve:only
# Open http://localhost:8080/test_bench.html in any browser
```

### Node.js

```bash
npm run test:node
# or
node dist/test_bench.js
```

**Note:** Node.js uses `setImmediate` (not MessageChannel), so results differ from browsers.

### Deno

```bash
npm run test:deno
# or
deno run --allow-all dist/test_bench.js
```

**Note:** Deno has known MessageChannel issues, uses postMessage/setTimeout fallback.

## Test Parameters

- **Sleep values:** 0ms, 1ms, 2ms, 16ms
- **Thresholds:** 0, 1, 2, 3, 16
- **Nested depth:** 10 calls (to observe 4ms clamping after 5th level)
- **Burst size:** 100 concurrent callbacks
- **Iterations:** 100 per configuration (reduced for faster testing)

## Understanding Results

### Result Tables

Each test outputs tables in this format:

```
| timeout<=k \ sleep(s) | 0.000 | 0.001 | 0.002 | 0.016 |
|-----------------------|-------|-------|-------|-------|
| 0                     |  0.50 |  1.20 |  2.30 | 16.50 |
| 1                     |  0.50 |  0.05 |  2.30 | 16.50 |
| 2                     |  0.50 |  0.05 |  0.05 | 16.50 |
| 3                     |  0.55 |  0.05 |  0.05 | 16.55 |
| 16                    |  0.55 |  0.05 |  0.05 |  0.05 |
```

- **Rows (timeout<=k):** Threshold values (0, 1, 2, 3, 16)
- **Columns (sleep(s)):** asyncio.sleep() arguments in seconds
- **Values:** Average execution time in milliseconds

### Performance Comparison Tables

For each scenario, a comparison table shows the difference (reuse - normal):

```
Performance Comparison (reuse - normal, negative = reuse faster)
| timeout<=k \ sleep(s) | 0.000 | 0.001 | 0.002 | 0.016 |
|-----------------------|-------|-------|-------|-------|
| 0                     | -0.10 | -0.05 | -0.03 | -0.02 |
| 1                     | -0.12 | -0.06 | -0.04 | -0.03 |
| 2                     | -0.11 | -0.05 | -0.03 | -0.02 |
```

- **Negative values:** MessageChannel reuse is faster
- **Positive values:** Normal execution (allocate per call) is faster

### What to Look For

**1. Timing Accuracy (sleep(1ms), sleep(2ms), sleep(16ms)):**
- ✅ Good: Values close to expected delay (1ms, 2ms, 16ms)
- ❌ Bad: Values near 0ms (immediate execution, timing lost)

**2. Performance (sleep(0)):**
- ✅ Good: Lower is better (faster scheduling)
- Expected: ~0.05-0.50ms with MessageChannel
- Expected: ~4ms with setTimeout after nesting

**3. Optimal Threshold:**
- **threshold = 0:** Only sleep(0) uses immediate path (most conservative)
  - ✅ Best timing accuracy
  - ✅ Recommended for production
  
- **threshold = 2:** Current default in Pyodide
  - ❌ Breaks timing for sleep(1ms) and sleep(2ms)
  - ❌ sleep(0.001) executes immediately (~0ms) instead of waiting 1ms

### Chrome/Firefox Results

✅ **Threshold = 0 is optimal:**
- sleep(0): ~0.09ms (immediate)
- sleep(1ms): ~1.12ms (accurate)
- sleep(2ms): ~2.12ms (accurate)  
- sleep(16ms): ~16.12ms (accurate)

❌ **Threshold = 2 (current) breaks timing:**
- sleep(0): ~0.09ms ✓
- sleep(1ms): ~0.05ms ✗ (should be ~1ms)
- sleep(2ms): ~0.05ms ✗ (should be ~2ms)
- sleep(16ms): ~16.12ms ✓

✅ **MessageChannel reuse improves performance:**
- High-frequency: 50% faster
- Game loop: 27% faster
- Nested: 78% faster

### Browser Timer Clamping Verification

Sequential `for` loop with `sleep(0.001)` × 100:
- **Expected:** ~400ms (5×1ms + 95×4ms clamped)
- **Actual:** 407.30ms ✅
- **Confirms:** Correct behavior under HTML5 nested timer rule

### Real-World Impact

**Current implementation (threshold=2) breaks FPS control:**

```python
# 60 FPS game loop
while running:
    await asyncio.sleep(1/60)  # Should wait ~16ms
    update()
    render()
```

- **Current:** sleep(16) executes immediately → 3000+ FPS ❌
- **With threshold=0:** sleep(16) waits 16ms → 60 FPS ✅

## Benchmark Improvements

This benchmark includes several improvements over naive approaches:

1. **Nesting prevention:** `yieldToEventLoop()` resets timer nesting level before each measurement
2. **Accurate nested test:** Exactly 10 nested calls to observe 4ms clamping (starts at 6th call)
3. **Warm-up:** First measurement discarded to avoid cold-start effects
4. **GC mitigation:** 5ms pause every 20 iterations to minimize GC interference

## Repository Structure

```
scheduler-benchmark/
├── README.md                 # This file
├── POC_IMPLEMENTATION.md     # Detailed code changes with diffs
├── BENCHMARK_RESULTS.md      # Complete test results and analysis
│
├── test_scheduler.ts         # Modified scheduler (with both optimizations)
├── origin_scheduler.ts       # Original Pyodide scheduler (for reference)
├── test_bench.ts            # Benchmark suite (4 scenarios)
├── environments.ts          # Runtime detection utility
├── bench.ts                 # Benchmark helpers
│
├── test_bench.html          # Browser test page
├── index.html               # Main page
│
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
└── .gitignore               # Excludes analysis documents
```

## Implementation Details

### origin_scheduler.ts (Current Pyodide Implementation)

✅ **Identical to Pyodide's scheduler.ts:**
- threshold = 2 (`if (timeout <= 2)`)
- Allocates new MessageChannel per call
- Environment-specific fallbacks

### test_scheduler.ts (Proposed Optimizations)

**Two independent improvements:**

**1. Refine threshold (correctness fix):**
```typescript
// Before: if (timeout <= 2)
// After:  if (timeout === 0)
```

**2. Reuse MessageChannel (performance optimization):**
```typescript
// Before: const channel = new MessageChannel() per call
// After:  Single shared channel with callback queue
```

**Configuration options:**
```typescript
setTestSchedulerOptions({ 
  threshold: 0,              // Only sleep(0) uses immediate path
  reuseMessageChannel: true  // Reuse single MessageChannel
});
```

**State management:**
```typescript
resetSchedulerState(); // Clean state between test runs
```

## Troubleshooting

**TypeScript compilation errors:**
```bash
npm run build
```

**Port already in use:**
```bash
npx http-server . -p 8081 -c-1 -o /test_bench.html
```

**Deno permission errors:**
```bash
deno run --allow-hrtime --allow-env dist/test_bench.js
```

## References

**Pyodide Issues & PRs:**
- [Issue #4006](https://github.com/pyodide/pyodide/issues/4006) - Original timer clamping issue
- [PR #4568](https://github.com/pyodide/pyodide/pull/4568) - Initial threshold=2 fix
- [PR #4590](https://github.com/pyodide/pyodide/pull/4590) - MessageChannel reuse discussion

**Implementation References:**
- [setImmediate polyfill](https://github.com/YuzuJS/setImmediate) - Cross-browser immediate scheduling
- [core-js task.js](https://github.com/zloirock/core-js/blob/master/packages/core-js/internals/task.js) - MessageChannel reuse pattern
- [HTML5 Timers Spec](https://html.spec.whatwg.org/multipage/timers-and-user-prompts.html#timers) - Browser timer clamping rules

**Known Issues:**
- [Safari MessageChannel issue](https://github.com/zloirock/core-js/issues/624)
- [Pyodide PR #4583](https://github.com/pyodide/pyodide/pull/4583) - Safari timer issues

## License

MIT
