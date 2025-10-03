"""
USAGE IN PYODIDE CONSOLE:
--------------------------
Method - Direct execution:
    from pyodide.http import pyfetch
    response = await pyfetch('https://raw.githubusercontent.com/leehanjeong/pyodide-scheduler-benchmark/main/test_bench.py')
    code = await response.string()
    exec(code)
"""

import asyncio
import sys
import time

# Test parameters
SLEEP_VALUES = [0, 0.001, 0.002, 0.016] 
ITERATIONS = 100
BURST_SIZE = 100

def now():
    """Get current time in milliseconds"""
    return time.perf_counter() * 1000


async def measure_basic_once(sleep_sec):
    """
    Scenario 1: Basic single call
    Measures one asyncio.sleep() execution time
    
    Note: await asyncio.sleep(0) resets browser's timer nesting level.
    Browser enforces 4ms minimum when nestingLevel >= 5.
    """
    await asyncio.sleep(0)
    
    start = now()
    await asyncio.sleep(sleep_sec)
    return now() - start


async def measure_high_frequency(sleep_sec):
    """
    Scenario 2: High-frequency concurrent calls
    Like pygame with many sprite updates at once
    
    Schedules 100 asyncio.sleep() calls simultaneously
    """
    await asyncio.sleep(0)
    
    start = now()
    await asyncio.gather(*[
        asyncio.sleep(sleep_sec)
        for _ in range(BURST_SIZE)
    ])
    return now() - start


async def measure_game_loop(sleep_sec):
    """
    Scenario 3: Sequential game loop
    Real pygame pattern: while True: update(); draw(); await sleep(fps)
    
    Runs 100 frames sequentially
    """
    await asyncio.sleep(0)
    
    start = now()
    for _ in range(BURST_SIZE):
        await asyncio.sleep(sleep_sec)
    return now() - start


async def run_scenario(name, measure_fn, iterations=ITERATIONS):
    """Run one scenario for all sleep values"""
    print(f"\n{'='*60}")
    print(f"  {name}")
    print('='*60)
    
    results = []
    
    for sleep_sec in SLEEP_VALUES:
        sleep_ms = sleep_sec * 1000
        
        # Warm up
        await measure_fn(sleep_sec)
        await asyncio.sleep(0.01)
        
        # Run iterations
        times = []
        for i in range(iterations):
            elapsed = await measure_fn(sleep_sec)
            times.append(elapsed)
        
        avg = sum(times) / len(times)
        min_time = min(times)
        max_time = max(times)
        results.append({
            'sleep_ms': sleep_ms,
            'avg': avg,
            'min': min_time,
            'max': max_time,
        })
        
        print(f"  sleep({sleep_ms:>5.1f}ms): avg={avg:>7.2f}ms  min={min_time:>7.2f}ms  max={max_time:>7.2f}ms")
    
    return results


def print_summary_table(all_results):
    """Print comparison table of all scenarios"""
    print("\n" + "="*80)
    print("SUMMARY TABLE (average times in milliseconds)")
    print("="*80)
    
    # Header
    header = f"{'Scenario':<25} | " + " | ".join(f"{s*1000:>6.0f}ms" for s in SLEEP_VALUES)
    print(header)
    print("-"*80)
    
    # Rows
    for scenario_name, results in all_results.items():
        values = " | ".join(f"{r['avg']:>7.2f}" for r in results)
        print(f"{scenario_name:<25} | {values}")
    
    print("="*80)


async def main():
    print("="*80)
    print("SCHEDULER BENCHMARK TEST")
    print("="*80)
    
    # Runtime detection 
    runtime = "Unknown"
    try:
        from js import navigator
        ua = str(navigator.userAgent)
        if "Chrome" in ua and "Edg" not in ua:
            runtime = "Pyodide/Chrome"
        elif "Firefox" in ua:
            runtime = "Pyodide/Firefox"
        elif "Safari" in ua and "Chrome" not in ua:
            runtime = "Pyodide/Safari"
        elif "Edg" in ua:
            runtime = "Pyodide/Edge"
        else:
            runtime = "Pyodide/Browser"
    except:
        runtime = f"Python {sys.version.split()[0]}"
    
    print(f"Runtime: {runtime}")
    print(f"Sleep values: {', '.join(f'{s*1000:.0f}ms' for s in SLEEP_VALUES)}")
    print(f"Iterations: {ITERATIONS}")
    print(f"Burst size: {BURST_SIZE}")
    print("="*80)
    
    all_results = {}
    
    # Scenario 1: Basic
    print("\n🔹 Running Scenario 1...")
    basic_results = await run_scenario(
        "1. Basic (single call)",
        measure_basic_once,
        ITERATIONS
    )
    all_results["1. Basic"] = basic_results
    
    await asyncio.sleep(0.1)
    
    # Scenario 2: High-frequency (fewer iterations)
    print("\n🔹 Running Scenario 2...")
    hf_iters = max(20, ITERATIONS // 10)
    hf_results = await run_scenario(
        f"2. High-freq ({BURST_SIZE}x)",
        measure_high_frequency,
        hf_iters
    )
    all_results[f"2. High-freq ({BURST_SIZE}x)"] = hf_results
    
    await asyncio.sleep(0.1)
    
    # Scenario 3: Game loop (fewer iterations)
    print("\n🔹 Running Scenario 3...")
    gl_iters = max(5, ITERATIONS // 20)
    gl_results = await run_scenario(
        f"3. Game loop ({BURST_SIZE}x)",
        measure_game_loop,
        gl_iters
    )
    all_results[f"3. Game loop ({BURST_SIZE}x)"] = gl_results
    
    # Print summary
    print_summary_table(all_results)
    


# Entry point
if __name__ == "__main__":
    asyncio.run(main())
