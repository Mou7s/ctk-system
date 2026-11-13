<template>
  <div
    class="h-[calc(100vh-112px)] overflow-hidden bg-[#f5f5f7] dark:bg-[#121212] text-slate-800 dark:text-slate-100 font-sans relative flex"
  >
    <!-- Background Ambient Glow Orbs -->
    <div class="orb-1"></div>
    <div class="orb-2"></div>

    <!-- Apple-Style Sidebar -->
    <aside
      class="w-64 border-r border-slate-200/80 dark:border-white/5 bg-slate-100/70 dark:bg-[#1a1a1a]/60 backdrop-blur-md flex flex-col justify-between shrink-0 relative z-10 p-5"
    >
      <div class="flex flex-col gap-6 min-h-0">
        <!-- Logo -->
        <div class="flex items-center gap-2 px-1 py-1">
          <UIcon name="i-lucide-music" class="size-6 text-primary animate-pulse" />
          <span class="text-base font-bold tracking-tight text-slate-900 dark:text-white">厂区广播</span>
        </div>

        <!-- Menu Group 1: Navigation -->
        <div class="flex flex-col gap-1">
          <div class="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider px-2 mb-1.5">
            探索
          </div>
          <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200/60 dark:border-transparent text-primary font-semibold text-xs cursor-pointer shadow-sm dark:shadow-none">
            <UIcon name="i-lucide-home" class="size-4 shrink-0" />
            <span>现在就听</span>
          </div>
          <div class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-650 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all text-xs cursor-pointer" @click="openHealthDiagnostics">
            <UIcon name="i-lucide-activity" class="size-4 shrink-0" />
            <span>系统诊断</span>
          </div>
          <button type="button" class="flex items-center gap-2.5 px-3 py-2 rounded-lg text-slate-650 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white transition-all text-xs text-left" @click="openScheduleManager">
            <UIcon name="i-lucide-calendar-clock" class="size-4 shrink-0 text-primary" />
            <span>凌晨播放</span>
          </button>
        </div>

        <!-- Menu Group 2: Library -->
        <div class="flex flex-col gap-1 min-h-0 flex-1">
          <div class="flex items-center justify-between px-2 mb-1.5">
            <span class="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-wider">
              我的专辑
            </span>
            <UButton
              color="primary"
              variant="link"
              class="text-[10px] p-0 font-bold text-primary hover:text-blue-500"
              @click="handleAddAlbum"
              >新建专辑</UButton
            >
          </div>

          <div
            v-if="!albums.length"
            class="py-8 flex flex-col items-center justify-center gap-2 opacity-40"
          >
            <UIcon name="i-lucide-list-music" class="size-6 text-slate-400 dark:text-slate-550" />
            <span class="text-[10px] text-slate-400 dark:text-slate-500">暂无专辑</span>
          </div>

          <div v-else class="flex flex-col gap-1 overflow-y-auto scrollbar-thin flex-1 pr-1">
            <div
              v-for="album in albums"
              :key="album.albumId"
              class="flex items-center justify-between px-3 py-2.5 rounded-lg border border-transparent cursor-pointer transition-all duration-200 group text-slate-650 dark:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white"
              :class="
                activeAlbumId === album.albumId
                  ? 'bg-white dark:bg-white/10 border-slate-200/65 dark:border-transparent text-slate-950 dark:text-white font-semibold shadow-sm dark:shadow-none'
                  : ''
              "
              @click="activeAlbumId = album.albumId"
            >
              <div class="flex items-center min-w-0 gap-2.5 text-xs">
                <UIcon
                  name="i-lucide-music"
                  class="size-3.5 text-slate-450 dark:text-slate-500 shrink-0 group-hover:text-primary transition-colors"
                  :class="activeAlbumId === album.albumId ? 'text-primary' : ''"
                />
                <span class="truncate max-w-[120px]" :title="album.name">{{
                  album.name
                }}</span>
              </div>
              <div class="flex items-center gap-1.5 shrink-0 opacity-40 group-hover:opacity-100 transition-opacity">
                <span class="text-[9px] font-mono text-slate-455">{{ album.trackCount || 0 }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- User Profile -->
      <div class="border-t border-white/5 pt-4 mt-2 flex items-center justify-between shrink-0">
        <div class="flex items-center gap-2.5 min-w-0">
          <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-primary to-indigo-500 flex items-center justify-center text-white text-xs font-bold shrink-0 shadow-md">
            {{ userInitial }}
          </div>
          <div class="flex flex-col min-w-0">
            <span class="text-xs font-semibold text-slate-800 dark:text-white truncate">{{ currentUserLabel }}</span>
            <span class="text-[9px] text-slate-500 dark:text-slate-500 truncate">广播播放端</span>
          </div>
        </div>
        <UButton
          icon="i-lucide-refresh-cw"
          size="xs"
          color="neutral"
          variant="ghost"
          :loading="refreshing"
          title="同步广播排期"
          class="text-slate-450 hover:text-white"
          @click="syncScheduleAndRefresh"
        />
      </div>
    </aside>

    <!-- Main Album View -->
    <main
      class="flex-1 overflow-y-auto scrollbar-thin p-10 pb-32 relative z-10 flex flex-col gap-8"
    >
      <!-- Custom Loading Overlay -->
      <div
        v-if="albumLoading"
        class="absolute inset-0 bg-white/60 dark:bg-black/60 backdrop-blur-md flex items-center justify-center z-50"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="w-8 h-8 animate-spin text-primary"
        />
      </div>

      <div v-if="!activeAlbum" class="flex-1 flex flex-col items-center justify-center py-24 gap-3 text-slate-550">
        <UIcon name="i-lucide-music" class="size-12 animate-pulse text-zinc-600" />
        <span class="text-xs">请从左侧选择一个专辑</span>
      </div>

      <div v-else class="flex flex-col gap-8">
        <!-- Album Header Box -->
        <div class="flex items-end gap-8 pb-6 border-b border-slate-200 dark:border-white/5">
          <!-- Album Cover Image -->
          <div class="w-44 h-44 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-white/10 flex items-center justify-center shrink-0 shadow-2xl relative group">
            <img
              v-if="activeAlbum.cover || activeAlbum.tracks?.[0]?.thumbnail"
              class="w-full h-full object-cover"
              :src="activeAlbum.cover || activeAlbum.tracks?.[0]?.thumbnail"
              alt=""
            />
            <div v-else class="w-full h-full bg-gradient-to-br from-slate-200 to-slate-300 dark:from-zinc-800 dark:to-zinc-900 flex items-center justify-center">
              <UIcon name="i-lucide-disc" class="size-16 text-slate-400 dark:text-zinc-700 animate-spin-slow" />
            </div>
          </div>

          <!-- Album Meta Info -->
          <div class="flex flex-col gap-3 min-w-0">
            <span class="text-[10px] font-bold text-slate-400 dark:text-slate-550 uppercase tracking-widest">
              专辑
            </span>
            <h2 class="text-3xl font-extrabold text-slate-900 dark:text-white truncate max-w-[500px]" :title="activeAlbum.name">
              {{ activeAlbum.name }}
            </h2>
            <div class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span class="font-semibold text-primary">厂区广播曲库</span>
              <span class="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-600"></span>
              <span>{{ activeAlbum.tracks?.length || 0 }} 首歌曲</span>
            </div>

            <!-- Apple Music Capsule Buttons -->
            <div class="flex items-center gap-3 mt-4">
              <button
                class="px-6 py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-black font-semibold text-xs flex items-center gap-2 hover:bg-slate-800 dark:hover:bg-slate-200 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-md"
                @click="handlePlayAlbum(activeAlbum, false)"
              >
                <UIcon name="i-lucide-play" class="size-3.5 fill-current animate-pulse" />
                <span>播放</span>
              </button>
              <button
                class="px-6 py-2.5 rounded-lg bg-slate-200/80 dark:bg-white/10 text-slate-800 dark:text-white font-semibold text-xs flex items-center gap-2 hover:bg-slate-300/80 dark:hover:bg-white/15 hover:scale-[1.02] active:scale-[0.98] transition-all border border-slate-300/40 dark:border-white/5"
                @click="handlePlayAlbum(activeAlbum, true)"
              >
                <UIcon name="i-lucide-shuffle" class="size-3.5" />
                <span>随机</span>
              </button>

              <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-calendar-clock" @click="openScheduleManager">凌晨播放设置</UButton>

              <div class="h-6 w-px bg-slate-200 dark:bg-white/10 mx-1"></div>

              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                class="text-slate-550 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                @click="onAlbumCmd('rename', activeAlbum)"
                >重命名</UButton
              >
              <UButton
                size="sm"
                color="error"
                variant="ghost"
                class="hover:bg-rose-500/10 hover:text-rose-555"
                @click="onAlbumCmd('delete', activeAlbum)"
                >删除专辑</UButton
              >
            </div>
          </div>
        </div>

        <!-- Album Tracks (Flat List) -->
        <div class="flex flex-col gap-2">
          <!-- Folder Container (Flat Table representation) -->
          <div
            v-if="!groupedTracks.length"
            class="py-16 flex items-center justify-center opacity-40"
          >
            <UEmpty
              title="此专辑为空"
              description="选择本地音频文件导入到此曲库"
              icon="i-lucide-music-4"
              class="text-xs"
            />
          </div>
          <div
            v-if="groupedTracks.length"
            class="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] text-slate-400 dark:text-slate-500"
          >
            <span class="font-bold uppercase tracking-widest">播放顺序</span>
            <span class="flex items-center gap-1.5">
              <UIcon name="i-lucide-grip-vertical" class="size-3.5" />
              拖动分组标题调整专辑顺序，组内歌曲顺序保持不变
            </span>
          </div>
          <div v-if="groupedTracks.length" class="flex flex-col gap-6">
            <div
              v-for="g in groupedTracks"
              :key="g.name"
              class="flex flex-col gap-2 bg-white/80 dark:bg-[#181818]/40 border border-slate-200/80 dark:border-white/5 rounded-2xl p-4 shadow-sm dark:shadow-md transition-all"
              :class="dragOverFolderName === g.name ? 'ring-2 ring-primary/50 border-primary/40' : ''"
            >
              <!-- Folder Subheader -->
              <div
                class="flex items-center justify-between px-2 pb-2 border-b border-slate-100 dark:border-white/5"
                draggable="true"
                @dragstart="onFolderDragStart($event, g.name)"
                @dragover.prevent="onFolderDragOver($event, g.name)"
                @drop.prevent="onFolderDrop($event, g.name)"
                @dragend="onFolderDragEnd"
              >
                <div class="flex items-center gap-2 min-w-0 cursor-grab active:cursor-grabbing">
                  <UIcon name="i-lucide-grip-vertical" class="size-4 text-slate-400 dark:text-slate-550 shrink-0" />
                  <UIcon name="i-lucide-folder" class="size-4 text-slate-400 dark:text-slate-550" />
                  <span class="text-xs font-bold text-slate-700 dark:text-slate-300">{{ g.name }}</span>
                  <span class="text-[9px] bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 px-1.5 py-0.5 rounded-full text-slate-555 dark:text-slate-400">
                    {{ g.tracks.length }} 首
                  </span>
                </div>
                <UButton
                  size="xs"
                  color="error"
                  variant="ghost"
                  class="text-[10px] hover:bg-rose-500/10"
                  @click="handleDeleteFolderGroup(g.name)"
                  >删除此分组</UButton
                >
              </div>

              <!-- Tracks Rows list -->
              <div class="flex flex-col">
                <div
                  v-for="(t, i) in g.tracks"
                  :key="t.trackId"
                  class="flex items-center justify-between px-3 py-3 hover:bg-slate-100/50 dark:hover:bg-white/[0.04] border-b border-slate-100/40 dark:border-transparent cursor-pointer rounded-xl transition-all duration-150 group relative"
                  @dblclick="handlePlayTrackImmediately(t)"
                >
                  <div class="flex items-center gap-4 min-w-0 text-xs">
                    <!-- Icon / Play Index / Bouncing audio bars -->
                    <div class="w-6 flex items-center justify-center shrink-0">
                      <!-- Bouncing visualizer if currently playing -->
                      <div
                        v-if="nowPlaying && Number(nowPlaying.mediaId) === Number(t.mediaId) && isPlaying"
                        class="visualizer-container-primary"
                      >
                        <div class="vis-primary-bar"></div>
                        <div class="vis-primary-bar"></div>
                        <div class="vis-primary-bar"></div>
                      </div>
                      <span
                        v-else
                        class="text-[10px] font-mono text-slate-400 dark:text-slate-550 group-hover:hidden"
                        >{{ i + 1 }}</span
                      >
                      <!-- Small Play Button on hover -->
                      <UIcon
                        v-if="!(nowPlaying && Number(nowPlaying.mediaId) === Number(t.mediaId) && isPlaying) && isTrackReady(t)"
                        name="i-lucide-play"
                        class="size-3.5 text-primary hidden group-hover:block fill-primary"
                        @click.stop="handlePlayTrackImmediately(t)"
                      />
                    </div>

                    <!-- Mini cover -->
                    <div class="w-8 h-8 rounded-lg overflow-hidden bg-slate-200 dark:bg-slate-900 border border-slate-300/30 dark:border-white/5 shrink-0 flex items-center justify-center">
                      <img
                        v-if="t.thumbnail"
                        class="w-full h-full object-cover"
                        :src="t.thumbnail"
                        alt=""
                      />
                      <UIcon v-else name="i-lucide-music" class="size-4 text-slate-400 dark:text-slate-555 shrink-0" />
                    </div>

                    <!-- Track Titles info -->
                    <div class="flex flex-col min-w-0">
                      <span
                        class="font-semibold text-slate-800 dark:text-slate-200 hover:text-slate-950 dark:hover:text-white truncate max-w-[360px]"
                        :class="nowPlaying && Number(nowPlaying.mediaId) === Number(t.mediaId) ? 'text-primary' : ''"
                        :title="t.title"
                        >{{ t.title }}</span>
                      <span
                        v-if="t.channel"
                        class="text-[10px] text-slate-400 dark:text-slate-555 truncate max-w-[200px] mt-0.5"
                        >{{ t.channel }}</span>
                      <span class="mt-1 text-[10px]" :class="trackStatusClass(t)">{{ trackMediaLabel(t) }}</span>
                    </div>
                  </div>

                  <div class="flex items-center gap-3 shrink-0">
                    <UButton
                      size="xs"
                      variant="ghost"
                      color="error"
                      icon="i-lucide-trash"
                      class="hover:bg-rose-500/10 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-lg"
                      @click.stop="removeTrack(activeAlbum, t)"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Local audio import -->
        <div class="mt-8 pt-6 border-t border-slate-200 dark:border-white/5 flex flex-col gap-4 max-w-4xl animate-fade">
          <div class="flex flex-wrap items-end justify-between gap-3">
            <div>
              <span class="text-[10px] font-bold text-slate-455 dark:text-slate-555 uppercase tracking-widest">导入本地音频</span>
              <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">文件逐个校验并复制到中央备份和播放器。导入只登记曲目，不会修改排期或当前播放。</p>
            </div>
            <span v-if="activeAlbum" class="rounded-full bg-primary/10 px-2.5 py-1 text-[10px] font-semibold text-primary">导入到：{{ activeAlbum.name }}</span>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <input
              type="file"
              ref="audioFileInput"
              multiple
              accept=".aac,.aiff,.ape,.flac,.m4a,.mp3,.oga,.ogg,.opus,.wav,.wma"
              class="block max-w-full text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary hover:file:bg-primary/15 dark:text-slate-300"
              :disabled="!activeAlbum || importingFiles"
              @change="selectAudioFiles"
            />
            <UInput v-model="importArtist" size="sm" class="w-48" placeholder="艺术家 / 来源（可选）" :disabled="importingFiles" />
            <UButton color="primary" size="sm" :loading="importingFiles" :disabled="!activeAlbum || !selectedAudioFiles.length" @click="importSelectedFiles">
              导入 {{ selectedAudioFiles.length }} 个文件
            </UButton>
            <UButton v-if="selectedAudioFiles.length && !importingFiles" color="neutral" variant="ghost" size="sm" @click="clearSelectedFiles">清空</UButton>
          </div>
          <div v-if="selectedAudioFiles.length" class="max-h-48 overflow-y-auto rounded-xl border border-slate-200/70 bg-white/60 dark:border-white/5 dark:bg-black/10">
            <div v-for="(file, index) in selectedAudioFiles" :key="`${file.name}-${file.size}-${index}`" class="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-white/5">
              <UIcon name="i-lucide-music-2" class="size-4 shrink-0 text-primary" />
              <span class="min-w-0 flex-1 truncate text-xs text-slate-700 dark:text-slate-200" :title="file.name">{{ file.name }}</span>
              <span class="shrink-0 text-[10px] text-slate-400">{{ formatFileSize(file.size) }}</span>
            </div>
          </div>
          <p v-if="importProgress" class="text-[11px] text-primary">正在导入 {{ importProgress.index }} / {{ importProgress.total }}：{{ importProgress.fileName }}</p>
          <p class="text-[10px] text-slate-400 dark:text-slate-500">旧 YouTube 曲目及元数据会保留，并标记为“需要本地音频”；重复文件按 SHA-256 去重。</p>
        </div>
      </div>
    </main>

    <!-- Floating Bottom Player Capsule (Apple Music Style) -->
    <div
      class="fixed bottom-6 left-1/2 -translate-x-1/2 w-[680px] h-16 rounded-full border border-slate-200/80 dark:border-white/10 bg-white/90 dark:bg-[#1e1e1e]/80 backdrop-blur-lg shadow-xl dark:shadow-2xl flex items-center justify-between px-6 py-3 z-50 select-none shadow-slate-200/60 dark:shadow-black/80"
    >
      <!-- Left: Simple Media Controls -->
      <div class="flex items-center gap-3 shrink-0">
        <UButton
          icon="i-lucide-skip-back"
          size="sm"
          color="neutral"
          variant="ghost"
          class="text-slate-500 dark:text-slate-455 hover:text-slate-900 dark:hover:text-white"
          :disabled="true"
        />
        <UButton
          :icon="isPaused || !nowPlaying ? 'i-lucide-play' : 'i-lucide-pause'"
          size="md"
          color="neutral"
          variant="ghost"
          class="text-slate-800 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-full"
          :disabled="!nowPlaying"
          @click="togglePause"
        />
        <UButton
          icon="i-lucide-skip-forward"
          size="sm"
          color="neutral"
          variant="ghost"
          class="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          :disabled="switchingNext"
          @click="handleNextSong"
        />
        <UButton
          icon="i-lucide-square"
          size="sm"
          color="neutral"
          variant="ghost"
          class="text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          :disabled="!nowPlaying"
          @click="handleStopPlayback"
        />
      </div>

      <!-- Center: Track cover, Info and progress slider -->
      <div class="flex-1 mx-6 flex items-center gap-3 min-w-0 bg-slate-100/80 dark:bg-black/20 rounded-full px-3.5 py-1.5 border border-slate-200/40 dark:border-white/[0.03]">
        <div class="w-8 h-8 rounded bg-slate-200 dark:bg-zinc-800 border border-slate-350/20 dark:border-white/10 flex items-center justify-center shrink-0 overflow-hidden shadow-md">
          <img
            v-if="nowPlaying?.thumbnail"
            class="w-full h-full object-cover animate-spin-slow"
            :src="nowPlaying.thumbnail"
            alt=""
          />
          <UIcon v-else name="i-lucide-music" class="size-4 text-slate-400 dark:text-slate-550" />
        </div>
        <div class="flex flex-col min-w-0 flex-1">
          <div class="flex items-center justify-between text-[10px] mb-0.5">
            <span class="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[140px]" :title="songTitle(nowPlaying)">
              {{ nowPlaying ? songTitle(nowPlaying) : "厂区播放广播" }}
            </span>
            <span class="text-slate-555 dark:text-slate-400 font-mono scale-90">{{ elapsedText }} / {{ durationText }}</span>
          </div>
          <!-- Apple progress line bar -->
          <div class="w-full h-1 bg-slate-200 dark:bg-white/15 rounded-full overflow-hidden relative">
            <div
              class="h-full bg-primary rounded-full shadow-[0_0_8px_rgba(59,130,246,0.5)] dark:shadow-[0_0_8px_#3b82f6]"
              :style="{ width: progressWidth }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Right: Volume slider and Diagnostics buttons -->
      <div class="flex items-center gap-3 shrink-0">
        <UButton
          :icon="isMuted || localVolume === 0 ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          size="sm"
          color="neutral"
          variant="ghost"
          class="text-slate-555 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          @click="toggleMute"
        />
        <input
          type="range"
          v-model="localVolume"
          :min="0"
          :max="100"
          class="volume-slider w-16 h-1 rounded-lg appearance-none cursor-pointer"
          @change="handleVolumeChange(localVolume)"
        />
        <div class="w-px h-4 bg-slate-200 dark:bg-white/10 mx-1"></div>
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          class="text-[10px] text-slate-655 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-lg px-2"
          @click="openHealthDiagnostics"
          >诊断</UButton
        >
      </div>
    </div>

    <!-- Rename dialog -->
    <UModal
      v-model:open="renameDialog"
      title="重命名"
      :ui="{
        content: 'bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-2xl overflow-hidden',
        header: 'border-b border-slate-100 dark:border-white/5 py-4 px-6 text-slate-900 dark:text-white font-bold',
        body: 'py-4 px-6',
        footer: 'border-t border-slate-100 dark:border-white/5 py-4 px-6'
      }"
    >
      <template #body>
        <UInput
          v-model="renameName"
          placeholder="输入新的专辑名称"
          class="bg-white dark:bg-[#1a1a1a] border-slate-200 dark:border-white/5 text-slate-800 dark:text-white rounded-lg focus:border-primary/50"
          @keyup.enter="submitRename"
        />
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 w-full">
          <UButton
            variant="subtle"
            color="neutral"
            size="sm"
            class="rounded-full px-5 py-2 font-semibold text-xs border border-slate-200 dark:border-white/5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-855 dark:text-white transition-all"
            @click="renameDialog = false"
            >取消</UButton
          >
          <UButton
            color="primary"
            size="sm"
            class="rounded-full px-5 py-2 font-semibold text-xs text-white bg-primary hover:bg-primary/95 shadow-sm shadow-primary/20 transition-all"
            @click="submitRename"
            >确定</UButton
          >
        </div>
      </template>
    </UModal>

    <!-- Broadcast plan manager: plans select albums, independently of the library. -->
    <UModal
      v-model:open="scheduleDialogOpen"
      title="凌晨播放"
      :ui="{
        content: 'max-w-4xl bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-2xl overflow-hidden',
        header: 'border-b border-slate-100 dark:border-white/5 py-4 px-6 text-slate-900 dark:text-white font-bold',
        body: 'max-h-[75vh] overflow-y-auto py-4 px-6',
        footer: 'border-t border-slate-100 dark:border-white/5 py-4 px-6'
      }"
    >
      <template #body>
        <div class="flex flex-col gap-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p class="text-sm font-semibold text-slate-800 dark:text-slate-100">按时间安排专辑播放</p>
              <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">先导入专辑，再在这里选择要播放的专辑。每个排期独立保存时间和播放范围。</p>
            </div>
            <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-plus" @click="resetScheduleForm">新建排期</UButton>
          </div>

          <div v-if="scheduleLoading" class="flex items-center gap-2 py-4 text-xs text-slate-500">
            <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />正在读取排期
          </div>
          <div v-else-if="!broadcastSchedules.length" class="rounded-xl border border-dashed border-slate-300 px-4 py-5 text-xs text-slate-500 dark:border-white/10">
            还没有凌晨播放排期。添加排期并勾选专辑后，保存即可。
          </div>
          <div v-else class="flex flex-col gap-2">
            <div v-for="plan in broadcastSchedules" :key="plan.scheduleId" class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ plan.name }}</span>
                  <span class="shrink-0 rounded-full px-2 py-0.5 text-[10px]" :class="plan.enabled === '1' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 text-slate-500 dark:bg-white/5 dark:text-slate-400'">{{ plan.enabled === '1' ? '已启用' : '已停用' }}</span>
                </div>
                <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{{ scheduleDescription(plan) }} · {{ (plan.albumNames || []).join('、') || '未选专辑' }}</p>
              </div>
              <div class="flex items-center gap-1">
                <USwitch :model-value="plan.enabled === '1'" size="sm" :disabled="scheduleSaving" @update:model-value="toggleScheduleEnabled(plan, $event)" />
                <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-pencil" title="编辑排期" @click="editSchedule(plan)" />
                <UButton size="xs" color="error" variant="ghost" icon="i-lucide-trash-2" title="删除排期" @click="deleteSchedule(plan)" />
              </div>
            </div>
          </div>

          <div class="border-t border-slate-200 pt-4 dark:border-white/5">
            <div class="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold text-slate-800 dark:text-slate-100">{{ scheduleEditingId ? '编辑排期' : '新建排期' }}</h3>
                <p class="mt-1 text-[11px] text-slate-500">未启用的排期不会触发播放。启用前，所选专辑的音频需要全部同步完成。</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label class="flex flex-col gap-1 text-[11px] text-slate-500">
                排期名称
                <UInput v-model="scheduleForm.name" size="sm" placeholder="例如：凌晨播放" />
              </label>
              <label class="flex flex-col gap-1 text-[11px] text-slate-500">
                播放日期
                <USelect v-model="scheduleForm.scheduleType" size="sm" :items="scheduleTypeOptions" />
              </label>
              <label class="flex flex-col gap-1 text-[11px] text-slate-500">
                开始时间
                <UInput v-model="scheduleForm.startTime" size="sm" type="time" />
              </label>
              <label class="flex flex-col gap-1 text-[11px] text-slate-500">
                结束时间（可选）
                <UInput v-model="scheduleForm.endTime" size="sm" type="time" />
              </label>
            </div>

            <div v-if="scheduleForm.scheduleType === 'custom'" class="mt-3 flex flex-wrap items-center gap-2">
              <span class="text-[11px] text-slate-500">星期</span>
              <button v-for="day in weekdayOptions" :key="day.value" type="button" class="size-7 rounded-full border text-[10px] transition-colors" :class="scheduleForm.weekdays.includes(day.value) ? 'border-primary bg-primary text-white' : 'border-slate-200 text-slate-500 dark:border-white/10 dark:text-slate-400'" @click="toggleScheduleWeekday(day.value)">{{ day.label }}</button>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-4">
              <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <UCheckbox :model-value="scheduleForm.loop === '1'" @update:model-value="scheduleForm.loop = $event ? '1' : '0'" />
                有结束时间时循环播放到截止点
              </label>
              <label class="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <UCheckbox :model-value="scheduleForm.enabled === '1'" @update:model-value="scheduleForm.enabled = $event ? '1' : '0'" />
                保存后启用
              </label>
            </div>
            <p class="mt-2 text-[10px] text-slate-400">未填写结束时间时，按所选专辑顺序播放一轮后停止；排期间隔不得重叠。</p>

            <div class="mt-4">
              <div class="mb-2 flex items-center justify-between">
                <span class="text-xs font-semibold text-slate-700 dark:text-slate-200">选择要播放的专辑</span>
                <span class="text-[10px] text-slate-400">已选 {{ scheduleForm.albumIds.length }} 张</span>
              </div>
              <div v-if="!albums.length" class="rounded-lg bg-slate-50 px-3 py-4 text-xs text-slate-500 dark:bg-white/[0.03]">先到“专辑”中导入音频。</div>
              <div v-else class="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <label v-for="album in albums" :key="album.albumId" class="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200/80 px-3 py-2.5 hover:border-primary/40 dark:border-white/5">
                  <UCheckbox :model-value="scheduleForm.albumIds.includes(Number(album.albumId))" :disabled="!album.tracks?.length" @update:model-value="toggleScheduleAlbum(album.albumId, $event)" />
                  <span class="min-w-0 flex-1">
                    <span class="block truncate text-xs font-medium text-slate-700 dark:text-slate-200">{{ album.name }}</span>
                    <span class="mt-0.5 block text-[10px] text-slate-400">{{ album.trackCount || 0 }} 首 · {{ albumReadyCount(album) }}/{{ album.tracks?.length || 0 }} 首已同步</span>
                  </span>
                </label>
              </div>
            </div>

            <div class="mt-4 flex justify-end gap-2">
              <UButton v-if="scheduleEditingId" size="sm" color="neutral" variant="ghost" :disabled="scheduleSaving" @click="resetScheduleForm">取消编辑</UButton>
              <UButton size="sm" color="primary" icon="i-lucide-save" :loading="scheduleSaving" :disabled="!scheduleForm.albumIds.length" @click="saveSchedule">保存排期</UButton>
            </div>
          </div>
        </div>
      </template>
    </UModal>

    <!-- Health Diagnostics dialog -->
    <UModal
      v-model:open="diagnosticsVisible"
      title="点歌台系统健康诊断"
      :ui="{
        content: 'bg-white dark:bg-[#1c1c1e] rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-2xl overflow-hidden',
        header: 'border-b border-slate-100 dark:border-white/5 py-4 px-6 text-slate-900 dark:text-white font-bold',
        body: 'py-2 px-6',
        footer: 'border-t border-slate-100 dark:border-white/5 py-4 px-6'
      }"
    >
      <template #body>
        <div class="relative" style="min-height: 200px; padding: 10px">
          <div
            v-if="diagnosticsLoading"
            class="absolute inset-0 bg-white/80 dark:bg-[#121212]/80 flex items-center justify-center z-50 animate-fade rounded-2xl"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 animate-spin text-primary"
            />
            <span class="ml-2 text-sm text-slate-700 dark:text-slate-200">检测中...</span>
          </div>

          <div v-if="diagnosticsData" class="mt-2 rounded-2xl border border-slate-200/60 bg-slate-50/50 p-4 shadow-sm dark:border-white/5 dark:bg-[#181818]/60">
            <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div class="rounded-xl border border-slate-200/60 p-3 dark:border-white/5">
                <p class="text-[10px] text-slate-500">播放器服务 / API</p>
                <p class="mt-1 text-sm font-semibold" :class="diagnosticStatusClass(diagnosticsData.service?.status)">{{ diagnosticStatusLabel(diagnosticsData.service?.status) }} · {{ diagnosticsData.api?.url || '-' }}</p>
              </div>
              <div class="rounded-xl border border-slate-200/60 p-3 dark:border-white/5">
                <p class="text-[10px] text-slate-500">当前播放</p>
                <p class="mt-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{{ diagnosticsData.player?.current?.title || (diagnosticsData.player?.status === 'idle' ? '空闲' : '—') }}</p>
                <p class="text-[10px] text-slate-500">{{ diagnosticStatusLabel(diagnosticsData.player?.status) }} · {{ formatDuration(diagnosticsData.player?.elapsed) }} / {{ formatDuration(diagnosticsData.player?.duration) }}</p>
              </div>
              <div class="rounded-xl border border-slate-200/60 p-3 dark:border-white/5">
                <p class="text-[10px] text-slate-500">本地计划缓存</p>
                <p class="mt-1 text-sm font-semibold" :class="diagnosticStatusClass(diagnosticsData.schedule?.status)">{{ diagnosticStatusLabel(diagnosticsData.schedule?.status) }} · v{{ diagnosticsData.schedule?.planVersion ?? '-' }}</p>
                <p class="text-[10px] text-slate-500">{{ diagnosticsData.schedule?.scheduleCount ?? 0 }} 个计划 · {{ diagnosticsData.schedule?.timezone || 'Asia/Shanghai' }} · {{ diagnosticsData.schedule?.status === 'unavailable' ? '状态暂不可用' : (diagnosticsData.schedule?.syncedAt || '尚未同步') }}</p>
              </div>
              <div class="rounded-xl border border-slate-200/60 p-3 dark:border-white/5">
                <p class="text-[10px] text-slate-500">播放器本地媒体</p>
                <p class="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">播放器 {{ diagnosticsData.media?.mediaCount ?? 0 }} 个文件 · 中央库已同步 {{ diagnosticsData.media?.sync?.ready ?? 0 }} 个</p>
                <p class="text-[10px] text-slate-500">待同步 {{ diagnosticsData.media?.sync?.pending ?? 0 }} · 失败 {{ diagnosticsData.media?.sync?.failed ?? 0 }} · 未知 {{ diagnosticsData.media?.sync?.unknown ?? 0 }} · 数据库状态 {{ diagnosticStatusLabel(diagnosticsData.media?.sync?.status) }}</p>
              </div>
            </div>
            <div v-if="diagnosticsData.serviceError || diagnosticsData.player?.error || diagnosticsData.recentErrors?.length || diagnosticsData.media?.sync?.lastError" class="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs text-rose-700 dark:text-rose-300">
              {{ diagnosticsData.player?.error || diagnosticsData.recentErrors.at(-1)?.message || diagnosticsData.media?.sync?.lastError || diagnosticsData.serviceError }}
            </div>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-between items-center w-full">
          <UButton
            variant="subtle"
            color="neutral"
            size="sm"
            class="rounded-full px-5 py-2 font-semibold text-xs border border-slate-200 dark:border-white/5 bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-855 dark:text-white transition-all"
            @click="diagnosticsVisible = false"
          >
            关闭
          </UButton>
          <div class="flex items-center gap-3">
            <UButton
              color="primary"
              size="sm"
              class="rounded-full px-5 py-2 font-semibold text-xs text-white bg-primary hover:bg-primary/95 transition-all shadow-sm shadow-primary/20"
              :loading="diagnosticsLoading"
              @click="fetchDiagnostics"
            >
              重新检测
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup name="FactoryBroadcast">
import useUserStore from "@/store/modules/user";
import {
  getJukeboxPlayer,
  playNextSong,
  playJukeboxSongImmediately,
  pausePlayback,
  resumePlayback,
  setJukeboxVolume,
  stopPlayback,
  getBackendJukeboxHealth,
  syncBackendJukeboxSchedule,
} from "@/api/tk_custom/jukebox";

