// test_scheduler.ts - Improved scheduler for comprehensive testing
import {
  IN_BROWSER_MAIN_THREAD,
  IN_NODE,
  IN_DENO,
  IN_SAFARI,
} from "./environments.js";

/**
 * Test configuration options
 */
export interface TestSchedulerOptions {
  threshold: number; // 0-4: if timeout <= threshold, use immediate path
  reuseMessageChannel: boolean; // reuse single MessageChannel vs allocate per call
}

let OPTIONS: TestSchedulerOptions = {
  threshold: 2,
  reuseMessageChannel: false,
};

export function setTestSchedulerOptions(opts: Partial<TestSchedulerOptions>) {
  OPTIONS = { ...OPTIONS, ...opts };
}

export function getTestSchedulerOptions(): TestSchedulerOptions {
  return { ...OPTIONS };
}

// ============ MessageChannel Setup ============

// Shared MessageChannel (core-js style)
let sharedChannel: MessageChannel | null = null;
let sharedChannelQueue: Array<() => void> = [];

function ensureSharedChannel() {
  if (sharedChannel) return;
  
  // Skip MessageChannel in Safari and Deno (known issues)
  if (IN_SAFARI || IN_DENO) return;
  
  if (typeof globalThis.MessageChannel === "function") {
    sharedChannel = new MessageChannel();
    sharedChannel.port1.onmessage = () => {
      const cb = sharedChannelQueue.shift();
      if (cb) cb();
    };
  }
}

// ============ postMessage Setup ============

const scheduleCallbackImmediateMessagePrefix =
  "sched$" + Math.random().toString(36).slice(2) + "$";
const tasks: Record<number, () => void> = {};
let nextTaskHandle = 0;

function installPostMessageHandler() {
  if (!IN_BROWSER_MAIN_THREAD) return;

  const onGlobalMessage = (event: MessageEvent) => {
    if (
      typeof event.data === "string" &&
      event.data.indexOf(scheduleCallbackImmediateMessagePrefix) === 0
    ) {
      const handle = +event.data.slice(
        scheduleCallbackImmediateMessagePrefix.length,
      );
      const task = tasks[handle];
      if (!task) return;

      try {
        task();
      } finally {
        delete tasks[handle];
      }
    }
  };

  globalThis.addEventListener("message", onGlobalMessage, false);
}

installPostMessageHandler();

// ============ Immediate Scheduler ============

/**
 * Implementation of zero-delay scheduler for immediate callbacks
 * Based on origin_scheduler.ts, with added support for MessageChannel reuse
 */
function scheduleCallbackImmediate(callback: () => void) {
  // Node.js: use setImmediate
  if (IN_NODE && typeof (globalThis as any).setImmediate === "function") {
    (globalThis as any).setImmediate(callback);
    return;
  }

  // MessageChannel path (Chrome, Firefox, Node without setImmediate)
  if (!IN_SAFARI && !IN_DENO && typeof globalThis.MessageChannel === "function") {
    if (OPTIONS.reuseMessageChannel) {
      // Reuse shared MessageChannel (core-js style)
      ensureSharedChannel();
      if (sharedChannel) {
        sharedChannelQueue.push(callback);
        sharedChannel.port2.postMessage("");
        return;
      }
    } else {
      // Allocate new MessageChannel per call
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.onmessage = null;
        channel.port1.close();
        channel.port2.close();
        callback();
      };
      channel.port2.postMessage("");
      return;
    }
  }

  // postMessage fallback (browser main thread)
  if (IN_BROWSER_MAIN_THREAD && typeof globalThis.postMessage === "function") {
    tasks[nextTaskHandle] = callback;
    globalThis.postMessage(
      scheduleCallbackImmediateMessagePrefix + nextTaskHandle,
      "*",
    );
    nextTaskHandle++;
    return;
  }

  // Final fallback: setTimeout
  setTimeout(callback, 0);
}

/**
 * Schedule a callback. Supports both immediate and delayed callbacks.
 * @param callback The callback to be scheduled
 * @param timeout The delay in milliseconds before the callback is called
 */
export function scheduleCallback(callback: () => void, timeout: number = 0) {
  if (timeout <= OPTIONS.threshold) {
    scheduleCallbackImmediate(callback);
  } else {
    setTimeout(callback, timeout);
  }
}

// ============ Reset Function ============

/**
 * Reset shared state between test runs
 */
export function resetSchedulerState() {
  // Close shared channel if exists
  if (sharedChannel) {
    sharedChannel.port1.close();
    sharedChannel.port2.close();
    sharedChannel = null;
  }
  sharedChannelQueue = [];
  
  // Clear pending tasks
  for (const key in tasks) {
    delete tasks[key];
  }
}
