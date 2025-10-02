// test_bench.ts - Comprehensive benchmark for scheduler testing
import {
  scheduleCallback,
  setTestSchedulerOptions,
  resetSchedulerState,
  getTestSchedulerOptions,
} from "./test_scheduler.js";

// Test parameters
const SLEEP_VALUES = [0, 0.001, 0.002, 0.016]; // in seconds (0, 1ms, 2ms, 16ms)
const THRESHOLDS = [0, 1, 2, 3, 16]; // timeout <= k
const ITERATIONS = 100; // reduced from 400 for faster testing

// Nested test parameters
const NEST_DEPTH = 10; // 10 calls to observe 4ms clamping effect (nestingLevel >= 5 from 6th call)

// High-frequency test parameters
const BURST_SIZE = 100; // number of concurrent callbacks

// Performance measurement
function now(): number {
  if (typeof performance !== "undefined" && performance.now) {
    return performance.now();
  }
  return Date.now();
}

// ============ Helper Functions ============

/**
 * Break timer nesting by yielding to event loop via non-timer task
 * This prevents unintended nested timer clamping
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof (globalThis as any).setImmediate === "function") {
      (globalThis as any).setImmediate(resolve);
    } else if (typeof MessageChannel === "function") {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage("");
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Delay helper for longer waits between test runs
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ Test Scenarios ============

/**
 * Basic single-call scenario
 * Measures time from schedule to execution for a single callback
 */
async function measureBasicOnce(timeoutSeconds: number): Promise<number> {
  const timeoutMs = timeoutSeconds * 1000;
  
  // Yield to prevent nested timer effects
  await yieldToEventLoop();
  
  return new Promise((resolve) => {
    const startTime = now();
    scheduleCallback(() => {
      const elapsed = now() - startTime;
      resolve(elapsed);
    }, timeoutMs);
  });
}

/**
 * Nested scenario - NEST_DEPTH consecutive calls to trigger 4ms clamping
 * Browser rule: "If nesting level is greater than 5, and timeout < 4ms, set timeout to 4ms"
 * 
 * Call sequence:
 * - Call 0: nestingLevel = 0
 * - Call 1: nestingLevel = 1
 * - Call 2: nestingLevel = 2
 * - Call 3: nestingLevel = 3
 * - Call 4: nestingLevel = 4
 * - Call 5: nestingLevel = 5 (4ms clamping starts here!)
 */
async function measureNested(timeoutSeconds: number): Promise<number> {
  const timeoutMs = timeoutSeconds * 1000;
  
  // Yield to start fresh
  await yieldToEventLoop();
  
  return new Promise((resolve) => {
    const startTime = now();
    let callCount = 0;
    
    function nestedCallback() {
      callCount++;
      if (callCount >= NEST_DEPTH) {
        // Finished all nested calls
        const elapsed = now() - startTime;
        resolve(elapsed);
      } else {
        // Schedule next nested call
        scheduleCallback(nestedCallback, timeoutMs);
      }
    }
    
    // Start the chain
    scheduleCallback(nestedCallback, timeoutMs);
  });
}

/**
 * High-frequency scenario (pygame-like)
 * Schedule many callbacks at once and measure until all complete
 */
async function measureHighFrequency(timeoutSeconds: number): Promise<number> {
  const timeoutMs = timeoutSeconds * 1000;
  
  // Yield to start fresh
  await yieldToEventLoop();
  
  return new Promise((resolve) => {
    const startTime = now();
    let completedCount = 0;
    
    // Schedule all callbacks at once
    for (let i = 0; i < BURST_SIZE; i++) {
      scheduleCallback(() => {
        completedCount++;
        if (completedCount === BURST_SIZE) {
          const elapsed = now() - startTime;
          resolve(elapsed);
        }
      }, timeoutMs);
    }
  });
}

/**
 * Game loop scenario (REAL pygame-like)
 * Sequential execution like: while True: do_work(); await sleep(1/fps)
 */
