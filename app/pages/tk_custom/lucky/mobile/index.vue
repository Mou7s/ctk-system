<template>
  <div class="lucky-mobile-container relative min-h-screen w-full bg-gradient-to-br from-red-800 to-red-950 text-white font-sans flex flex-col items-center select-none pb-12">
    <!-- Starfield/Bubble background -->
    <div class="stars-bg absolute inset-0 pointer-events-none"></div>

    <!-- Top Header -->
    <div class="w-full bg-gradient-to-b from-red-600 to-red-800 pt-8 pb-6 px-5 text-center rounded-b-[40px] shadow-2xl relative overflow-hidden shrink-0">
      <!-- Decorator elements -->
      <div class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/5 pointer-events-none"></div>
      <div class="absolute -left-10 -bottom-10 w-32 h-32 rounded-full bg-white/5 pointer-events-none"></div>
      
      <div class="relative z-10 animate-[scaleIn_0.5s_ease-out] flex flex-col items-center">
        <h1 class="text-2xl font-black tracking-wide text-transparent bg-clip-text bg-gradient-to-b from-yellow-100 to-yellow-300 drop-shadow-[0_2px_8px_rgba(234,179,8,0.35)]">
          {{ activity.title || '粉丝福利大抽奖' }}
        </h1>
        <div class="mt-2 text-xs text-yellow-100/70 font-semibold tracking-wider">
          {{ dynamicSubtitle }}
        </div>
      </div>
    </div>

    <!-- Main Content Area -->
    <div class="w-full max-w-md px-5 flex-grow flex flex-col gap-6 relative z-10">
      <!-- Winner Scroll Ticker -->
      <div class="w-full mt-4 px-4 py-2.5 bg-black/45 border border-white/10 rounded-2xl flex items-center gap-3 shadow-lg shrink-0" v-if="recentWinners.length > 0">
        <span class="text-sm shrink-0">📢</span>
        <div class="flex-grow h-[30px] overflow-hidden relative">
          <ul class="absolute w-full transition-transform duration-500 ease-in-out" :style="{ transform: `translateY(-${tickerIndex * 30}px)` }">
            <li v-for="(winner, idx) in recentWinners" :key="idx" class="h-[30px] flex items-center text-xs text-white/95 truncate">
              恭喜 <span class="text-yellow-300 font-bold mx-1">{{ winner.userPhone }}</span> 抽中 <span class="text-yellow-400 font-black ml-1">{{ winner.prizeName }}</span>
            </li>
          </ul>
        </div>
      </div>

      <!-- 点击 PK 控制区域 -->
      <div class="mt-1 shrink-0">
        <!-- 1. 未登记参赛状态 -->
        <div v-if="!user.phone" class="p-6 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md flex flex-col items-center text-center shadow-2xl animate-[fadeIn_0.3s_ease-out]">
          <div class="w-14 h-14 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-2xl mb-4 shadow-inner">📋</div>
          <h2 class="text-lg font-bold text-yellow-400 tracking-wide mb-2">登记参赛信息</h2>
          <p class="text-xs text-white/60 leading-relaxed mb-6 px-1">
            登记您的姓名和手机号，大屏幕赛道上将自动生成您的专属角色。准备好手速，等待管理员开启 PK 吧！
          </p>
          <button class="w-full py-4 rounded-2xl bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-black font-black text-sm shadow-[0_6px_20px_rgba(234,179,8,0.3)] active:scale-95 transition-all cursor-pointer border-none" @click="showLoginModal = true">
            登记并参与 PK
          </button>
          <div class="mt-4 text-[11px] text-white/40 font-semibold" v-if="lobbyPlayerCount > 0">
            当前已登记人数：<span class="text-yellow-400 font-bold ml-0.5">{{ lobbyPlayerCount }}</span> 人
          </div>
        </div>

        <!-- 2. 已登记等待发车状态 -->
        <div v-else-if="pkRoom.status === 'waiting'" class="p-6 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md flex flex-col items-center text-center shadow-2xl animate-[fadeIn_0.3s_ease-out]">
          <div class="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-black text-white border-2 border-white/20 shadow-xl mb-4" :style="getRandomGradient(user.phone)">
            <span v-if="isEmoji(user.avatar)">{{ user.avatar }}</span>
            <span v-else>{{ getInitials(user.name) }}</span>
          </div>
          <h2 class="text-lg font-bold text-emerald-400 tracking-wide mb-2 flex items-center gap-2 justify-center">
            <span class="relative flex h-2.5 w-2.5">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span>已进入大屏跑道 · 准备就绪</span>
          </h2>
          <p class="text-xs text-white/60 leading-relaxed mb-5 px-2">
            您已成功加入游戏。请盯着现场投影大屏幕，静待管理员开启游戏！
          </p>
          <div class="w-full p-3.5 rounded-2xl bg-white/5 border border-white/5 text-left text-xs text-yellow-300/80 leading-relaxed mb-5 flex gap-2 shadow-inner">
            <span class="shrink-0 text-sm">💡</span>
            <span><strong>点击秘籍：</strong>游戏开始后，用最快的速度疯狂点击屏幕，控制您的化身前进！</span>
          </div>
          <div class="text-[11px] text-white/40 font-semibold">
            当前已就绪人数：<span class="text-yellow-400 font-bold ml-0.5">{{ pkRoom.players.length }}</span> 人
          </div>
        </div>

        <!-- 3. 倒计时准备状态 -->
        <div v-else-if="pkRoom.status === 'countdown'" class="p-6 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md flex flex-col items-center text-center shadow-2xl animate-[fadeIn_0.3s_ease-out]">
          <div class="w-28 h-28 rounded-full border-4 border-dashed border-yellow-400 flex items-center justify-center bg-black/45 shadow-[0_0_25px_rgba(234,179,8,0.25)] mb-4">
            <div class="text-4xl font-black text-yellow-300 tracking-wider animate-ping" :key="countdownText">
              {{ countdownText || '准备' }}
            </div>
          </div>
          <p class="text-sm font-bold text-white/95 tracking-wide uppercase animate-pulse">
            游戏即将开始，请做好准备！
          </p>
        </div>

        <!-- 4. 疯狂 PK 进行状态 -->
        <div v-else-if="pkRoom.status === 'gaming'" class="p-6 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md flex flex-col items-center text-center shadow-2xl select-none cursor-pointer active:bg-black/45 transition-all animate-[fadeIn_0.3s_ease-out]" @click="triggerSingleTap">
          <!-- 猛戳充能核心 -->
          <div class="relative w-44 h-44 rounded-full bg-red-600/10 border-4 border-red-500/15 flex items-center justify-center mb-6">
            <!-- 外环发光和脉冲反馈 -->
            <div class="absolute inset-0 rounded-full border-2 border-red-500/40 animate-ping" v-if="lastTapTime > 0"></div>
            
            <!-- 点击回弹反应球 -->
            <div 
              class="w-36 h-36 rounded-full bg-gradient-to-b from-red-500 via-red-600 to-red-800 flex flex-col items-center justify-center shadow-[0_0_40px_rgba(239,68,68,0.5)] border border-red-400/30 transition-all duration-75 select-none"
              :class="{ 'scale-90 brightness-110 shadow-[0_0_50px_rgba(239,68,68,0.7)]': lastTapTime > 0 }"
            >
              <span class="text-3xl font-black text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] tracking-wide mb-1">猛戳前进</span>
              <span class="text-[10px] font-bold text-white/80 uppercase">点击屏幕</span>
            </div>
          </div>

          <h2 class="text-base font-bold text-yellow-400 tracking-wide mb-6 animate-pulse">
            🎉 疯狂点击手机屏幕前进！🎉
          </h2>
          
          <!-- 个人计数盘 -->
          <div class="px-8 py-3 rounded-2xl bg-white/5 border border-white/5 shadow-inner flex items-baseline gap-2">
            <span class="text-xs font-bold text-white/40 uppercase">累计点击</span>
            <span class="text-3xl font-mono font-black text-yellow-300 drop-shadow">{{ clickCount }}</span>
            <span class="text-[10px] font-bold text-yellow-300/80">次</span>
          </div>
        </div>

        <!-- 5. 比赛结算状态 -->
        <div v-else-if="pkRoom.status === 'ended'" class="p-8 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md flex flex-col items-center text-center shadow-2xl animate-pulse">
          <div class="text-4xl mb-4">🏆</div>
          <h2 class="text-lg font-bold text-yellow-400 tracking-wide mb-2">比赛已结束</h2>
          <p class="text-xs text-white/60 leading-relaxed px-4">
            正在同步大屏幕成绩，请稍后查看您的中奖状态。
          </p>
        </div>
      </div>

      <!-- User Info Box -->
      <div v-if="user.phone" class="w-full p-4 rounded-2xl bg-white/5 border border-white/5 shadow-inner flex items-center justify-between gap-3 shrink-0">
        <div class="min-w-0 flex-1">
          <div class="text-xs text-white/80 font-bold truncate flex items-center gap-1.5">
            <span class="w-2 h-2 rounded-full" :style="getRandomGradient(user.phone)"></span>
            <span>当前登记：<span class="text-yellow-400 font-extrabold">{{ user.name }}</span> ({{ user.phone }})</span>
          </div>
          <div class="text-[10px] text-white/40 truncate mt-0.5 pl-3.5" v-if="user.company || user.job">
            {{ user.company }} <span v-if="user.job">/ {{ user.job }}</span>
          </div>
        </div>
        <button class="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-white/90 shrink-0 active:scale-95 transition-all cursor-pointer" @click="showLoginModal = true">
          修改信息
        </button>
      </div>

      <!-- Navigation Tabs (Draw / My Prizes / Rules) -->
      <div class="w-full flex-grow flex flex-col min-h-[300px]">
        <!-- Tabs Header -->
        <div class="flex border-b border-white/10 shrink-0">
          <button 
            :class="['flex-1 py-3.5 text-sm font-bold border-b-2 text-center transition-colors', activeTab === 'rules' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-white/40']" 
            @click="activeTab = 'rules'"
          >
            活动规则
          </button>
          <button 
            :class="['flex-1 py-3.5 text-sm font-bold border-b-2 text-center transition-colors', activeTab === 'myPrizes' ? 'border-yellow-400 text-yellow-400' : 'border-transparent text-white/40']" 
            @click="handleMyPrizesTab"
          >
            我的奖品
          </button>
        </div>

        <!-- Tabs Content -->
        <div class="flex-grow pt-5">
          <!-- Rules Panel -->
          <div v-if="activeTab === 'rules'" class="text-xs text-white/70 space-y-5 leading-relaxed animate-[fadeIn_0.2s_ease-out]">
            <div class="p-4 rounded-2xl bg-white/5 border border-white/5 shadow-sm animate-[fadeIn_0.2s_ease-out]">
              <h4 class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>📅</span> 活动时间
              </h4>
              <p class="text-white/85 font-medium pl-5">
                {{ formatDate(activity.startTime) }} 至 {{ formatDate(activity.endTime) }}
              </p>
            </div>
            
            <div class="p-4 rounded-2xl bg-white/5 border border-white/5 shadow-sm animate-[fadeIn_0.2s_ease-out]">
              <h4 class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>📜</span> 参与规则
              </h4>
              <div class="rules-html text-white/85 whitespace-pre-wrap pl-5 font-medium leading-relaxed">
                {{ participationIntro || '暂无规则描述' }}
              </div>
            </div>
            
            <div class="p-4 rounded-2xl bg-white/5 border border-white/5 shadow-sm animate-[fadeIn_0.2s_ease-out]">
              <h4 class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>🎁</span> 奖项设置
              </h4>
              <div class="rules-html text-white/85 whitespace-pre-wrap prize-settings-text pl-5 font-medium leading-relaxed">
                {{ prizeSettingsText }}
              </div>
            </div>
            
            <div class="p-4 rounded-2xl bg-white/5 border border-white/5 shadow-sm animate-[fadeIn_0.2s_ease-out]" v-if="redeemRules">
              <h4 class="text-xs font-bold text-yellow-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span>💰</span> 兑兑说明
              </h4>
              <div class="text-white/85 whitespace-pre-wrap pl-5 font-medium leading-relaxed">
                {{ redeemRules }}
              </div>
            </div>
          </div>

          <!-- My Prizes Panel -->
          <div v-if="activeTab === 'myPrizes'" class="space-y-4 animate-[fadeIn_0.2s_ease-out]">
            <div v-if="!user.phone" class="py-16 text-center text-white/30 text-xs font-semibold">
              请先登记账号以查看您的中奖记录
            </div>
            <div v-else-if="myPrizes.length === 0" class="py-16 text-center text-white/30 text-xs font-semibold flex flex-col items-center gap-3">
              <span>🎮 暂无中奖记录</span>
              <span class="text-[10px] text-white/20">等待大屏幕开启游戏，进入前三名即可获得精美奖品！</span>
            </div>
            <div v-else class="space-y-3.5">
              <div v-for="record in myPrizes" :key="record.id" class="p-4 rounded-2xl bg-white/5 border border-white/5 shadow flex flex-col gap-3.5 animate-[fadeIn_0.2s_ease-out]">
                <div class="flex items-center justify-between">
                  <div>
                    <div class="text-sm font-bold text-white">{{ record.prizeName }}</div>
                    <div class="text-[10px] text-white/40 mt-0.5">时间: {{ formatDate(record.drawTime) }}</div>
                  </div>
                  <span 
                    class="px-3 py-1 rounded-full text-[10px] font-bold tracking-wide uppercase"
                    :class="[
                      record.winStatus === '2' ? 'bg-white/5 text-white/30 border border-white/5' : 
                      record.winStatus === '1' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm animate-pulse' : 'bg-white/5 text-white/20'
                    ]"
                  >
                    {{ getPrizeStatusText(record) }}
                  </span>
                </div>
                
                <div class="border-t border-white/5 pt-3 flex flex-col gap-2" v-if="record.winStatus === '1' || record.winStatus === '2'">
                  <div class="flex items-center gap-2">
                    <span class="text-[10px] text-white/40 font-bold uppercase shrink-0">兑奖凭证</span>
                    <span class="text-sm font-mono font-black text-rose-400 tracking-widest bg-rose-500/5 px-2.5 py-0.5 rounded-lg border border-rose-500/10 shadow-inner">
                      {{ record.redeemCode }}
                    </span>
                  </div>
                  <div class="text-[9px] text-white/45 font-medium" v-if="record.winStatus === '1'">
                    提示：请出示此兑奖码给现场工作人员进行核销兑奖。
                  </div>
                  <div class="text-[9px] text-white/35 font-medium" v-else>
                    已由管理员 [ {{ record.updateBy || '管理员' }} ] 核销兑奖。
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Login / Phone Register Modal -->
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]" v-if="showLoginModal">
      <!-- 遮罩层 -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="closeLoginModal"></div>
      
      <!-- 弹窗容器 -->
      <div class="relative w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 backdrop-blur-md shadow-2xl p-6 flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div class="flex items-center justify-between border-b border-white/10 pb-3">
          <h3 class="text-sm font-bold text-yellow-400">登记抽奖账号</h3>
          <button class="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-sm text-white/60 hover:text-white" @click="closeLoginModal">&times;</button>
        </div>
        
        <div class="space-y-4 text-left">
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-white/45 uppercase tracking-wider">选择化身头像</label>
            <div class="grid grid-cols-6 gap-2 bg-white/5 p-2 rounded-2xl border border-white/5">
              <button 
                v-for="emoji in presetEmojis" 
                :key="emoji" 
                class="w-8 h-8 rounded-xl flex items-center justify-center text-lg active:scale-90 transition-transform"
                :class="[loginForm.avatar === emoji ? 'bg-yellow-400 border border-yellow-300 text-black shadow' : 'hover:bg-white/5 text-white']"
                @click="loginForm.avatar = emoji"
              >
                {{ emoji }}
              </button>
            </div>
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-white/45 uppercase tracking-wider">姓名</label>
            <input type="text" v-model="loginForm.name" placeholder="请输入您的姓名" class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-xs text-white placeholder-white/20" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-white/45 uppercase tracking-wider">公司名称</label>
            <input type="text" v-model="loginForm.company" placeholder="请输入您的公司名称" class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-xs text-white placeholder-white/20" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-white/45 uppercase tracking-wider">职务</label>
            <input type="text" v-model="loginForm.job" placeholder="请输入您的职务" class="w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-xs text-white placeholder-white/20" />
          </div>
          <div class="flex flex-col gap-1.5">
            <label class="text-[10px] font-bold text-white/45 uppercase tracking-wider">联系电话</label>
            <div class="flex gap-2">
              <select v-model="loginForm.countryCode" class="px-2.5 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-xs text-white cursor-pointer select-none max-w-[120px] shrink-0">
                <option v-for="item in countryCodeList" :key="item.code" :value="item.code" class="bg-neutral-900 text-white">
                  {{ item.code }} ({{ item.name }})
                </option>
              </select>
              <input 
                type="tel" 
                v-model="loginForm.phone" 
                :placeholder="loginForm.countryCode === '+86' ? '请输入11位手机号' : '请输入联系电话'" 
                :maxlength="loginForm.countryCode === '+86' ? 11 : 15" 
                class="flex-1 px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 focus:border-yellow-400 focus:outline-none text-xs text-white placeholder-white/20" 
              />
            </div>
          </div>
        </div>

        <div class="flex gap-3 border-t border-white/10 pt-4 mt-2">
          <button class="flex-1 py-3 rounded-xl bg-white/5 border border-white/10 text-xs font-bold active:scale-95 transition-transform cursor-pointer" @click="closeLoginModal">取消</button>
          <button class="flex-1 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-xs font-extrabold active:scale-95 transition-transform cursor-pointer" @click="handleLoginSubmit">确定</button>
        </div>
      </div>
    </div>

    <!-- Win Modal -->
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.2s_ease-out]" v-if="showWinModal">
      <!-- 遮罩层 -->
      <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showWinModal = false"></div>
      
      <!-- 弹窗容器 -->
      <div class="relative w-full max-w-sm rounded-3xl bg-neutral-900 border border-white/10 backdrop-blur-md shadow-2xl p-6 flex flex-col gap-4">
        <canvas ref="confettiCanvas" class="absolute inset-0 pointer-events-none z-10 w-full h-full"></canvas>
        <div class="text-center relative z-20 flex flex-col items-center py-4">
          <div class="text-lg font-bold text-yellow-400 uppercase tracking-widest animate-bounce mb-2">🎉 恭喜您中奖啦！🎉</div>
          
          <div class="text-xs font-bold text-rose-400/90 mb-1 tracking-wide uppercase">{{ resultRecord.prizeLevel || '恭喜中奖' }}</div>
          <div class="text-xl font-black text-white mb-6">{{ resultRecord.prizeName }}</div>
          
          <div class="w-full p-4 rounded-2xl bg-white/5 border border-white/5 flex flex-col items-center text-center gap-2" v-if="resultRecord.winStatus === '1'">
            <span class="text-[10px] text-white/40 font-bold uppercase">您的专属兑奖码</span>
            <span class="text-2xl font-mono font-black text-rose-400 tracking-widest bg-rose-500/5 px-4 py-1.5 rounded-xl border border-rose-500/10 shadow-inner">{{ resultRecord.redeemCode }}</span>
            <p class="text-[10px] text-white/45 leading-relaxed mt-2 px-1">
              请妥善保管此兑奖码，在活动现场出示给工作人员即可核销兑奖。
            </p>
          </div>
          <div class="w-full p-4 rounded-2xl bg-white/5 border border-white/5 text-center text-xs text-white/50 leading-relaxed" v-else>
            很遗憾本次未中奖，感谢您的热情参与，期待您的下一次好运！
          </div>
          
          <button class="w-full mt-6 py-3 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-xs font-extrabold active:scale-95 transition-transform cursor-pointer" @click="showWinModal = false">
            太棒了
          </button>
        </div>
      </div>
    </div>
  </div>