const userStore = useUserStore();
const currentUserLabel = computed(() => userStore.nickName || userStore.name || "广播管理员");
const userInitial = computed(() => String(currentUserLabel.value || "A").slice(0, 1).toUpperCase());

const POLL_INTERVAL = 1000;
const defaultPlayerState = {
  current: null,
  queue: [],
  status: "idle",
  error: "",
  elapsed: 0,
  duration: 0,
  paused: false,
  audioOnly: true,
  volume: 70,
  prebuffer: null,
};

// ── State Variables ──
const playerState = ref({ ...defaultPlayerState });
const nowPlaying = ref(null);
const queue = ref([]);
const albums = ref([]);
const activeAlbumId = ref(null);
const openFolderNames = ref([]);

const albumLoading = ref(false);
const refreshing = ref(false);
const switchingNext = ref(false);

const coverUrl = computed(
  () => nowPlaying.value?.thumbnail || nowPlaying.value?.cover || "",
);
const isPlaying = computed(() => playerState.value.status === "playing");
const isPaused = computed(() => playerState.value.paused);

// Controls bindings
const isShuffle = ref(false);
const isRepeat = ref(false);
const localVolume = ref(70);
const isMuted = ref(false);
const preMuteVolume = ref(70);

// Diagnostics dialog
const diagnosticsVisible = ref(false);
const diagnosticsLoading = ref(false);
const diagnosticsData = ref(null);

