// environments.ts
const g: any = globalThis as any;

// Browser detection should come first (most specific)
export const IN_BROWSER_MAIN_THREAD =
  typeof window !== "undefined" && typeof document !== "undefined";

// Node.js: has process.versions.node AND not in browser
export const IN_NODE = !!(
  !IN_BROWSER_MAIN_THREAD && 
  g.process?.versions?.node
);

// Deno: has Deno.version AND not in browser
export const IN_DENO = !!(
  !IN_BROWSER_MAIN_THREAD && 
  g.Deno?.version?.deno
);

export const IN_SAFARI =
  IN_BROWSER_MAIN_THREAD &&
  typeof navigator !== "undefined" &&
  /safari/i.test(navigator.userAgent) &&
  !/chrome|crios|chromium|android/i.test(navigator.userAgent);

