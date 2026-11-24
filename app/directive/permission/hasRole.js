import useUserStore from '@/store/modules/user'

const ADMIN_ROLE = 'admin'

/**
 * v-hasRole directive: remove element when current user lacks any required role.
 */
export default {
  mounted(el, binding) {
    const required = binding.value
    if (!Array.isArray(required) || required.length === 0) {
      throw new Error('请设置角色权限标签值')
    }
    const roles = useUserStore().roles || []
    const allowed = roles.some((role) => role === ADMIN_ROLE || required.includes(role))
    if (!allowed) {
      el.parentNode?.removeChild(el)
    }
  },
}