</template>


<script>
// 消息提示桥接
function nuxtMsg(message, color = 'neutral') {
  const t = typeof window !== 'undefined' ? window.__nuxt_ui_toast__ : null
  if (t) t.add({ title: String(message), color, duration: 4000 })
}
function nuxtConfirm(content, title) {
  return new Promise((resolve, reject) => {
    if (typeof window !== 'undefined' && window.confirm(String(content || title))) {
      resolve('confirm')
    } else {
      reject(new Error('cancel'))
    }
  })
}
</script>

<script setup>

// Routing & Activity Configuration
const route = useRoute()
const activityId = ref(1) // Default seed activity ID

// State
const activity = ref({})
const recentWinners = ref([])
const myPrizes = ref([])
const activeTab = ref('rules')
const tickerIndex = ref(0)
const tickerTimer = ref(null)

// User State (LocalStorage Cached)
const user = ref({
  phone: '',
  name: '',
  company: '',
  job: '',
  avatar: ''
})

// Modals
const showLoginModal = ref(false)
const showWinModal = ref(false)
const loginForm = ref({
  phone: '',
  name: '',
  company: '',
  job: '',
  avatar: '',
  countryCode: '+86'
})

// Emojis
const presetEmojis = ['🚀', '🦊', '🐼', '🦖', '🦄', '🦁', '🐯', '🐨', '🦈', '🦅', '👾', '🤖']

