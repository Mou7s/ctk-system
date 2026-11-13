<template>
  <div class="lucky-screen-container relative w-screen h-screen bg-gradient-to-br from-red-800 to-red-950 text-white overflow-hidden flex flex-col box-border select-none">
    <!-- Starfield/Bubble background -->
    <div class="stars-bg absolute inset-0 pointer-events-none"></div>

    <!-- Header Section -->
    <div class="relative z-10 flex flex-col items-center pt-8 pb-4 shrink-0">
      <h1 class="text-4xl md:text-5xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-b from-yellow-200 via-yellow-400 to-amber-500 drop-shadow-[0_4px_12px_rgba(241,196,15,0.45)] text-center animate-pulse">
        {{ activity.title || '联机点击大PK' }}
      </h1>
      <p class="mt-2 text-sm md:text-base font-semibold tracking-wider text-yellow-100/80 uppercase">
        {{ dynamicSubtitle }}
      </p>
    </div>

    <!-- Error/Notice Banner -->
    <div v-if="errorMsg" class="mx-auto my-2 px-6 py-2 bg-rose-500/15 border border-rose-500/30 rounded-full text-xs font-semibold text-rose-300 flex items-center gap-2 animate-bounce z-20">
      <span>⚠️ {{ errorMsg }}</span>
    </div>

    <!-- Main Content Area -->
    <div class="relative z-10 flex-1 w-full max-w-[1600px] mx-auto px-6 pb-6 overflow-hidden flex flex-col justify-stretch">
      <!-- 1. WAITING STAGE: Player Lobby & Sign In QR -->
      <div v-if="room.status === 'waiting'" class="flex-grow min-h-0 flex gap-6 items-stretch animate-[fadeIn_0.5s_ease-out]">
        <!-- 左侧二维码 -->
        <div class="w-80 shrink-0 flex flex-col justify-center">
          <div class="p-6 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md shadow-2xl flex flex-col items-center text-center">
            <h3 class="text-base font-bold text-yellow-400 tracking-wide mb-4">关注微信公众号参与PK</h3>
            <div class="p-3 bg-white rounded-2xl shadow-inner mb-4">
              <img :src="qrCodeUrl" alt="QR Code" class="w-48 h-48 rounded-lg" @error="handleQrImageError" />
            </div>
            <div class="text-xs text-white/60 leading-relaxed mb-6">扫码关注公众号，从底部菜单进入参与PK</div>
            <div class="px-5 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-sm font-semibold">
              当前已加入：<span class="text-yellow-400 font-black text-lg animate-pulse">{{ room.players.length }}</span> 人
            </div>
          </div>
        </div>

        <!-- 右侧加入选手墙 -->
        <div class="flex-1 min-w-0 rounded-3xl bg-black/25 border border-white/5 backdrop-blur-sm p-6 flex flex-col overflow-hidden">
          <div class="flex items-center gap-2 text-base font-bold text-yellow-400/90 border-b border-white/10 pb-3 mb-4 shrink-0">
            <UIcon name="i-lucide-users" class="size-5" />
            <span>参赛选手准备中</span>
          </div>
          
          <div class="flex-grow overflow-y-auto pr-1">
            <TransitionGroup name="player-pop" tag="div" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <div v-for="player in room.players" :key="player.phone" class="p-3.5 rounded-2xl bg-white/5 border border-white/5 flex items-center gap-3 shadow-sm hover:bg-white/10 transition-all duration-200">
                <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white shadow" :style="getRandomGradient(player.phone)">
                  <span v-if="isEmoji(player.avatar)" class="text-lg">{{ player.avatar }}</span>
                  <span v-else>{{ getInitials(player.name) }}</span>
                </div>
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-bold text-white truncate">{{ player.name }}</div>
                  <div class="text-[10px] text-white/40 truncate mt-0.5" v-if="player.company">{{ player.company }}</div>
                </div>
              </div>
            </TransitionGroup>
            <div v-if="room.players.length === 0" class="h-full flex items-center justify-center text-white/40 text-sm py-12">
              等待选手扫码入场，请关注公众号后进入...
            </div>
          </div>
        </div>
      </div>

      <!-- 2. COUNTDOWN STAGE: 3, 2, 1 Prep -->
      <div v-if="room.status === 'countdown'" class="flex-grow flex items-center justify-center animate-[scaleIn_0.3s_ease-out]">
        <div class="w-64 h-64 rounded-full border-8 border-dashed border-yellow-400 flex flex-col items-center justify-center bg-black/45 shadow-[0_0_50px_rgba(234,179,8,0.4)] animate-pulse">
          <div class="text-center select-none">
            <div class="text-8xl font-black text-yellow-300 drop-shadow-[0_0_20px_rgba(234,179,8,0.6)] leading-none" :key="countdownText">
              {{ countdownText }}
            </div>
            <div class="text-sm tracking-widest text-white font-bold mt-2">READY</div>
          </div>
        </div>
      </div>

      <!-- 3. GAMING STAGE: The Race Track -->
      <div v-if="room.status === 'gaming'" class="flex-grow min-h-0 flex gap-6 items-stretch animate-[fadeIn_0.5s_ease-out]">
        <!-- 左侧跑道 -->
        <div class="flex-1 min-w-0 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md p-6 flex flex-col overflow-hidden">
          <div class="flex items-center justify-between border-b border-white/10 pb-4 mb-5 shrink-0">
            <div class="text-lg font-bold text-yellow-400 flex items-center gap-2">
              <UIcon name="i-lucide-footprints" class="size-5" />
              <span>实时比赛跑道</span>
            </div>
            <div class="px-4 py-1.5 rounded-full bg-red-500/20 border border-red-500/30 text-sm font-semibold flex items-center gap-1.5">
              <span>剩余时间</span>
              <span class="text-yellow-300 font-mono text-base font-black">{{ (room.remainingMillis / 1000).toFixed(1) }}</span>
              <span>秒</span>
            </div>
          </div>

          <!-- 赛道区域 -->
          <div class="flex-grow overflow-y-auto space-y-4 pr-1 flex flex-col justify-around">
            <div v-if="racingPlayers.length === 0" class="h-full flex items-center justify-center text-white/40 text-sm">
              暂无参赛选手，请手机扫码登记后由管理员点击「开始点击PK」
            </div>
            <div v-for="(player, index) in racingPlayers" :key="player.phone" class="relative h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center px-4 overflow-hidden shadow-inner">
              <!-- 跑道序号 -->
              <div class="w-8 h-8 rounded-full bg-white/10 border border-white/10 flex items-center justify-center text-xs font-bold text-white/70 mr-4 z-10 shrink-0">
                {{ index + 1 }}
              </div>
              
              <!-- 跑道线 -->
              <div class="absolute left-16 right-16 top-1/2 -translate-y-1/2 border-t border-dashed border-white/10 z-0"></div>

              <!-- 终点线 -->
              <div class="absolute right-12 top-0 bottom-0 w-1 border-r-4 border-double border-white/20 z-0"></div>

              <!-- Runner 节点 -->
              <div 
                class="absolute z-10 flex items-center gap-2.5" 
                :style="{ left: `calc(3rem + ${getRunnerProgress(player.clickCount)}%)`, transition: 'left 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)' }"
              >
                <!-- 头像 -->
                <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white shadow-[0_0_15px_rgba(0,0,0,0.5)] border-2 border-white" :style="getRandomGradient(player.phone)">
                  <span v-if="isEmoji(player.avatar)" class="text-lg">{{ player.avatar }}</span>
                  <span v-else>{{ getInitials(player.name) }}</span>
                </div>
                <!-- 气泡 -->
                <div class="px-2.5 py-1 rounded-xl bg-black/60 border border-white/20 flex flex-col shadow min-w-[64px]">
                  <span class="text-[10px] font-bold text-white truncate max-w-[60px]">{{ player.name }}</span>
                  <span class="text-xs font-mono font-black text-yellow-400 mt-0.5 leading-none">{{ player.clickCount }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 右侧实时排名 -->
        <div class="w-80 shrink-0 rounded-3xl bg-black/25 border border-white/5 backdrop-blur-sm p-6 flex flex-col overflow-hidden">
          <div class="text-base font-bold text-yellow-400/90 border-b border-white/10 pb-3 mb-4 flex items-center gap-2 shrink-0">
            <UIcon name="i-lucide-trophy" class="size-5" />
            <span>实时排行 (TOP 10)</span>
          </div>
          
          <div class="flex-grow overflow-y-auto space-y-2 pr-1">
            <div v-for="(player, idx) in room.players.slice(0, 10)" :key="player.phone" class="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3">
              <!-- 名次徽标 -->
              <div 
                class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black"
                :class="[
                  idx === 0 ? 'bg-yellow-400 text-black' : 
                  idx === 1 ? 'bg-neutral-300 text-black' : 
                  idx === 2 ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/60'
                ]"
              >
                {{ idx + 1 }}
              </div>
              <!-- 头像 -->
              <div class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-white shadow-sm" :style="getRandomGradient(player.phone)">
                <span v-if="isEmoji(player.avatar)" class="text-sm">{{ player.avatar }}</span>
                <span v-else>{{ getInitials(player.name) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-white truncate">{{ player.name }}</div>
              </div>
              <div class="text-sm font-mono font-black text-yellow-400">{{ player.clickCount }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 4. ENDED STAGE: The Podium & Winners -->
      <div v-if="room.status === 'ended'" class="flex-grow min-h-0 flex gap-6 items-stretch animate-[fadeIn_0.5s_ease-out]">
        <!-- 礼花画布 -->
        <canvas ref="confettiCanvas" class="absolute inset-0 pointer-events-none z-10 w-full h-full"></canvas>

        <!-- 左侧领奖台 -->
        <div class="flex-1 rounded-3xl bg-black/35 border border-white/10 backdrop-blur-md p-6 flex flex-col justify-between overflow-hidden">
          <h2 class="text-xl font-black text-yellow-400 flex items-center gap-2 border-b border-white/10 pb-4 mb-4 shrink-0">
            🏆 比赛结束 · 成绩公布
          </h2>
          
          <!-- 领奖台主体 -->
          <div class="flex-grow flex items-end justify-center gap-6 px-4 pb-4">
            <!-- 2nd Place -->
            <div class="flex flex-col items-center w-36" v-if="room.players[1]">
              <div class="relative mb-3">
                <div class="w-20 h-20 rounded-full border-4 border-neutral-300 shadow-[0_0_20px_rgba(255,255,255,0.15)] flex items-center justify-center text-2xl font-bold text-white" :style="getRandomGradient(room.players[1].phone)">
                  <span v-if="isEmoji(room.players[1].avatar)">{{ room.players[1].avatar }}</span>
                  <span v-else>{{ getInitials(room.players[1].name) }}</span>
                </div>
                <div class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-neutral-300 text-black border-2 border-white flex items-center justify-center text-xs font-black">2</div>
              </div>
              <div class="text-sm font-bold text-white/95 truncate w-full text-center">{{ room.players[1].name }}</div>
              <div class="text-xs font-mono font-bold text-yellow-400 mt-0.5">{{ room.players[1].clickCount }} 次</div>
              <div class="w-full h-24 mt-4 bg-gradient-to-t from-neutral-800/80 to-neutral-700/60 border-t border-neutral-600/50 rounded-t-2xl flex items-center justify-center text-neutral-400 font-extrabold text-base shadow-inner">2nd</div>
            </div>

            <!-- 1st Place -->
            <div class="flex flex-col items-center w-40" v-if="room.players[0]">
              <div class="text-3xl animate-bounce mb-1">👑</div>
              <div class="relative mb-3">
                <div class="w-24 h-24 rounded-full border-4 border-yellow-400 shadow-[0_0_30px_rgba(234,179,8,0.4)] flex items-center justify-center text-3xl font-bold text-white" :style="getRandomGradient(room.players[0].phone)">
                  <span v-if="isEmoji(room.players[0].avatar)">{{ room.players[0].avatar }}</span>
                  <span v-else>{{ getInitials(room.players[0].name) }}</span>
                </div>
                <div class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-yellow-400 text-black border-2 border-white flex items-center justify-center text-sm font-black">1</div>
              </div>
              <div class="text-base font-black text-white truncate w-full text-center">{{ room.players[0].name }}</div>
              <div class="text-sm font-mono font-black text-yellow-300 mt-0.5">{{ room.players[0].clickCount }} 次</div>
              <div class="w-full h-32 mt-4 bg-gradient-to-t from-yellow-700/80 to-yellow-600/60 border-t border-yellow-500/50 rounded-t-2xl flex items-center justify-center text-yellow-300 font-black text-lg shadow-md animate-pulse">1st</div>
            </div>

            <!-- 3rd Place -->
            <div class="flex flex-col items-center w-36" v-if="room.players[2]">
              <div class="relative mb-3">
                <div class="w-20 h-20 rounded-full border-4 border-amber-600 shadow-[0_0_20px_rgba(217,119,6,0.15)] flex items-center justify-center text-2xl font-bold text-white" :style="getRandomGradient(room.players[2].phone)">
                  <span v-if="isEmoji(room.players[2].avatar)">{{ room.players[2].avatar }}</span>
                  <span v-else>{{ getInitials(room.players[2].name) }}</span>
                </div>
                <div class="absolute -bottom-2.5 left-1/2 -translate-x-1/2 w-7 h-7 rounded-full bg-amber-600 text-white border-2 border-white flex items-center justify-center text-xs font-black">3</div>
              </div>
              <div class="text-sm font-bold text-white/95 truncate w-full text-center">{{ room.players[2].name }}</div>
              <div class="text-xs font-mono font-bold text-yellow-400 mt-0.5">{{ room.players[2].clickCount }} 次</div>
              <div class="w-full h-20 mt-4 bg-gradient-to-t from-amber-900/80 to-amber-800/60 border-t border-amber-700/50 rounded-t-2xl flex items-center justify-center text-amber-500 font-extrabold text-sm shadow-inner">3rd</div>
            </div>
          </div>
        </div>

        <!-- 右侧完整榜单 -->
        <div class="w-96 shrink-0 rounded-3xl bg-black/25 border border-white/5 backdrop-blur-sm p-6 flex flex-col overflow-hidden">
          <div class="text-base font-bold text-yellow-400 border-b border-white/10 pb-4 mb-4 flex items-center gap-2 shrink-0">
            <UIcon name="i-lucide-list" class="size-5" />
            <span>完整榜单 (TOP 10)</span>
          </div>
          
          <div class="flex-grow overflow-y-auto space-y-2.5 pr-1">
            <div v-for="(player, idx) in room.players.slice(0, 10)" :key="player.phone" class="p-3 rounded-xl bg-white/5 border border-white/5 flex items-center gap-3.5 shadow-sm">
              <div 
                class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shrink-0"
                :class="[
                  idx === 0 ? 'bg-yellow-400 text-black' : 
                  idx === 1 ? 'bg-neutral-300 text-black' : 
                  idx === 2 ? 'bg-amber-600 text-white' : 'bg-white/10 text-white/60'
                ]"
              >
                {{ idx + 1 }}
              </div>
              <div class="w-10 h-10 rounded-full shrink-0 flex items-center justify-center text-sm font-bold text-white shadow-sm border border-white/10" :style="getRandomGradient(player.phone)">
                <span v-if="isEmoji(player.avatar)" class="text-lg">{{ player.avatar }}</span>
                <span v-else>{{ getInitials(player.name) }}</span>
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-bold text-white truncate">{{ player.name }}</div>
                <div class="text-[10px] text-white/40 truncate mt-0.5" v-if="player.company">
                  {{ player.company }} <span v-if="player.job">/ {{ player.job }}</span>
                </div>
              </div>
              <div class="text-sm font-mono font-black text-yellow-400 shrink-0">{{ player.clickCount }}</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Admin Floating Control Center -->
    <div class="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      <!-- 控制台折叠按钮 -->
      <button 
        class="flex items-center gap-2 px-4 py-2.5 rounded-full bg-neutral-900 border border-white/10 hover:border-white/20 text-xs font-bold text-white/90 shadow-xl transition-all duration-200"
        @click="showAdminPanel = !showAdminPanel"
      >
        <span>⚙️</span>
        <span>{{ showAdminPanel ? '收起控制台' : '大屏控制' }}</span>
      </button>

      <!-- 折叠的控制面板 -->
      <div 
        v-if="showAdminPanel" 
        class="mt-3 w-80 p-5 rounded-2xl bg-neutral-950/90 border border-white/10 backdrop-blur-md shadow-2xl flex flex-col gap-4 animate-[fadeIn_0.2s_ease-out]"
      >
        <!-- 未授权登录 -->
        <div class="flex gap-2" v-if="!adminAuth">
          <UInput
            type="password"
            v-model="passcodeInput"
            placeholder="请输入大屏口令"
            class="flex-1"
            size="sm"
            @keyup.enter="handleAdminVerify"
          />
          <UButton color="primary" size="sm" @click="handleAdminVerify">进入</UButton>
        </div>

        <!-- 授权成功控制按钮 -->
        <div v-else class="flex flex-col gap-3">
          <div class="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
            <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            <span>管理员权限已就绪</span>
          </div>
          <div class="flex flex-col gap-2">
            <UButton
              block
              icon="i-lucide-rocket"
              class="h-11 rounded-xl font-bold bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 active:scale-95 text-black disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 transition-all shadow-[0_4px_12px_rgba(234,179,8,0.25)] border-none"
              :disabled="room.status !== 'waiting'"
              @click="sendRoomControl('start')"
            >
              开始点击PK
            </UButton>
            <UButton
              block
              icon="i-lucide-rotate-ccw"
              class="h-10 rounded-xl font-semibold bg-white/10 hover:bg-white/15 active:scale-95 text-white/90 border border-white/10 transition-all"
              @click="sendRoomControl('reset')"
            >
              重置计数 (不删人)
            </UButton>
            <UButton
              block
              icon="i-lucide-trash-2"
              class="h-10 rounded-xl font-semibold bg-rose-500/10 hover:bg-rose-500/20 active:scale-95 text-rose-300 border border-rose-500/20 transition-all"
              @click="sendRoomControl('clear')"
            >
              完全重置 (删除玩家)
            </UButton>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
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

import { buildPrizeSubtitle } from '@/utils/luckyPrizeDisplay'

const route = useRoute()
const activityId = ref(1) // Default activity seed ID

// Room State
const room = ref({
  status: 'waiting', // waiting, countdown, gaming, ended
  remainingMillis: 0,
  duration: 30000,
  players: []
})
const errorMsg = ref('')

const activity = ref({})
const prizes = ref([])

const dynamicSubtitle = computed(() => buildPrizeSubtitle(prizes.value, 'screen'))

// Control Polling
let pollingTimer = null

// Admin Panel States
const showAdminPanel = ref(false)
const passcode = ref('')
const passcodeInput = ref('')
const adminAuth = ref(false)

// Countdown Animation States
const countdownText = ref('')

// Confetti Effect
const confettiCanvas = ref(null)
let confettiAnimationId = null

const qrCodeUrl = ref('')
const useMpQrCode = ref(false)

const buildOAuthEntryUrl = () => {
  return window.location.origin + '/prod-api/tk_custom/lucky/public/loginByWx?activityId=' + activityId.value
}

const buildFallbackQrCodeUrl = () => {
  const serverUrl = buildOAuthEntryUrl()
  return 'https://quickchart.io/qr?size=250&margin=1&text=' + encodeURIComponent(serverUrl)
}

const resolveQrImageSrc = (url) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }
  let normalized = url.startsWith('/') ? url : '/' + url
  if (normalized.startsWith('/profile/')) {
    normalized = '/prod-api' + normalized
  }
  return normalized
}

