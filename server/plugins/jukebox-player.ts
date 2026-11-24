import { getEmbeddedJukeboxPlayer } from '../utils/jukebox/player-engine'
import { getNitroServerConfig } from '../utils/runtime'

const g = globalThis as typeof globalThis & { __ctkJukeboxPluginStarted?: boolean }

export default defineNitroPlugin((nitro) => {
  const config = getNitroServerConfig()
  if (config.jukeboxEngineMode !== 'embedded' || !config.jukeboxEngineEnabled) {
    console.info(
      `[JukeboxPlugin] 未启动内嵌后台调度 (mode=${config.jukeboxEngineMode}, enabled=${config.jukeboxEngineEnabled})`,
    )
    return
  }
  if (g.__ctkJukeboxPluginStarted) return
  g.__ctkJukeboxPluginStarted = true

  const player = getEmbeddedJukeboxPlayer()
  player.start()

  nitro.hooks.hook('close', () => {
    player.shutdown()
    delete g.__ctkJukeboxPluginStarted
  })
})