const countryCodeList = [
  { code: '+86', name: '中国' },
  { code: '+852', name: '中国香港' },
  { code: '+853', name: '中国澳门' },
  { code: '+886', name: '中国台湾' },
  { code: '+1', name: '美国/加拿大' },
  { code: '+44', name: '英国' },
  { code: '+81', name: '日本' },
  { code: '+82', name: '韩国' },
  { code: '+65', name: '新加坡' },
  { code: '+60', name: '马来西亚' },
  { code: '+61', name: '澳大利亚' },
  { code: '+64', name: '新西兰' },
  { code: '+49', name: '德国' },
  { code: '+33', name: '法国' },
  { code: '+39', name: '意大利' },
  { code: '+7', name: '俄罗斯' },
  { code: '+91', name: '印度' },
  { code: '+90', name: '土耳其' },
  { code: '+34', name: '西班牙' },
  { code: '+55', name: '巴西' },
  { code: '+27', name: '南非' },
  { code: '+20', name: '埃及' },
  { code: '+30', name: '希腊' },
  { code: '+31', name: '荷兰' },
  { code: '+32', name: '比利时' },
  { code: '+41', name: '瑞士' },
  { code: '+43', name: '奥地利' },
  { code: '+45', name: '丹麦' },
  { code: '+46', name: '瑞典' },
  { code: '+47', name: '挪威' },
  { code: '+48', name: '波兰' },
  { code: '+52', name: '墨西哥' },
  { code: '+54', name: '阿根廷' },
  { code: '+62', name: '印度尼西亚' },
  { code: '+63', name: '菲律宾' },
  { code: '+66', name: '泰国' },
  { code: '+84', name: '越南' },
  { code: '+92', name: '巴基斯坦' },
  { code: '+93', name: '阿富汗' },
  { code: '+94', name: '斯里兰卡' },
  { code: '+95', name: '缅甸' },
  { code: '+98', name: '伊朗' },
  { code: '+212', name: '摩洛哥' },
  { code: '+213', name: '阿尔及利亚' },
  { code: '+216', name: '突尼斯' },
  { code: '+218', name: '利比亚' },
  { code: '+220', name: '冈比亚' },
  { code: '+221', name: '塞内加尔' },
  { code: '+222', name: '毛里塔尼亚' },
  { code: '+223', name: '马里' },
  { code: '+224', name: '几内亚' },
  { code: '+225', name: '科特迪瓦' },
  { code: '+226', name: '布基纳法索' },
  { code: '+227', name: '尼日尔' },
  { code: '+228', name: '多哥' },
  { code: '+229', name: '贝宁' },
  { code: '+230', name: '毛里求斯' },
  { code: '+231', name: '利比里亚' },
  { code: '+232', name: '塞拉利昂' },
  { code: '+233', name: '加纳' },
  { code: '+234', name: '尼日利亚' },
  { code: '+235', name: '乍得' },
  { code: '+236', name: '中非' },
  { code: '+237', name: '喀麦隆' },
  { code: '+238', name: '佛得角' },
  { code: '+239', name: '圣多美和普林西比' },
  { code: '+240', name: '赤道几内亚' },
  { code: '+241', name: '加蓬' },
  { code: '+242', name: '刚果' },
  { code: '+243', name: '民主刚果' },
  { code: '+244', name: '安哥拉' },
  { code: '+245', name: '几内亚比绍' },
  { code: '+248', name: '塞舌尔' },
  { code: '+249', name: '苏丹' },
  { code: '+250', name: '卢旺达' },
  { code: '+251', name: '埃塞俄比亚' },
  { code: '+252', name: '索马里' },
  { code: '+253', name: '吉布提' },
  { code: '+254', name: '肯尼亚' },
  { code: '+255', name: '坦桑尼亚' },
  { code: '+256', name: '乌干达' },
  { code: '+257', name: '布隆迪' },
  { code: '+258', name: '莫桑比克' },
  { code: '+260', name: '赞比亚' },
  { code: '+261', name: '马达加斯加' },
  { code: '+262', name: '留尼汪' },
  { code: '+263', name: '津巴布韦' },
  { code: '+264', name: '纳米比亚' },
  { code: '+265', name: '马拉维' },
  { code: '+266', name: '莱索托' },
  { code: '+267', name: '博茨瓦纳' },
  { code: '+268', name: '斯威士兰' },
  { code: '+269', name: '科摩罗' },
  { code: '+290', name: '圣赫勒拿' },
  { code: '+291', name: '厄立特里亚' },
  { code: '+297', name: '阿鲁巴' },
  { code: '+298', name: '法罗群岛' },
  { code: '+299', name: '格陵兰' },
  { code: '+350', name: '直布罗陀' },
  { code: '+351', name: '葡萄牙' },
  { code: '+352', name: '卢森堡' },
  { code: '+353', name: '爱尔兰' },
  { code: '+354', name: '冰岛' },
  { code: '+355', name: '阿尔巴尼亚' },
  { code: '+356', name: '马耳他' },
  { code: '+357', name: '塞浦路斯' },
  { code: '+358', name: '芬兰' },
  { code: '+359', name: '保加利亚' },
  { code: '+370', name: '立陶宛' },
  { code: '+371', name: '拉脱维亚' },
  { code: '+372', name: '爱沙尼亚' },
  { code: '+373', name: '摩尔多瓦' },
  { code: '+374', name: '亚美尼亚' },
  { code: '+375', name: '白俄罗斯' },
  { code: '+376', name: '安道尔' },
  { code: '+377', name: '摩纳哥' },
  { code: '+378', name: '圣马力诺' },
  { code: '+380', name: '乌克兰' },
  { code: '+381', name: '塞尔维亚' },
  { code: '+382', name: '黑山' },
  { code: '+385', name: '克罗地亚' },
  { code: '+386', name: '斯洛文尼亚' },
  { code: '+387', name: '波黑' },
  { code: '+389', name: '北马其顿' },
  { code: '+420', name: '捷克' },
  { code: '+421', name: '斯洛伐克' },
  { code: '+423', name: '列支敦士登' },
  { code: '+501', name: '伯利兹' },
  { code: '+502', name: '危地马拉' },
  { code: '+503', name: '萨尔瓦多' },
  { code: '+504', name: '洪都拉斯' },
  { code: '+505', name: '尼加拉瓜' },
  { code: '+506', name: '哥斯达黎加' },
  { code: '+507', name: '巴拿马' },
  { code: '+509', name: '海地' },
  { code: '+590', name: '瓜德罗普' },
  { code: '+591', name: '玻利维亚' },
  { code: '+592', name: '圭亚那' },
  { code: '+593', name: '厄瓜多尔' },
  { code: '+594', name: '法属圭亚那' },
  { code: '+595', name: '巴拉圭' },
  { code: '+596', name: '马提尼克' },
  { code: '+597', name: '苏里南' },
  { code: '+598', name: '乌拉圭' },
  { code: '+670', name: '东帝汶' },
  { code: '+673', name: '文莱' },
  { code: '+674', name: '瑙鲁' },
  { code: '+675', name: '巴布亚新几内亚' },
  { code: '+676', name: '汤加' },
  { code: '+677', name: '所罗门群岛' },
  { code: '+678', name: '瓦努阿图' },
  { code: '+679', name: '斐济' },
  { code: '+680', name: '帕劳' },
  { code: '+685', name: '萨摩亚' },
  { code: '+686', name: '基里巴斯' },
  { code: '+687', name: '新喀里多尼亚' },
  { code: '+688', name: '图瓦卢' },
  { code: '+689', name: '法属波利尼西亚' },
  { code: '+850', name: '朝鲜' },
  { code: '+855', name: '柬埔寨' },
  { code: '+856', name: '老挝' },
  { code: '+880', name: '孟加拉国' },
  { code: '+960', name: '马尔代夫' },
  { code: '+961', name: '黎巴嫩' },
  { code: '+962', name: '约旦' },
  { code: '+963', name: '叙利亚' },
  { code: '+964', name: '伊拉克' },
  { code: '+965', name: '科威特' },
  { code: '+966', name: '沙特阿拉伯' },
  { code: '+967', name: '也门' },
  { code: '+968', name: '阿曼' },
  { code: '+970', name: '巴勒斯坦' },
  { code: '+971', name: '阿联酋' },
  { code: '+972', name: '以色列' },
  { code: '+973', name: '巴林' },
  { code: '+974', name: '卡塔尔' },
  { code: '+975', name: '不丹' },
  { code: '+976', name: '蒙古' },
  { code: '+977', name: '尼泊尔' },
  { code: '+992', name: '塔吉克斯坦' },
  { code: '+993', name: '土库曼斯坦' },
  { code: '+994', name: '阿塞拜疆' },
  { code: '+995', name: '格鲁吉亚' },
  { code: '+996', name: '吉尔吉斯斯坦' },
  { code: '+998', name: '乌兹别克斯坦' }
]

