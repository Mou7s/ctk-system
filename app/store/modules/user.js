import { login, logout, getInfo } from '@/api/login'
import { getToken, removeToken, setToken } from '@/utils/auth'
import defAva from '@/assets/images/profile.jpg'
import usePermissionStore from '@/store/modules/permission'

const useUserStore = defineStore(
  'user',
  {
    state: () => ({
      token: getToken(),
      id: '',
      name: '',
      nickName: '',
      avatar: '',
      roles: [],
      permissions: [],
      menuIds: [],
      isDefaultPassword: false,
      // 演示账号标记（由服务端 getInfo 下发）：为 true 时前端隐藏公司标识并显示演示提示。
      demo: false
    }),
    actions: {
      // 登录
      login(userInfo) {
        const username = userInfo.username.trim()
        const password = userInfo.password
        const code = userInfo.code
        const uuid = userInfo.uuid
        return new Promise((resolve, reject) => {
          login(username, password, code, uuid).then(res => {
            this.token = res.token
            setToken(res.token)
            resolve()
          }).catch(error => {
            reject(error)
          })
        })
      },
      // 获取用户信息
      getInfo() {
        return new Promise((resolve, reject) => {
          getInfo().then(res => {
            const user = res.user
            // 头像静态文件挂在 /profile/**（见 Nitro profile 路由），不要拼 /prod-api 前缀
            const avatar = (user.avatar == "" || user.avatar == null) ? defAva : user.avatar;

            if (res.roles && res.roles.length > 0) {
              this.roles = res.roles
            } else {
              this.roles = ['ROLE_DEFAULT']
            }
            this.permissions = Array.isArray(res.permissions) ? res.permissions : []
            this.menuIds = Array.isArray(res.menuIds) ? res.menuIds.map(Number).filter(Number.isInteger) : []
            this.id = user.userId
            this.name = user.userName
            this.nickName = user.nickName || user.userName
            this.avatar = avatar
            this.isDefaultPassword = res.isDefaultPassword === true
            this.demo = res.demo === true
            resolve(res)
          }).catch(error => {
            reject(error)
          })
        })
      },
      // 角色菜单关系由服务端实时读取；刷新后同步重建前端导航树。
      async refreshPermissions() {
        const result = await this.getInfo()
        usePermissionStore().initialize(this)
        return result
      },
      // 退出系统
      logOut() {
        return new Promise((resolve, reject) => {
          logout(this.token).then(() => {
            this.token = ''
            this.nickName = ''
            this.roles = []
            this.permissions = []
            this.menuIds = []
            this.demo = false
            usePermissionStore().resetRoutes()
            removeToken()
            if (typeof window !== 'undefined') {
              window.sessionStorage.removeItem("HAS_PROMPTED_DEFAULT_PWD")
            }
            resolve()
          }).catch(error => {
            reject(error)
          })
        })
      }
    }
  })

export default useUserStore
