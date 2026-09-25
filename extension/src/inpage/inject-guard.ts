/**
 * @file inject-guard.ts
 * Minimal early pass-through guard.
 */
(() => {
  const win = window as any;
  if (win.__rescuekitGuardInstalled) return;
  win.__rescuekitGuardInstalled = true;
})();