const pkRoom = ref({
  status: 'waiting',
  remainingMillis: 0,
  players: []
})
const clickCount = ref(0)
const localIncrementAccumulator = ref(0)
const hasJoinedPkRoom = ref(false)
const lobbyPlayerCount = ref(0)
let pkPollingTimer = null
let pkLobbyPreviewTimer = null
let pkUploadTimer = null
const countdownText = ref('')
const resultRecord = ref({})

// Confetti Effect
const confettiCanvas = ref(null)
let confettiAnimationId = null

onMounted(() => {
  // Check query params for openid / phone / activityId
  if (route.query.activityId) {
    activityId.value = parseInt(route.query.activityId)
  }
  
  // Read cached user from localStorage
  const cachedUser = localStorage.getItem('lucky_user')
  if (cachedUser) {
    try {
      const parsed = JSON.parse(cachedUser)
      const cachedPhone = parsed.phone || ''
      let cCode = '+86'
      let mainPhone = cachedPhone
      
      // 智能比对已有的全球所有电话前缀进行拆分
      for (const item of countryCodeList) {
        if (cachedPhone.startsWith(item.code)) {
          cCode = item.code
          mainPhone = cachedPhone.substring(item.code.length)
          break
        }
      }

      user.value = {
        phone: cachedPhone,
        name: parsed.name || '',
        company: parsed.company || '',
        job: parsed.job || '',
        avatar: parsed.avatar || '🚀'
      }
      loginForm.value = { 
        ...user.value,
        countryCode: cCode,
        phone: mainPhone
      }
    } catch (e) {
      console.error(e)
    }
  }

  // If query params has user details, override
  if (route.query.phone) {
    user.value.phone = route.query.phone
    user.value.name = route.query.name || '微信用户'
    user.value.company = route.query.company || ''
    user.value.job = route.query.job || ''
    user.value.avatar = route.query.avatar || '🚀'
    localStorage.setItem('lucky_user', JSON.stringify(user.value))
    loginForm.value = { ...user.value }
  }

  loadActivityDetail()
  loadRecentWinners()
  if (!user.value.phone) {
    startLobbyPreviewPolling()
  }

  // Auto scroll winners ticker
  tickerTimer.value = setInterval(() => {
    if (recentWinners.value.length > 1) {
      tickerIndex.value = (tickerIndex.value + 1) % recentWinners.value.length
    }
  }, 3000)
})

