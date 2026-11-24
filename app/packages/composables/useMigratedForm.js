import { computed, reactive, ref, watch } from 'vue';

/**
 * Bridge EP el-form patterns → Nuxt UI UForm.
 *
 * Legacy pages hand-roll `<el-form :model="form" :rules="rules" :ref="formRef">`
 * with `proxy.$refs.formRef.validate(cb)` and `proxy.resetForm("formRef")`.
 * This composable preserves that mental model on top of UForm's
 * `:state` + `validate()` API so page components can be migrated
 * with minimal diff.
 */
export function useMigratedForm(initial = {}, epRules = {}) {
  const state = reactive({ ...initial });
  const original = { ...initial };
  const formRef = ref(null);
  const epRuleMap = reactive({ ...epRules });

  const errors = reactive({});
  watch(state, (next) => {
    for (const key of Object.keys(epRuleMap)) {
      errors[key] = undefined;
    }
  });

  function reset() {
    Object.assign(state, original);
    formRef.value?.clear?.();
  }

  async function validate() {
    const missing = [];
    for (const [field, rule] of Object.entries(epRuleMap)) {
      const value = state[field];
      const isEmpty = value === null || value === undefined || value === '';
      if (rule.required && isEmpty) {
        errors[field] = rule.message || `${field} is required`;
        missing.push(field);
      }
    }
    if (missing.length) {
      return { valid: false, fields: missing, errors: { ...errors } };
    }
    if (formRef.value && typeof formRef.value.validate === 'function') {
      const result = await formRef.value.validate();
      return { valid: !!result, fields: [], errors: result?.errors ?? {} };
    }
    return { valid: true, fields: [], errors: {} };
  }

  const isValid = computed(() => Object.keys(errors).length === 0);

  return { state, errors, formRef, epRuleMap, isValid, reset, validate };
}
