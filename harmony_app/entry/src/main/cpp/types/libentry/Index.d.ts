// TypeScript declaration for the lynxtron NAPI module.
// Matches the napi_property_descriptor exported from
// src/shell/app/main_harmony.cc::Init.

declare namespace lynxtron {
  /**
   * Run LynxtronMain in the calling thread. Bring-up smoke test;
   * future versions will accept a config object and dispatch on a
   * worker thread so the UIAbility main thread isn't blocked.
   *
   * @returns LynxtronMain's exit code.
   */
  function start(): number;
}

export default lynxtron;