// Format dates nicely
const formatDate = (dateStr) => {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const pad = (n) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const prizes = ref([])

const dynamicSubtitle = computed(() => buildPrizeSubtitle(prizes.value, 'mobile'))

const parsedDescription = computed(() => parseActivityDescription(activity.value.description))
const participationIntro = computed(() => parsedDescription.value.intro)
const redeemRules = computed(() => parsedDescription.value.redeem)
const prizeSettingsText = computed(() => buildPrizeSettingsText(prizes.value))

const loadActivityDetail = async () => {
  try {
    const res = await getPublicActivityDetail(activityId.value)
    if (res.code === 200) {
      activity.value = res.data.activity || {}
      prizes.value = res.data.prizes || []
      nextTick(() => {
        joinPkRoomIfNecessary()
      })
    } else {
      nuxtMsg(res.msg || '获取活动详情失败', 'error')
    }
  } catch (e) {
    console.error(e)
    nuxtMsg('获取活动详情失败', 'error')
  }
}

// Load ticker list
const loadRecentWinners = async () => {
  try {
    const res = await publicRecentWinners(activityId.value)
    if (res.code === 200) {
      recentWinners.value = res.data
    }
  } catch (e) {
    console.error(e)
  }
}

// Load user draw history
const loadMyPrizes = async () => {
  if (!user.value.phone) return
  try {
    const res = await publicMyPrizes(activityId.value, user.value.phone)
    if (res.code === 200) {
      myPrizes.value = res.data
    }
  } catch (e) {
    console.error(e)
  }
}

// Tab triggers
const handleMyPrizesTab = () => {
  activeTab.value = 'myPrizes'
  loadMyPrizes()
}

// User Registration Submit
const handleLoginSubmit = () => {
  const { countryCode, phone, name, company, job, avatar } = loginForm.value
  if (!name || !name.trim()) {
    nuxtMsg('请输入您的姓名', 'warning')
    return
  }
  if (!company || !company.trim()) {
    nuxtMsg('请输入您的公司名称', 'warning')
    return
  }
  if (!job || !job.trim()) {
    nuxtMsg('请输入您的职务', 'warning')
    return
  }
  const trimmedPhone = (phone || '').trim()
  if (countryCode === '+86') {
    if (!/^\d{11}$/.test(trimmedPhone)) {
      nuxtMsg('请输入11位数字手机号', 'warning')
      return
    }
  } else {
    // 世界上其它所有国家/地区电话，校验 5 至 15 位数字即可
    if (!/^\d{5,15}$/.test(trimmedPhone)) {
      nuxtMsg('请输入正确的联系电话数字', 'warning')
      return
    }
  }

  const fullPhone = countryCode + trimmedPhone
  user.value = { phone: fullPhone, name, company, job, avatar: avatar || '🚀' }
  localStorage.setItem('lucky_user', JSON.stringify(user.value))
  showLoginModal.value = false
  nuxtMsg('账号登记成功，等待大屏幕开始游戏！', 'success')
  joinPkRoomIfNecessary()
  if (activeTab.value === 'myPrizes') {
    loadMyPrizes()
  }
}

const closeLoginModal = () => {
  showLoginModal.value = false
}

// Confetti Particle animation
const triggerConfetti = () => {
  const canvas = confettiCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  
  canvas.width = canvas.parentElement.clientWidth
  canvas.height = canvas.parentElement.clientHeight
  
  const colors = ['#fbc531', '#e84118', '#00a8ff', '#4cd137', '#9c88ff']
  const particles = []
  
  for (let i = 0; i < 80; i++) {
    particles.push({
      x: canvas.width / 2,
      y: canvas.height / 2 - 20,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.8) * 12,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10
    })
  }

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    let active = false
    for (let p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += 0.35 // gravity
      p.rotation += p.rotSpeed
      
      if (p.y < canvas.height && p.x > 0 && p.x < canvas.width) {
        active = true
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation * Math.PI / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size)
        ctx.restore()
      }
    }
    
    if (active) {
      confettiAnimationId = requestAnimationFrame(animate)
    }
  }
  
  animate()
}