const qrImageFallbacks = ref([])
const qrImageFallbackIndex = ref(0)

const resetQrImageFallbacks = (primaryUrl) => {
  const candidates = []
  const addCandidate = (url) => {
    const resolved = resolveQrImageSrc(url)
    if (resolved && !candidates.includes(resolved)) {
      candidates.push(resolved)
    }
  }

  addCandidate(primaryUrl)
  if (primaryUrl) {
    ;['.png', '.jpg', '.jpeg', '.webp'].forEach((ext) => {
      const base = primaryUrl.replace(/\.(png|jpe?g|webp)$/i, '')
      addCandidate(base + ext)
    })
  }
  addCandidate(buildFallbackQrCodeUrl())

  qrImageFallbacks.value = candidates
  qrImageFallbackIndex.value = 0
  qrCodeUrl.value = candidates[0] || buildFallbackQrCodeUrl()
}

const handleQrImageError = () => {
  const nextIndex = qrImageFallbackIndex.value + 1
  if (nextIndex < qrImageFallbacks.value.length) {
    qrImageFallbackIndex.value = nextIndex
    qrCodeUrl.value = qrImageFallbacks.value[nextIndex]
  }
}

const loadScreenConfig = async () => {
  try {
    const res = await getScreenConfig(activityId.value)
    if (res.code === 200) {
      useMpQrCode.value = !!res.data.useMpQrCode
      if (useMpQrCode.value && res.data.qrImageUrl) {
        resetQrImageFallbacks(res.data.qrImageUrl)
      } else if (res.data.oauthQrImageUrl) {
        resetQrImageFallbacks(res.data.oauthQrImageUrl)
      } else {
        resetQrImageFallbacks('')
      }
      return
    }
  } catch (e) {
    console.error('加载大屏配置失败', e)
  }
  useMpQrCode.value = false
  resetQrImageFallbacks('')
}

