import 'ses';

/**
 * Configure and initialize SES lockdown with specific security settings
 * See: https://github.com/endojs/endo/blob/master/packages/ses/docs/lockdown.md
 */
lockdown({
  // Allow locale operations for i18n support
  localeTaming: 'unsafe',
  
  // Enable console for debugging
  consoleTaming: 'unsafe',
  
  // Preserve error stack traces
  errorTaming: 'unsafe',
  stackFiltering: 'verbose',
  
  // Allow eval for protodef dependency
  evalTaming: 'unsafeEval',
});

/**
 * Creates a new secure compartment with optional endowments
 * @param {Object} endowments - Additional objects to expose to the compartment
 * @returns {Compartment} New secure compartment instance
 */
export const makeCompartment = (endowments = {}) => {
  return new Compartment({
    // Provide core JavaScript globals
    Math,
    Date,
    
    // Merge in any additional endowments
    ...endowments
  });
}