// Search and add songs
const selectedAudioFiles = ref([]);
const importingFiles = ref(false);
const importArtist = ref("");
const importProgress = ref(null);
const audioFileInput = ref(null);

// Rename dialog
const renameDialog = ref(false);
const renameName = ref("");
const renameTargetAlbum = ref(null);

// Drag and drop sorting states
const draggedFolderName = ref("");
const dragOverFolderName = ref("");
const scheduleSaving = ref(false);
const scheduleDialogOpen = ref(false);
const scheduleLoading = ref(false);
const broadcastSchedules = ref([]);
const scheduleEditingId = ref(null);
const scheduleForm = ref(createScheduleForm());
const scheduleTypeOptions = [
  { label: "每天", value: "daily" },
  { label: "工作日", value: "weekdays" },
  { label: "周末", value: "weekends" },
  { label: "自选星期", value: "custom" },
];
const weekdayOptions = [
  { label: "一", value: "1" },
  { label: "二", value: "2" },
  { label: "三", value: "3" },
  { label: "四", value: "4" },
  { label: "五", value: "5" },
  { label: "六", value: "6" },
  { label: "日", value: "7" },
];

let pollTimer = null;
let playerStateLoading = false;

// ── Computed Properties ──
const healthOk = ref(true);
const healthText = computed(() => (healthOk.value ? "连接正常" : "连接失败"));
const healthTagType = computed(() => (healthOk.value ? "success" : "error"));