const loadActivityDetail = async () => {
  try {
    const res = await getPublicActivityDetail(activityId.value)
    if (res.code === 200) {
      activity.value = res.data.activity || {}
      prizes.value = res.data.prizes || []
    }
  } catch (e) {
    console.error('加载活动奖品详情失败', e)
  }
}

// Extract top 10 players for race lanes
const racingPlayers = computed(() => {
  // Return top 8 players to avoid screen overflow
  return room.value.players.slice(0, 8)
})

onMounted(() => {
  if (route.query.activityId) {
    activityId.value = parseInt(route.query.activityId)
  }

  loadScreenConfig()
  loadActivityDetail()
  // First fetch and start polling
  fetchRoomStatus()
  pollingTimer = setInterval(fetchRoomStatus, 1000)

  // Retrieve local admin auth token if any
  const authed = localStorage.getItem('lucky_admin_auth')
  if (authed === 'true') {
    adminAuth.value = true
  }
})

onBeforeUnmount(() => {
  if (pollingTimer) clearInterval(pollingTimer)
  if (confettiAnimationId) cancelAnimationFrame(confettiAnimationId)
})

// Watch room status to trigger side effects (countdown / confetti)
watch(() => room.value.status, (newStatus, oldStatus) => {
  if (newStatus === 'countdown') {
    runCountdownTimer()
  }
  if (newStatus === 'ended' && oldStatus !== 'ended') {
    nextTick(() => {
      triggerConfettiExplosion()
    })
  } else if (newStatus !== 'ended') {
    if (confettiAnimationId) {
      cancelAnimationFrame(confettiAnimationId)
      confettiAnimationId = null
    }
  }
})

