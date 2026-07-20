// TypeScript declaration for the lynxtron NAPI module.
// Matches the napi_property_descriptor exported from
// src/shell/app/lynxtron_napi_bridge.cc::Init.

declare namespace lynxtron {
  /**
   * Start LynxtronMain on its dedicated native thread.
   *
   * @returns zero after the native thread is started.
   */
  function start(): number;
}

export default lynxtron;