const activeAlbum = computed(
  () => albums.value.find((p) => p.albumId === activeAlbumId.value) || null,
);

const groupedTracks = computed(() => {
  if (!activeAlbum.value || !activeAlbum.value.tracks) return [];
  const list = activeAlbum.value.tracks;
  const result = [];
  const map = {};

  for (const t of list) {
    const channelName = t.channel || "其他单曲";
    if (!map[channelName]) {
      map[channelName] = [];
      result.push({ name: channelName, tracks: map[channelName] });
    }
    map[channelName].push(t);
  }
  return result;
});

const elapsedText = computed(() => formatDuration(playerState.value.elapsed));
const durationText = computed(() => formatDuration(playerState.value.duration));
const progressWidth = computed(() => {
  const dur = playerState.value.duration;
  const el = playerState.value.elapsed;
  if (!dur) return "0%";
  return Math.min(100, Math.max(0, (el / dur) * 100)) + "%";
});

// ── Watchers ──
watch(activeAlbumId, (val) => {
  if (val) {
    // Automatically open first folder
    setTimeout(() => {
      if (
        groupedTracks.value.length > 0 &&
        openFolderNames.value.length === 0
      ) {
        openFolderNames.value = [groupedTracks.value[0].name];
      }
    }, 200);
  }
});