// Fetch status from server
const fetchRoomStatus = async () => {
  if (isNaN(activityId.value)) {
    errorMsg.value = '活动ID参数不正确'
    return
  }
  try {
    const res = await getRoomStatus(activityId.value)
    if (res.code === 200) {
      room.value.status = res.data.status
      room.value.remainingMillis = res.data.remainingMillis
      room.value.duration = res.data.duration
      room.value.players = (res.data.players || []).map(player => ({
        ...player,
        clickCount: Number(player.clickCount) || 0
      }))
      errorMsg.value = ''
    } else {
      errorMsg.value = res.msg || '获取房间数据失败，请确认活动已开启'
    }
  } catch (e) {
    console.error('获取房间状态异常', e)
    errorMsg.value = '无法连接到后端服务，请检查网络或服务状态'
  }
}

// Admin passcode verify
const handleAdminVerify = () => {
  if (passcodeInput.value === passcode.value) {
    adminAuth.value = true
    localStorage.setItem('lucky_admin_auth', 'true')
    nuxtMsg('登录成功', 'success')
  } else {
    nuxtMsg('管理口令不正确', 'error')
  }
}

// Send control command to server
const sendRoomControl = async (action) => {
  try {
    const res = await controlRoom({
      activityId: activityId.value,
      action: action,
      passcode: passcode.value
    })
    if (res.code === 200) {
      nuxtMsg(res.msg || '操作成功', 'success')
      fetchRoomStatus()
    } else {
      nuxtMsg(res.msg || '操作失败', 'error')
    }
  } catch (e) {
    console.error(e)
    nuxtMsg('发送控制指令失败', 'error')
  }
}