const stopLobbyPreviewPolling = () => {
  if (pkLobbyPreviewTimer) {
    clearInterval(pkLobbyPreviewTimer)
    pkLobbyPreviewTimer = null
  }
}

const startLobbyPreviewPolling = () => {
  stopLobbyPreviewPolling()
  const pollLobbyPreview = async () => {
    if (user.value.phone) {
      stopLobbyPreviewPolling()
      return
    }
    try {
      const res = await getRoomStatus(activityId.value)
      if (res.code === 200) {
        lobbyPlayerCount.value = (res.data.players || []).length
      }
    } catch (e) {
      console.error(e)
    }
  }
  pollLobbyPreview()
  pkLobbyPreviewTimer = setInterval(pollLobbyPreview, 2000)
}

const joinPkRoomIfNecessary = async () => {
  if (!user.value.phone) return
  stopLobbyPreviewPolling()
  try {
    const res = await joinRoom({
      activityId: activityId.value,
      phone: user.value.phone,
      name: user.value.name,
      avatar: user.value.avatar || '🚀',
      company: user.value.company,
      job: user.value.job
    })
    if (res.code === 200) {
      hasJoinedPkRoom.value = true
      startPkPolling()
    } else {
      nuxtMsg(res.msg || '加入联机房间失败', 'error')
    }
  } catch (e) {
    console.error(e)
    nuxtMsg('网络错误，无法加入联机房间', 'error')
  }
}