async function measureGameLoop(timeoutSeconds: number): Promise<number> {
  const timeoutMs = timeoutSeconds * 1000;
  
  // Yield to start fresh
  await yieldToEventLoop();
  
  const startTime = now();
  
  // Run BURST_SIZE frames sequentially
  for (let frame = 0; frame < BURST_SIZE; frame++) {
    await new Promise<void>((resolve) => {
      scheduleCallback(() => {
        // Simulate game work (do_something + draw_canvas)
        // In real game, this would be actual game logic
        resolve();
      }, timeoutMs);
    });
  }
  
  const elapsed = now() - startTime;
  return elapsed;
}

// ============ Scenario Runners ============

async function runScenario(
  name: string,
  measureFn: (timeout: number) => Promise<number>,
  reuseMessageChannel: boolean,
  iterations: number = ITERATIONS
): Promise<number[][]> {
  console.log(`\nRunning: ${name}...`);
  const results: number[][] = [];
  
  for (const threshold of THRESHOLDS) {
    const row: number[] = [];
    
    for (const sleepSeconds of SLEEP_VALUES) {
      // Configure scheduler
      setTestSchedulerOptions({ threshold, reuseMessageChannel });
      resetSchedulerState();
      
      // Warm up
      await measureFn(sleepSeconds);
      await delay(10);
      
      // Run measurements
      let totalTime = 0;
      for (let i = 0; i < iterations; i++) {
        const elapsed = await measureFn(sleepSeconds);
        totalTime += elapsed;
        
        // Small delay between iterations to prevent browser slowdown
        if (i % 20 === 19) {
          await delay(5);
        }
      }
      
      const avgTime = totalTime / iterations;
      row.push(avgTime);
    }
    
    results.push(row);
    
    // Delay between thresholds
    await delay(20);
  }
  
  return results;
}

// ============ Results Display ============

function printTable(title: string, data: number[][]) {
  console.log(`\n## ${title}`);
  console.log(`| timeout<=k \\ sleep(s) | ${SLEEP_VALUES.map(s => s.toFixed(3)).join(" | ")} |`);
  console.log(`|${"-".repeat(23)}|${SLEEP_VALUES.map(() => "-".repeat(7)).join("|")}|`);
  
  THRESHOLDS.forEach((threshold, idx) => {
    const row = data[idx];
    const rowStr = row.map(v => v.toFixed(2).padStart(5)).join(" | ");
    console.log(`| ${String(threshold).padEnd(21)} | ${rowStr} |`);
  });
}

function printComparison(normalData: number[][], reuseData: number[][]) {
  console.log(`\n### Performance Comparison (reuse - normal, negative = reuse faster)`);
  console.log(`| timeout<=k \\ sleep(s) | ${SLEEP_VALUES.map(s => s.toFixed(3)).join(" | ")} |`);
  console.log(`|${"-".repeat(23)}|${SLEEP_VALUES.map(() => "-".repeat(7)).join("|")}|`);
  
  THRESHOLDS.forEach((threshold, idx) => {
    const normalRow = normalData[idx];
    const reuseRow = reuseData[idx];
    const diffRow = normalRow.map((v, i) => reuseRow[i] - v);
    const rowStr = diffRow.map(v => {
      const sign = v >= 0 ? '+' : '';
      return (sign + v.toFixed(2)).padStart(5);
    }).join(" | ");
    console.log(`| ${String(threshold).padEnd(21)} | ${rowStr} |`);
  });
}

// ============ Main Test Runner ============