// Countdown display updates
const runCountdownTimer = () => {
  const startStamp = Date.now()
  const interval = setInterval(() => {
    if (room.value.status !== 'countdown') {
      clearInterval(interval)
      return
    }
    const rem = room.value.remainingMillis
    const seconds = Math.ceil(rem / 1000)
    if (seconds > 0) {
      countdownText.value = String(seconds)
    } else {
      countdownText.value = 'GO!'
      clearInterval(interval)
    }
  }, 100)
}

// Dynamic positioning of runners relative to the leading player
const getRunnerProgress = (count) => {
  const safeCount = Number(count) || 0
  if (room.value.players.length === 0) return 0
  const max = Math.max(...room.value.players.map(p => Number(p.clickCount) || 0), 1)
  return Math.min(80, (safeCount / max) * 80)
}

// Helpers for avatar rendering
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
  // Deterministic color based on phone hash
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

// Settle Confetti animation
const triggerConfettiExplosion = () => {
  const canvas = confettiCanvas.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')

  canvas.width = canvas.parentElement.clientWidth
  canvas.height = canvas.parentElement.clientHeight

  const colors = ['#fbc531', '#e84118', '#00a8ff', '#4cd137', '#9c88ff', '#f368e0', '#ff9f43']
  const particles = []

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: canvas.height + 20,
      vx: (Math.random() - 0.5) * 10,
      vy: -(Math.random() * 15 + 10),
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      gravity: Math.random() * 0.2 + 0.25
    })
  }

  const animate = () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    let active = false

    for (let p of particles) {
      p.x += p.vx
      p.y += p.vy
      p.vy += p.gravity
      p.rotation += p.rotSpeed

      if (p.y < canvas.height && p.x > 0 && p.x < canvas.width) {
        active = true
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate((p.rotation * Math.PI) / 180)
        ctx.fillStyle = p.color
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size)
        ctx.restore()
      }
    }

    if (active && room.value.status === 'ended') {
      confettiAnimationId = requestAnimationFrame(animate)
    }
  }

  animate()
}
</script>

<style scoped>
/* 仅保留星光粒子效果与过渡补间动画，其余排版完全移至 Tailwind */
.stars-bg {
  background-image: 
    radial-gradient(white, rgba(255,255,255,.2) 2px, transparent 40px),
    radial-gradient(white, rgba(255,255,255,.15) 1px, transparent 30px);
  background-size: 550px 550px, 350px 350px;
  background-position: 0 0, 40px 60px;
  opacity: 0.12;
}

/* Vue Transition 动画类 */
.player-pop-enter-active {
  transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.player-pop-enter-from {
  opacity: 0;
  transform: scale(0.5);
}
.player-pop-leave-active {
  transition: all 0.3s ease;
}
.player-pop-leave-to {
  opacity: 0;
  transform: scale(0.5);
}
</style>