const startPkPolling = () => {
  if (pkPollingTimer) clearInterval(pkPollingTimer)
  pollPkStatus()
  pkPollingTimer = setInterval(pollPkStatus, 1000)
}

const pollPkStatus = async () => {
  if (!user.value.phone) return
  try {
    const res = await getRoomStatus(activityId.value)
    if (res.code === 200) {
      const prevStatus = pkRoom.value.status
      pkRoom.value.status = res.data.status
      pkRoom.value.remainingMillis = res.data.remainingMillis
      pkRoom.value.players = res.data.players || []

      // 状态改变时重新载入活动奖项详情
      if (prevStatus !== res.data.status) {
        loadActivityDetail()
      }

      if (pkRoom.value.status === 'gaming' && prevStatus !== 'gaming') {
        clickCount.value = 0
        localIncrementAccumulator.value = 0
        enableClickUpload()
      }

      if (pkRoom.value.status === 'ended' && prevStatus === 'gaming') {
        disableClickUpload()
        flushAccumulatedClicks()
        setTimeout(checkPkGameResult, 1500)
      }
    }
  } catch (e) {
    console.error(e)
  }
}

watch(() => pkRoom.value.status, (newStatus) => {
  if (newStatus === 'countdown') {
    runLobbyCountdown()
  }
})