// ── Helper functions ──
function formatDuration(sec) {
  if (!sec || isNaN(sec)) return "0:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function isTrackReady(track) {
  return Boolean(track?.mediaId && track?.mediaSyncStatus === "ready" && track?.mediaSha256 && track?.playerSha256 === track.mediaSha256);
}

function trackMediaLabel(track) {
  if (!track?.mediaId) return "需要本地音频";
  if (track.mediaSyncStatus === "pending_sync") return "待同步至播放器";
  if (track.mediaSyncStatus === "failed") return `同步失败${track.lastSyncError ? `：${track.lastSyncError}` : ""}`;
  if (track.mediaSyncStatus !== "ready") return "媒体状态未知";
  if (!isTrackReady(track)) return "播放器副本校验未通过";
  const seconds = Number(track.mediaDurationMs || 0) / 1000;
  return `${seconds ? formatDuration(seconds) : "时长未知"} · 已同步`;
}

function trackStatusClass(track) {
  if (isTrackReady(track)) return "text-emerald-600 dark:text-emerald-400";
  if (track?.mediaSyncStatus === "failed" || track?.mediaSyncStatus === "ready") return "text-rose-600 dark:text-rose-400";
  if (track?.mediaSyncStatus === "pending_sync" || !track?.mediaId) return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

function diagnosticStatusLabel(status) {
  const labels = {
    up: "正常", down: "连接失败", playing: "播放中", paused: "已暂停",
    idle: "空闲", error: "有错误", synced: "已同步", unsynced: "未同步",
    available: "正常", unavailable: "无法检查",
  };
  return labels[String(status || "unavailable")] || "无法检查";
}

function diagnosticStatusClass(status) {
  if (["up", "playing", "paused", "synced", "available"].includes(String(status))) return "text-emerald-600 dark:text-emerald-400";
  if (["down", "error"].includes(String(status))) return "text-rose-600 dark:text-rose-400";
  if (status === "idle") return "text-amber-600 dark:text-amber-400";
  return "text-slate-500 dark:text-slate-400";
}

function getTrackList(response) {
  return (Array.isArray(response)
    ? response
    : response?.rows || response?.data || []
  ).sort(
    (x, y) =>
      (x.sortOrder || 0) - (y.sortOrder || 0) ||
      (x.trackId || 0) - (y.trackId || 0),
  );
}

async function refreshAlbumTracks(album) {
  if (!album?.albumId) return [];
  const response = await listTracks(album.albumId);
  const tracks = getTrackList(response);
  album.tracks = tracks;
  album.trackCount = tracks.length;
  return tracks;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function selectAudioFiles(event) {
  const incoming = Array.from(event?.target?.files || []);
  const existing = new Set(selectedAudioFiles.value.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
  selectedAudioFiles.value = [
    ...selectedAudioFiles.value,
    ...incoming.filter((file) => {
      const key = `${file.name}:${file.size}:${file.lastModified}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    }),
  ];
  if (event?.target) event.target.value = "";
}

function clearSelectedFiles() {
  selectedAudioFiles.value = [];
  if (audioFileInput.value) audioFileInput.value.value = "";
}

async function importSelectedFiles() {
  const album = activeAlbum.value;
  const files = [...selectedAudioFiles.value];
  if (!album || !files.length || importingFiles.value) return;
  importingFiles.value = true;
  const failures = [];
  let pending = 0;
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      importProgress.value = { index: index + 1, total: files.length, fileName: file.name };
      const title = file.name.replace(/\.[^.]+$/, "").trim();
      try {
        const response = await importTrackFile(album.albumId, file, {
          title,
          artist: importArtist.value.trim(),
        });
        const result = response?.data || {};
        if (result.copyStatus?.player !== "ready") pending += 1;
      } catch (error) {
        failures.push(`${file.name}：${error?.message || "导入失败"}`);
      }
    }
    await refreshAlbumTracks(album);
    clearSelectedFiles();
    if (failures.length) {
      nuxtMsg(`完成 ${files.length - failures.length} 个，失败 ${failures.length} 个：${failures[0]}`, "warning");
    } else if (pending) {
      nuxtMsg(`已导入 ${files.length} 个文件；${pending} 个等待播放器同步，可稍后重试`, "warning");
    } else {
      nuxtMsg(`已导入 ${files.length} 个本地音频文件`, "success");
    }
  } finally {
    importProgress.value = null;
    importingFiles.value = false;
  }
}

function songTitle(song) {
  if (!song) return "";
  return song.title || "未知曲目";
}
function songSubTitle(song) {
  if (!song) return "";
  return song.artist || song.channelTitle || song.channel || "未知频道";
}
function getFolderCover(tracks) {
  if (tracks && tracks.length > 0) {
    return tracks.find((t) => t.thumbnail)?.thumbnail || "";
  }
  return "";
}

// Collapsible Folder toggle
function toggleFolder(name) {
  const idx = openFolderNames.value.indexOf(name);
  if (idx > -1) openFolderNames.value.splice(idx, 1);
  else openFolderNames.value.push(name);
}
function isFolderOpen(name) {
  return openFolderNames.value.includes(name);
}

// ── Data Loading ──
async function loadAll() {
  albumLoading.value = true;
  try {
    const albumRes = await listAlbum({ pageNum: 1, pageSize: 999 });
    const albumRows = Array.isArray(albumRes)
      ? albumRes
      : albumRes?.rows || albumRes?.data || [];

    const enriched = [];
    const trackPromises = albumRows.map((a) =>
      listTracks(a.albumId).catch(() => []),
    );
    const trackResults = await Promise.all(trackPromises);
    for (let ai = 0; ai < albumRows.length; ai++) {
      const a = albumRows[ai];
      const raw = trackResults[ai];
      const tracks = (
        Array.isArray(raw) ? raw : raw?.rows || raw?.data || []
      ).sort((x, y) => (x.sortOrder || 0) - (y.sortOrder || 0) || (x.trackId || 0) - (y.trackId || 0));
      enriched.push({
        ...a,
        tracks: tracks,
      });
    }
    // The old empty “凌晨播放” album was a schedule placeholder; the feature
    // now has its own schedule manager, so keep that legacy row out of albums.
    const visibleAlbums = enriched.filter((album) => !(album.name === "凌晨播放" && album.tracks.length === 0));
    albums.value = visibleAlbums;
    if (!visibleAlbums.some((album) => Number(album.albumId) === Number(activeAlbumId.value))) {
      activeAlbumId.value = visibleAlbums[0]?.albumId ?? null;
    }
  } catch (e) {
    nuxtMsg("加载曲库失败", "error");
  } finally {
    albumLoading.value = false;
  }
}

async function loadPlayerState() {
  if (playerStateLoading.value) return;
  playerStateLoading.value = true;
  try {
    const data = await getJukeboxPlayer();
    applyPlayerState(data);
  } catch (err) {
    healthOk.value = false;
  } finally {
    playerStateLoading = false;
  }
}

async function refreshAll() {
  refreshing.value = true;
  await Promise.all([loadAll(), loadPlayerState(), scheduleDialogOpen.value ? loadSchedules() : Promise.resolve()]).catch(() => {});
  refreshing.value = false;
}

async function syncScheduleAndRefresh() {
  refreshing.value = true;
  try {
    const response = await syncBackendJukeboxSchedule();
    const syncResult = response?.data?.sync || response?.sync;
    if (syncResult?.ok === false) {
      throw new Error(syncResult.error || "播放端未响应");
    }
    await Promise.all([loadAll(), loadPlayerState(), scheduleDialogOpen.value ? loadSchedules() : Promise.resolve()]);
    const excludedScheduleCount = Number(syncResult?.excludedScheduleCount || 0);
    if (excludedScheduleCount > 0) {
      nuxtMsg(`已同步可播放计划；${excludedScheduleCount} 个计划仍需先导入本地音频`, "warning");
    } else {
      nuxtMsg("广播排期已同步", "success");
    }
  } catch (error) {
    await loadAll().catch(() => {});
    nuxtMsg(`播放器同步失败：${error?.message || "连接失败"}`, "warning");
  } finally {
    refreshing.value = false;
  }
}

// ── Diagnostics and Self-Healing ──
async function openHealthDiagnostics() {
  diagnosticsVisible.value = true;
  await fetchDiagnostics();
}
async function fetchDiagnostics() {
  diagnosticsLoading.value = true;
  try {
    const res = await getBackendJukeboxHealth();
    diagnosticsData.value = res.data || res || null;
  } catch {
    diagnosticsData.value = null;
    nuxtMsg("获取诊断信息失败", "error");
  } finally {
    diagnosticsLoading.value = false;
  }
}
// ── Actions ──
async function handlePlayAlbum(album, shuffle = false) {
  if (!album.tracks || !album.tracks.length) return;
  const unavailableCount = album.tracks.filter((track) => !isTrackReady(track)).length;
  const dataList = album.tracks.filter(isTrackReady);
  if (!dataList.length) {
    nuxtMsg("曲库还没有已同步的本地音频", "warning");
    return;
  }
  if (shuffle) {
    for (let i = dataList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [dataList[i], dataList[j]] = [dataList[j], dataList[i]];
    }
  }
  const songs = dataList.map((t) => ({
    trackId: t.trackId,
    mediaId: t.mediaId,
    sha256: t.mediaSha256,
    durationMs: t.mediaDurationMs,
    title: t.title,
    channelTitle: t.channel || "",
    thumbnail: t.thumbnail || "",
  }));
  try {
    const res = await playJukeboxSongImmediately({ song: songs[0], queue: songs.slice(1) });
    applyPlayerState(res);
    nuxtMsg(unavailableCount ? `已播放本地曲目；${unavailableCount} 首旧曲目需要导入本地音频` : "已开始播放专辑", unavailableCount ? "warning" : "success");
  } catch {
    nuxtMsg("专辑发起失败", "error");
  }
}

async function handleNextSong() {
  switchingNext.value = true;
  try {
    const data = await playNextSong();
    applyPlayerState(data);
  } catch (err) {
    nuxtMsg("切歌失败", "error");
  } finally {
    switchingNext.value = false;
  }
}

// Album actions (add, rename, delete)
async function handleAddAlbum() {
  try {
    const val = window.prompt("请输入专辑名称:");
    if (val === null) return;
    const name = val.trim();
    if (!name) return;
    await addAlbum({ name, sourceType: "manual", status: "0" });
    nuxtMsg("创建成功", "success");
    await loadAll();
  } catch {
    nuxtMsg("创建失败", "error");
  }
}

async function onAlbumCmd(cmd, album) {
  if (cmd === "rename") {
    renameTargetAlbum.value = album;
    renameName.value = album.name;
    renameDialog.value = true;
  } else if (cmd === "delete") {
    try {
      await nuxtConfirm(
        `确认要删除专辑 "${album.name}" 吗？此操作不可恢复！`,
        "警告",
        { type: "warning" },
      );
      await delAlbum(album.albumId);
      nuxtMsg("删除成功", "success");
      activeAlbumId.value = null;
      await loadAll();
    } catch (e) {
      if (e !== "cancel") nuxtMsg("删除失败", "error");
    }
  }
}

async function submitRename() {
  const name = renameName.value.trim();
  if (!name || !renameTargetAlbum.value) return;
  try {
    await updateAlbum({
      albumId: renameTargetAlbum.value.albumId,
      name: name,
      sourceType: renameTargetAlbum.value.sourceType || "manual",
      status: renameTargetAlbum.value.status || "0",
    });
    nuxtMsg("重命名成功", "success");
    renameDialog.value = false;
    await loadAll();
  } catch {
    nuxtMsg("重命名失败", "error");
  }
}

function createScheduleForm() {
  return {
    name: "凌晨播放",
    scheduleType: "daily",
    weekdays: [],
    startTime: "02:00",
    endTime: "",
    loop: "0",
    enabled: "0",
    albumIds: [],
    remark: "",
  };
}

function resetScheduleForm() {
  scheduleEditingId.value = null;
  scheduleForm.value = createScheduleForm();
}

async function openScheduleManager() {
  scheduleDialogOpen.value = true;
  resetScheduleForm();
  await Promise.all([loadAll(), loadSchedules()]);
}

async function loadSchedules() {
  scheduleLoading.value = true;
  try {
    const response = await listSchedule({ pageNum: 1, pageSize: 999 });
    const rows = Array.isArray(response)
      ? response
      : response?.rows || response?.data?.rows || response?.data || [];
    broadcastSchedules.value = rows.map((row) => ({
      ...row,
      scheduleId: Number(row.scheduleId),
      albumIds: Array.isArray(row.albumIds) ? row.albumIds.map(Number) : [],
      albumNames: Array.isArray(row.albumNames) ? row.albumNames : [],
      weekdays: String(row.weekdays || ""),
      enabled: String(row.enabled ?? "0"),
      loop: String(row.loop ?? "0"),
    }));
  } catch {
    nuxtMsg("读取凌晨播放排期失败", "error");
  } finally {
    scheduleLoading.value = false;
  }
}

function toggleScheduleWeekday(day) {
  const selected = new Set(scheduleForm.value.weekdays || []);
  if (selected.has(day)) selected.delete(day);
  else selected.add(day);
  scheduleForm.value.weekdays = [...selected].sort((left, right) => Number(left) - Number(right));
}

function toggleScheduleAlbum(albumId, checked) {
  const id = Number(albumId);
  const current = scheduleForm.value.albumIds || [];
  scheduleForm.value.albumIds = checked
    ? [...current.filter((value) => Number(value) !== id), id]
    : current.filter((value) => Number(value) !== id);
}

function albumReadyCount(album) {
  return (album?.tracks || []).filter(isTrackReady).length;
}

function scheduleDescription(plan) {
  const typeLabels = { daily: "每天", weekdays: "工作日", weekends: "周末" };
  const days = plan.scheduleType === "custom"
    ? String(plan.weekdays || "").split(",").filter(Boolean).map((day) => `周${weekdayOptions.find((item) => item.value === day)?.label || day}`).join("、")
    : typeLabels[plan.scheduleType] || "每天";
  const window = plan.endTime
    ? `${String(plan.startTime || "").slice(0, 5)}–${String(plan.endTime).slice(0, 5)}`
    : `${String(plan.startTime || "").slice(0, 5)} · 播放一轮`;
  return `${days} ${window}${plan.endTime && plan.loop === "1" ? " · 循环至截止" : ""}`;
}

function editSchedule(plan) {
  scheduleEditingId.value = Number(plan.scheduleId);
  scheduleForm.value = {
    name: plan.name || "凌晨播放",
    scheduleType: plan.scheduleType || "daily",
    weekdays: String(plan.weekdays || "").split(",").filter(Boolean),
    startTime: String(plan.startTime || "02:00").slice(0, 5),
    endTime: String(plan.endTime || "").slice(0, 5),
    loop: String(plan.loop ?? "0"),
    enabled: String(plan.enabled ?? "0"),
    albumIds: Array.isArray(plan.albumIds) ? plan.albumIds.map(Number) : [],
    remark: plan.remark || "",
  };
}

async function saveSchedule() {
  if (scheduleSaving.value) return;
  const form = scheduleForm.value;
  if (!form.albumIds.length) {
    nuxtMsg("请至少选择一张专辑", "warning");
    return;
  }
  if (form.scheduleType === "custom" && !form.weekdays.length) {
    nuxtMsg("自选星期至少选择一天", "warning");
    return;
  }
  scheduleSaving.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      albumIds: [...form.albumIds],
      scheduleType: form.scheduleType,
      weekdays: form.scheduleType === "custom" ? form.weekdays.join(",") : "",
      startTime: form.startTime,
      endTime: form.endTime || null,
      loop: form.loop,
      enabled: form.enabled,
      remark: form.remark,
    };
    if (scheduleEditingId.value) {
      await updateSchedule({ scheduleId: scheduleEditingId.value, ...payload });
    } else {
      await addSchedule(payload);
    }
    await loadSchedules();
    resetScheduleForm();
    nuxtMsg("凌晨播放排期已保存", "success");
  } catch (error) {
    nuxtMsg(error?.message || "保存排期失败", "error");
  } finally {
    scheduleSaving.value = false;
  }
}

async function toggleScheduleEnabled(plan, checked) {
  if (scheduleSaving.value) return;
  scheduleSaving.value = true;
  try {
    await toggleSchedule(Number(plan.scheduleId), checked ? "1" : "0");
    await loadSchedules();
    nuxtMsg(checked ? "凌晨播放排期已启用" : "凌晨播放排期已停用", "success");
  } catch (error) {
    await loadSchedules();
    nuxtMsg(error?.message || "更新排期状态失败", "error");
  } finally {
    scheduleSaving.value = false;
  }
}

async function deleteSchedule(plan) {
  if (scheduleSaving.value) return;
  try {
    await nuxtConfirm(`确认删除排期“${plan.name}”吗？`, "删除排期", { type: "warning" });
    scheduleSaving.value = true;
    await delSchedule(Number(plan.scheduleId));
    if (Number(scheduleEditingId.value) === Number(plan.scheduleId)) resetScheduleForm();
    await loadSchedules();
    nuxtMsg("排期已删除", "success");
  } catch (error) {
    if (error !== "cancel") nuxtMsg(error?.message || "删除排期失败", "error");
  } finally {
    scheduleSaving.value = false;
  }
}

async function removeTrack(album, track) {
  try {
    await delTrack(album.albumId, track.trackId);
    nuxtMsg("已从专辑中删除", "success");
    await refreshAlbumTracks(album);
  } catch {
    nuxtMsg("删除失败", "error");
  }
}

async function handleDeleteFolderGroup(folderName) {
  if (!activeAlbum.value) return;
  try {
    await nuxtConfirm(`确认要删除专辑 "${folderName}" 的全部歌曲吗？`, "警告", {
      type: "warning",
    });
    const response = await delTrackGroup(activeAlbum.value.albumId, folderName);
    const syncResult = response?.sync || response?.data?.sync;
    if (syncResult?.ok === false) {
      nuxtMsg("该专辑歌曲已删除，但播放器暂未同步", "warning");
    } else {
      nuxtMsg("整个目录已成功删除并同步", "success");
    }
    await refreshAlbumTracks(activeAlbum.value);
  } catch (e) {
    if (e !== "cancel") nuxtMsg("删除目录失败", "error");
  }
}

// ── Drag & Drop Folders ──

function onFolderDragStart(e, name) {
  draggedFolderName.value = name;
  e.dataTransfer.effectAllowed = "move";
}

function onFolderDragOver(e, name) {
  if (draggedFolderName.value && draggedFolderName.value !== name) {
    dragOverFolderName.value = name;
  }
}

function onFolderDragEnd() {
  draggedFolderName.value = "";
  dragOverFolderName.value = "";
}

async function onFolderDrop(e, targetName) {
  const sourceName = draggedFolderName.value;
  onFolderDragEnd();

  if (!sourceName || sourceName === targetName || !activeAlbum.value) return;

  // Move only the group headers. The tracks inside every group keep their order.
  const groups = groupedTracks.value.map((group) => ({
    name: group.name,
    tracks: [...group.tracks],
  }));
  const sourceIdx = groups.findIndex((g) => g.name === sourceName);
  const targetIdx = groups.findIndex((g) => g.name === targetName);

  if (sourceIdx === -1 || targetIdx === -1) return;

  const [moved] = groups.splice(sourceIdx, 1);
  groups.splice(sourceIdx < targetIdx ? targetIdx - 1 : targetIdx, 0, moved);

  const orderedTracks = groups.flatMap((group) => group.tracks);

  try {
    await reorderTracks(
      activeAlbum.value.albumId,
      orderedTracks.map((track, index) => ({
        trackId: track.trackId,
        sortOrder: index + 1,
      })),
    );
    await refreshAlbumTracks(activeAlbum.value);
    nuxtMsg("专辑目录顺序已更新", "success");
  } catch (err) {
    await refreshAlbumTracks(activeAlbum.value).catch(() => {});
    nuxtMsg("更新目录顺序失败：" + (err?.message || ""), "error");
  }
}

// ── Player controls ──

async function handlePlayTrackImmediately(track) {
  if (!isTrackReady(track)) {
    nuxtMsg("这首旧曲目需要先导入本地音频", "warning");
    return;
  }
  try {
    const allTracks = activeAlbum.value?.tracks || [];
    const trackIndex = allTracks.findIndex((t) => t.trackId === track.trackId);

    const song = {
      trackId: track.trackId,
      mediaId: track.mediaId,
      sha256: track.mediaSha256,
      durationMs: track.mediaDurationMs,
      title: track.title,
      channelTitle: track.channel || "",
      thumbnail: track.thumbnail || "",
    };
    const remainingTracks = allTracks.slice(trackIndex + 1).filter(isTrackReady).map((t) => ({
      trackId: t.trackId,
      mediaId: t.mediaId,
      sha256: t.mediaSha256,
      durationMs: t.mediaDurationMs,
      title: t.title,
      channelTitle: t.channel || "",
      thumbnail: t.thumbnail || "",
    }));

    const res = await playJukeboxSongImmediately({ song, queue: remainingTracks });
    applyPlayerState(res);
    nuxtMsg("已立即播放：" + track.title, "success");
  } catch {
    nuxtMsg("发起切歌指令失败", "error");
  }
}

async function handleVolumeChange(val = localVolume.value) {
  const volume = Math.max(0, Math.min(100, Number(val)));
  if (!Number.isFinite(volume)) return;
  localVolume.value = volume;
  try {
    const data = await setJukeboxVolume(volume);
    applyPlayerState(data);
  } catch {
    nuxtMsg("音量设置失败", "error");
  }
}

async function handleStopPlayback() {
  try {
    const data = await stopPlayback();
    applyPlayerState(data);
    nuxtMsg("已停止播放", "success");
  } catch {
    nuxtMsg("停止播放失败", "error");
  }
}

function toggleMute() {
  if (isMuted.value) {
    localVolume.value = preMuteVolume.value;
    isMuted.value = false;
    handleVolumeChange(localVolume.value);
  } else {
    preMuteVolume.value = localVolume.value;
    localVolume.value = 0;
    isMuted.value = true;
    handleVolumeChange(0);
  }
}

function toggleLyrics() {
  nuxtMsg("歌词同步功能开发中", "info");
}

async function togglePause() {
  try {
    const was = isPaused.value;
    const data = was ? await resumePlayback() : await pausePlayback();
    applyPlayerState(data);
    nuxtMsg(was ? "已继续播放" : "已暂停", "success");
  } catch (e) {
    nuxtMsg("操作失败", "error");
  }
}
function applyPlayerState(data) {
  const raw = data?.player || data?.data || data || {};
  const st = {
    ...defaultPlayerState,
    ...raw,
    current: raw.current || raw.nowPlaying || raw.song || null,
    queue: Array.isArray(raw.queue) ? raw.queue : [],
    elapsed: Number(raw.elapsed || 0),
    duration: Number(raw.duration || 0),
    paused: Boolean(raw.paused),
    volume: Number(raw.volume ?? defaultPlayerState.volume),
    prebuffer: raw.prebuffer || null,
  };
  playerState.value = st;
  nowPlaying.value = st.current;
  queue.value = (st.queue || []).filter(
    (s) =>
      s.status !== "playing" &&
      (st.current?.id ? s.id !== st.current.id : true),
  );
  healthOk.value = true;
}

onMounted(() => {
  refreshAll();
  pollTimer = window.setInterval(loadPlayerState, POLL_INTERVAL);
});
onBeforeUnmount(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<script>
// 消息提示桥接
function nuxtMsg(message, color = "neutral") {
  const toast = useToast();
  toast.add({ title: message, color });
}

function nuxtConfirm(content, title, options) {
  if (window.confirm(content)) {
    return Promise.resolve();
  } else {
    return Promise.reject("cancel");
  }
}
</script>

<style scoped>
/* 磨砂玻璃通用效果 */
.glass-panel {
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.4);
}

.glass-panel-light {
  background: rgba(255, 255, 255, 0.03);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

/* 霓虹背景发光球 */
.orb-1 {
  position: absolute;
  top: -50px;
  left: -50px;
  width: 350px;
  height: 350px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.18) 0%, rgba(59, 130, 246, 0) 70%);
  filter: blur(50px);
  pointer-events: none;
  z-index: 0;
}

.orb-2 {
  position: absolute;
  bottom: -100px;
  right: -50px;
  width: 450px;
  height: 450px;
  background: radial-gradient(circle, rgba(59, 130, 246, 0.12) 0%, rgba(59, 130, 246, 0) 70%);
  filter: blur(60px);
  pointer-events: none;
  z-index: 0;
}

/* 音频律动波形动画 */
.visualizer-container {
  display: flex;
  align-items: flex-end;
  gap: 2.5px;
  height: 14px;
}

.visualizer-bar {
  width: 2px;
  background: linear-gradient(to top, #3b82f6, #3b82f6);
  border-radius: 1px;
  height: 3px;
  transition: height 0.2s ease;
}

/* 播放状态下的律动 */
.visualizer-container.playing .visualizer-bar:nth-child(1) { animation: bounce-bar-1 0.8s infinite alternate 0.1s; }
.visualizer-container.playing .visualizer-bar:nth-child(2) { animation: bounce-bar-2 0.7s infinite alternate 0.3s; }
.visualizer-container.playing .visualizer-bar:nth-child(3) { animation: bounce-bar-3 0.9s infinite alternate 0.2s; }
.visualizer-container.playing .visualizer-bar:nth-child(4) { animation: bounce-bar-4 0.6s infinite alternate 0.4s; }
.visualizer-container.playing .visualizer-bar:nth-child(5) { animation: bounce-bar-5 0.8s infinite alternate 0.0s; }

@keyframes bounce-bar-1 { 0% { height: 3px; } 100% { height: 11px; } }
@keyframes bounce-bar-2 { 0% { height: 3px; } 100% { height: 14px; } }
@keyframes bounce-bar-3 { 0% { height: 3px; } 100% { height: 10px; } }
@keyframes bounce-bar-4 { 0% { height: 3px; } 100% { height: 13px; } }
@keyframes bounce-bar-5 { 0% { height: 3px; } 100% { height: 9px; } }

/* 蓝色风格音轨律动 */
.visualizer-container-primary {
  display: flex;
  align-items: flex-end;
  gap: 1.5px;
  height: 10px;
}

.vis-primary-bar {
  width: 1.5px;
  background: #3b82f6;
  border-radius: 0.5px;
  height: 2px;
}

.visualizer-container-primary .vis-primary-bar:nth-child(1) { animation: bounce-primary-1 0.6s infinite alternate 0.1s; }
.visualizer-container-primary .vis-primary-bar:nth-child(2) { animation: bounce-primary-2 0.7s infinite alternate 0.0s; }
.visualizer-container-primary .vis-primary-bar:nth-child(3) { animation: bounce-primary-3 0.5s infinite alternate 0.2s; }

@keyframes bounce-primary-1 { 0% { height: 2px; } 100% { height: 8px; } }
@keyframes bounce-primary-2 { 0% { height: 2px; } 100% { height: 10px; } }
@keyframes bounce-primary-3 { 0% { height: 2px; } 100% { height: 7px; } }

/* 慢速唱片旋转动效 */
.animate-spin-slow {
  animation: spin 15s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 音量滑动条重置 */
.volume-slider {
  -webkit-appearance: none;
  appearance: none;
  background: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
  height: 4px;
  outline: none;
  transition: all 0.2s;
}

.dark .volume-slider {
  background: rgba(255, 255, 255, 0.1);
}

.volume-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3b82f6;
  cursor: pointer;
  box-shadow: 0 0 6px #3b82f6;
  transition: transform 0.1s;
}

.volume-slider::-webkit-slider-thumb:hover {
  transform: scale(1.3);
}

/* Custom scrollbar for list containers */
.scrollbar-thin::-webkit-scrollbar {
  width: 4px;
  height: 4px;
}
.scrollbar-thin::-webkit-scrollbar-track {
  background: transparent;
}
.scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.15);
  border-radius: 2px;
}
.dark .scrollbar-thin::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
}
</style>