async function main() {
  console.log("=".repeat(60));
  console.log("Scheduler Benchmark Test");
  console.log("=".repeat(60));
  
  // Improved runtime detection
  const g = globalThis as any;
  let runtimeName = "Unknown";
  let runtimeDetails = "";
  
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    // Browser
    runtimeName = "Browser";
    if (typeof navigator !== "undefined") {
      const ua = navigator.userAgent;
      if (/chrome/i.test(ua) && !/edg/i.test(ua)) {
        runtimeDetails = " (Chrome)";
      } else if (/firefox/i.test(ua)) {
        runtimeDetails = " (Firefox)";
      } else if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
        runtimeDetails = " (Safari)";
      } else if (/edg/i.test(ua)) {
        runtimeDetails = " (Edge)";
      }
    }
  } else if (g.Deno?.version?.deno) {
    runtimeName = "Deno";
    runtimeDetails = ` ${g.Deno.version.deno}`;
  } else if (g.process?.versions?.node) {
    runtimeName = "Node.js";
    runtimeDetails = ` ${g.process.versions.node}`;
  }
  
  console.log(`Runtime: ${runtimeName}${runtimeDetails}`);
  console.log(`Iterations per test: ${ITERATIONS}`);
  console.log(`Sleep values (seconds): ${SLEEP_VALUES.join(", ")}`);
  console.log(`Threshold values: ${THRESHOLDS.join(", ")}`);
  console.log(`Nested depth: ${NEST_DEPTH}`);
  console.log(`Burst size: ${BURST_SIZE}`);
  console.log("=".repeat(60));

  // 1. Basic scenario
  const basicNormal = await runScenario(
    "Basic (normal)",
    measureBasicOnce,
    false,
    ITERATIONS
  );
  printTable("Basic execution", basicNormal);

  await delay(100);

  const basicReuse = await runScenario(
    "Basic (MessageChannel reuse)",
    measureBasicOnce,
    true,
    ITERATIONS
  );
  printTable("Basic execution (MessageChannel reuse)", basicReuse);
  printComparison(basicNormal, basicReuse);

  await delay(100);

  // 2. Nested scenario
  const nestedIterations = Math.max(20, Math.floor(ITERATIONS / 5));
  const nestedNormal = await runScenario(
    `Nested (${NEST_DEPTH} deep)`,
    measureNested,
    false,
    nestedIterations
  );
  printTable(`Nested execution (${NEST_DEPTH} deep)`, nestedNormal);

  await delay(100);

  const nestedReuse = await runScenario(
    `Nested (${NEST_DEPTH} deep, MC reuse)`,
    measureNested,
    true,
    nestedIterations
  );
  printTable(`Nested execution (${NEST_DEPTH} deep, MessageChannel reuse)`, nestedReuse);
  printComparison(nestedNormal, nestedReuse);

  await delay(100);

  // 3. High-frequency scenario
  const hfIterations = Math.max(20, Math.floor(ITERATIONS / 10));
  const highFreqNormal = await runScenario(
    "High-frequency (pygame-like)",
    measureHighFrequency,
    false,
    hfIterations
  );
  printTable("High-frequency (pygame-like)", highFreqNormal);

  await delay(100);

  const highFreqReuse = await runScenario(
    "High-frequency (MC reuse)",
    measureHighFrequency,
    true,
    hfIterations
  );
  printTable("High-frequency (MessageChannel reuse)", highFreqReuse);
  printComparison(highFreqNormal, highFreqReuse);

  await delay(100);

  // 4. Game loop scenario
  const gameLoopIterations = Math.max(5, Math.floor(ITERATIONS / 20));
  const gameLoopNormal = await runScenario(
    "Game loop (sequential)",
    measureGameLoop,
    false,
    gameLoopIterations
  );
  printTable("Game loop (sequential)", gameLoopNormal);

  await delay(100);

  const gameLoopReuse = await runScenario(
    "Game loop (MC reuse)",
    measureGameLoop,
    true,
    gameLoopIterations
  );
  printTable("Game loop (sequential, MessageChannel reuse)", gameLoopReuse);
  printComparison(gameLoopNormal, gameLoopReuse);

  console.log("\n" + "=".repeat(60));
  console.log("Tests completed!");
  console.log("=".repeat(60));
  
  // Analysis guide
  console.log("\n## Results Analysis Guide");
  console.log("1. Values show average execution time in milliseconds.");
  console.log("2. Higher timeout<=k means more cases use immediate path.");
  console.log("3. For sleep(0): lower is better (faster scheduling).");
  console.log("4. For sleep(0.001), sleep(0.002): closer to expected timeout is better.");
  console.log("5. Nested tests demonstrate browser's 4ms clamping effect.");
  console.log("6. In comparison tables: negative = reuse faster, positive = normal faster.");
}

// Run tests
main().catch((err) => {
  console.error("Error running benchmark:", err);
  const g = globalThis as any;
  if (typeof g.process !== "undefined") {
    g.process.exit(1);
  }
});