const runLobbyCountdown = () => {
  const interval = setInterval(() => {
    if (pkRoom.value.status !== 'countdown') {
      clearInterval(interval)
      return
    }
    const rem = pkRoom.value.remainingMillis
    const seconds = Math.ceil(rem / 1000)
    if (seconds > 0) {
      countdownText.value = String(seconds)
    } else {
      countdownText.value = 'GO!'
      clearInterval(interval)
    }
  }, 100)
}

// Screen Tapping Gaming Logic
let isSensing = false
const lastTapTime = ref(0)

const enableClickUpload = () => {
  if (isSensing) return
  isSensing = true
  if (pkUploadTimer) clearInterval(pkUploadTimer)
  pkUploadTimer = setInterval(flushAccumulatedClicks, 200)
}

const disableClickUpload = () => {
  isSensing = false
  if (pkUploadTimer) {
    clearInterval(pkUploadTimer)
    pkUploadTimer = null
  }
}

const playTapSound = () => {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.connect(gain)
    gain.connect(audioCtx.destination)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(150, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(700, audioCtx.currentTime + 0.08)
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08)
    osc.start()
    osc.stop(audioCtx.currentTime + 0.08)
  } catch (e) {}
}

const triggerSingleTap = () => {
  if (pkRoom.value.status !== 'gaming') return
  clickCount.value++
  localIncrementAccumulator.value++
  lastTapTime.value = Date.now()
  setTimeout(() => {
    if (Date.now() - lastTapTime.value >= 100) {
      lastTapTime.value = 0
    }
  }, 100)

  if (navigator.vibrate) {
    navigator.vibrate(40)
  }
  playTapSound()
}

const flushAccumulatedClicks = async () => {
  const toSend = localIncrementAccumulator.value
  if (toSend <= 0) return
  localIncrementAccumulator.value = 0
  try {
    await incrementCount({
      activityId: activityId.value,
      phone: user.value.phone,
      count: toSend,
      nonce: Math.random().toString(36).substring(2, 15)
    })
  } catch (e) {
    localIncrementAccumulator.value += toSend
    console.error('上报点击计数失败', e)
  }
}

const checkPkGameResult = async () => {
  await loadMyPrizes()
  if (myPrizes.value.length > 0) {
    const sorted = [...myPrizes.value].sort((a, b) => b.id - a.id)
    const newest = sorted[0]
    resultRecord.value = newest
    showWinModal.value = true
    if (newest.winStatus === '1') {
      nextTick(() => {
        triggerConfetti()
      })
    }
  }
}

const getPrizeStatusText = (record) => {
  if (record.winStatus === '2') {
    return '已核销兑换'
  }
  if (record.winStatus === '1') {
    return '未兑奖'
  }
  return '谢谢参与'
}

const isEmoji = (str) => {
  if (!str) return false
  const ranges = [
    '\u2700-\u27BF', '\uE000-\uF8FF', '\uD83C[\uDC00-\uDFFF]',
    '\uD83D[\uDC00-\uDFFF]', '[\u2011-\u26FF]', '\uD83E[\uDD10-\uDDFF]'
  ]
  return new RegExp(ranges.join('|'), 'g').test(str)
}

const getInitials = (name) => {
  if (!name) return ''
  return name.trim().charAt(0)
}

const getRandomGradient = (phone) => {
  let hash = 0
  if (phone) {
    for (let i = 0; i < phone.length; i++) {
      hash = phone.charCodeAt(i) + ((hash << 5) - hash)
    }
  }
  const h = Math.abs(hash % 360)
  return {
    background: `linear-gradient(135deg, hsl(${h}, 85%, 65%) 0%, hsl(${(h + 120) % 360}, 85%, 45%) 100%)`,
    boxShadow: `0 4px 10px rgba(0,0,0,0.3)`
  }
}

onBeforeUnmount(() => {
  if (tickerTimer.value) clearInterval(tickerTimer.value)
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId)
  if (pkPollingTimer) clearInterval(pkPollingTimer)
  stopLobbyPreviewPolling()
  disableClickUpload()
})
</script>

<style scoped>
/* 仅保留星空背景星粒子与补间关键帧，其余全部用 Tailwind 代替 */
.stars-bg {
  background-image: 
    radial-gradient(white, rgba(255,255,255,.2) 2px, transparent 40px),
    radial-gradient(white, rgba(255,255,255,.15) 1px, transparent 30px);
  background-size: 550px 550px, 350px 350px;
  background-position: 0 0, 40px 60px;
  opacity: 0.12;
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
