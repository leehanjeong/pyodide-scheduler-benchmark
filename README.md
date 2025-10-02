# Pyodide Scheduler Benchmark

Comprehensive benchmark for Pyodide webloop scheduler optimizations.

**Related Issue:** [Pyodide Issue #5925](https://github.com/pyodide/pyodide/issues/5925)


## Quick Start

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Open browser test
npm run test:browser

# Or manually
npm run serve:only
# Then open http://localhost:8080/test_bench.html
```
## Repository Structure

```
scheduler-benchmark/
├── README.md                 # This file
├── test_scheduler.ts         # Modified scheduler (with both optimizations)
├── origin_scheduler.ts       # Original Pyodide scheduler (for reference)
├── test_bench.ts            # Benchmark suite (4 scenarios)
├── environments.ts          # Runtime detection utility
│
├── test_bench.html          # Browser test page
│
├── package.json             # Dependencies
├── tsconfig.json            # TypeScript configuration
└── .gitignore               # Excludes analysis documents
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
- Simulates environment with many `sleep(0)` calls per frame
- Measures MessageChannel bulk scheduling performance

### 4. Game Loop Scenario  
- Sequential execution pattern: `while True: do_work(); await sleep(1/fps)`
- Real-world Pygame game loop simulation
- 100 frames executed sequentially

## How to Run Tests

### Browser 

**Chrome:**
```bash
npm run test:browser
```

**Firefox:**
```bash
npm run test:browser:firefox
```

**Safari:**
```bash
npm run serve:only
# Then open http://localhost:8080/test_bench.html in Safari
```
**Note:** Safari has known MessageChannel issues, uses postMessage/setTimeout fallback.

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
