// @vitest-environment happy-dom
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import JukeboxPlayerBar from '../components/tk_custom/jukebox/JukeboxPlayerBar.vue'
import JukeboxTrackList from '../components/tk_custom/jukebox/JukeboxTrackList.vue'
import JukeboxScheduleTab from '../components/tk_custom/jukebox/JukeboxScheduleTab.vue'
import JukeboxQueueTab from '../components/tk_custom/jukebox/JukeboxQueueTab.vue'
import JukeboxDiagnosticsTab from '../components/tk_custom/jukebox/JukeboxDiagnosticsTab.vue'

globalThis.ref ??= ref
globalThis.reactive ??= reactive
globalThis.computed ??= computed
globalThis.watch ??= watch
globalThis.onMounted ??= onMounted
globalThis.onBeforeUnmount ??= onBeforeUnmount

const UI_STUBS = {
  UIcon: { props: ['name'], template: '<i :data-icon="name" />' },
  UBadge: { props: ['label', 'color'], template: '<span class="u-badge" :data-color="color"><slot>{{ label }}</slot></span>' },
  UButton: {
    props: ['label', 'icon', 'disabled', 'loading', 'ariaLabel'],
    emits: ['click'],
    template: '<button type="button" :disabled="disabled" :aria-label="ariaLabel" @click="$emit(\'click\', $event)"><slot>{{ label }}</slot></button>',
  },
  UTooltip: { props: ['text'], template: '<span :data-tooltip="text"><slot /></span>' },
  UProgress: { props: ['modelValue', 'max'], template: '<div class="u-progress" :data-value="modelValue" :data-max="max" />' },
  UAlert: { props: ['title', 'description', 'color'], template: '<div class="u-alert" :data-color="color"><strong>{{ title }}</strong><p>{{ description }}</p><slot name="actions" /><slot name="description" /></div>' },
  UCard: { template: '<div class="u-card"><div class="u-card-header"><slot name="header" /></div><slot /></div>' },
  UEmpty: { props: ['title', 'description'], template: '<div class="u-empty"><h4>{{ title }}</h4><p>{{ description }}</p><slot name="actions" /></div>' },
  USkeleton: { template: '<div class="u-skeleton" />' },
  UInput: {
    props: ['modelValue', 'placeholder', 'type'],
    emits: ['update:modelValue', 'keyup'],
    template: '<input :type="type || \'text\'" :value="modelValue" :placeholder="placeholder" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  USelect: {
    props: ['modelValue', 'items'],
    emits: ['update:modelValue'],
    template: '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in items || []" :key="item.value" :value="item.value">{{ item.label }}</option></select>',
  },
  UCheckbox: {
    props: ['modelValue', 'label', 'disabled'],
    emits: ['update:modelValue'],
    template: '<label><input type="checkbox" :checked="Boolean(modelValue)" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />{{ label }}</label>',
  },
  USwitch: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue'],
    template: '<input type="checkbox" role="switch" :checked="Boolean(modelValue)" :disabled="disabled" @change="$emit(\'update:modelValue\', $event.target.checked)" />',
  },
  USlider: {
    props: ['modelValue', 'disabled'],
    emits: ['update:modelValue', 'change'],
    template: '<input type="range" :value="modelValue" :disabled="disabled" @input="$emit(\'update:modelValue\', Number($event.target.value))" @change="$emit(\'change\', $event)" />',
  },
  UModal: {
    props: ['open', 'title'],
    template: '<div v-if="open" class="u-modal"><h3>{{ title }}</h3><slot name="body" /><slot name="footer" /></div>',
  },
  USlideover: {
    props: ['open', 'title'],
    template: '<div v-if="open" class="u-slideover"><h3>{{ title }}</h3><slot name="body" /><slot name="footer" /></div>',
  },
  UForm: { template: '<form><slot /></form>' },
  UFormField: { props: ['label'], template: '<div><label>{{ label }}</label><slot /></div>' },
  UFileUpload: { props: ['modelValue'], template: '<div class="u-file-upload" />' },
  UDropdownMenu: { template: '<span><slot /></span>' },
}

describe('Jukebox UI components behavior', () => {
  it('renders live playback state, syncs server volume, and enforces canPlay in JukeboxPlayerBar', async () => {
    const wrapper = mount(JukeboxPlayerBar, {
      props: {
        playerState: {
          status: 'playing',
          paused: false,
          elapsed: 65,
          duration: 200,
          volume: 45,
          current: { title: '晨间进行曲', channelTitle: '厂区广播', scheduleId: 2 },
          queue: [{ id: 11, title: '下一首' }],
          schedule: { activeScheduleId: 2 },
        },
        activeScheduleName: '凌晨播放',
        healthOk: true,
        canPlay: true,
        canSchedule: true,
        hasReadyAlbum: true,
      },
      global: { stubs: UI_STUBS },
    })

    expect(wrapper.text()).toContain('正在播音')
    expect(wrapper.text()).toContain('排期 · 凌晨播放')
    expect(wrapper.text()).toContain('晨间进行曲')
    expect(wrapper.text()).toContain('1:05 / 3:20')
    expect(wrapper.text()).toContain('45%')

    await wrapper.find('button[aria-label="下一首"]').trigger('click')
    expect(wrapper.emitted('next')).toHaveLength(1)

    await wrapper.setProps({ canPlay: false })
    expect(wrapper.find('button[aria-label="下一首"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('button[aria-label="静音"]').attributes('disabled')).toBeDefined()
  })

  it('filters tracks by status and emits updated sortOrder on single-track move in JukeboxTrackList', async () => {
    const album = {
      albumId: 7,
      name: '早班曲库',
      tracks: [
        {
          trackId: 101,
          title: '歌曲A',
          channel: '轻音乐',
          mediaId: 1,
          mediaSyncStatus: 'ready',
          mediaSha256: 'sha1',
          playerSha256: 'sha1',
          mediaDurationMs: 120_000,
        },
        {
          trackId: 102,
          title: '歌曲B',
          channel: '轻音乐',
          mediaId: 2,
          mediaSyncStatus: 'ready',
          mediaSha256: 'sha2',
          playerSha256: 'sha2',
          mediaDurationMs: 180_000,
        },
        {
          trackId: 103,
          title: '旧YouTube曲目',
          mediaId: null,
          duration: 90,
        },
      ],
    }

    const wrapper = mount(JukeboxTrackList, {
      props: {
        album,
        canPlay: true,
        canManage: true,
      },
      global: { stubs: UI_STUBS },
    })

    expect(wrapper.text()).toContain('共 3 首')
    expect(wrapper.text()).toContain('已就绪 2 首')
    expect(wrapper.text()).toContain('缺本地音频 1 首')

    // 点击第一行的「下移」按钮，重排整张专辑单曲顺序
    const moveDownButtons = wrapper.findAll('button[aria-label="下移"]')
    expect(moveDownButtons.length).toBeGreaterThan(0)
    await moveDownButtons[0].trigger('click')
    expect(wrapper.emitted('reorder-tracks')?.[0]?.[0]).toEqual([
      { trackId: 102, sortOrder: 1 },
      { trackId: 101, sortOrder: 2 },
      { trackId: 103, sortOrder: 3 },
    ])

    // 切换到「缺本地音频」过滤后只显示旧曲目
    const filterBtn = wrapper.findAll('button').find((btn) => btn.text().includes('缺本地音频'))
    await filterBtn.trigger('click')
    expect(wrapper.text()).toContain('旧YouTube曲目')
    expect(wrapper.text()).not.toContain('歌曲A')
  })

  it('displays running schedule badge, unready album alert, and slideover editor in JukeboxScheduleTab', async () => {
    const albums = [
      {
        albumId: 1,
        name: '已就绪专辑',
        tracks: [{ trackId: 1, mediaId: 10, mediaSyncStatus: 'ready', mediaSha256: 'a', playerSha256: 'a', mediaDurationMs: 180_000 }],
      },
      {
        albumId: 2,
        name: '未完成专辑',
        tracks: [{ trackId: 2, mediaId: null, duration: 60 }],
      },
    ]
    const schedules = [
      {
        scheduleId: 9,
        name: '凌晨播放',
        scheduleType: 'daily',
        startTime: '02:00',
        endTime: '04:00',
        loop: '1',
        enabled: '1',
        albumIds: [1, 2],
        albumNames: ['已就绪专辑', '未完成专辑'],
      },
    ]

    const wrapper = mount(JukeboxScheduleTab, {
      props: {
        schedules,
        albums,
        activeScheduleId: 9,
        canSchedule: true,
      },
      global: { stubs: UI_STUBS },
    })

    expect(wrapper.text()).toContain('正在播音中')
    expect(wrapper.text()).toContain('1. 已就绪专辑')
    expect(wrapper.text()).toContain('2. 未完成专辑')
    expect(wrapper.text()).toContain('未完成专辑')

    const createBtn = wrapper.findAll('button').find((btn) => btn.text().includes('新建排期'))
    await createBtn.trigger('click')
    expect(wrapper.find('.u-slideover').exists()).toBe(true)
  })

  it('renders duplicate queue entries safely and emits remove/enqueue events in JukeboxQueueTab', async () => {
    const wrapper = mount(JukeboxQueueTab, {
      props: {
        playerState: {
          status: 'playing',
          paused: false,
          elapsed: 10,
          duration: 100,
          current: { id: 1, title: '当前播放', duration: 100 },
          queue: [
            { id: 1, title: '当前播放', duration: 100, requestedBy: 'admin' },
            { id: 2, title: '队列二', duration: 120 },
          ],
        },
        activeAlbum: {
          albumId: 1,
          name: '早会曲库',
          tracks: [
            { trackId: 5, title: '可播曲目', mediaId: 50, mediaSyncStatus: 'ready', mediaSha256: 'x', playerSha256: 'x', mediaDurationMs: 60_000 },
          ],
        },
        canPlay: true,
      },
      global: { stubs: UI_STUBS },
    })

    expect(wrapper.text()).toContain('2 首')
    expect(wrapper.text()).toContain('队列二')

    const removeButtons = wrapper.findAll('button[aria-label="移出队列"]')
    await removeButtons[1].trigger('click')
    expect(wrapper.emitted('remove-item')?.[0]?.[0]).toMatchObject({ id: 2, title: '队列二' })

    const enqueueBtn = wrapper.findAll('button').find((btn) => btn.text().includes('入队'))
    await enqueueBtn.trigger('click')
    expect(wrapper.emitted('enqueue-track')?.[0]?.[0]).toMatchObject({ trackId: 5 })
  })

  it('guards diagnostics view by permission and renders recentErrors newest-first in JukeboxDiagnosticsTab', () => {
    const forbidden = mount(JukeboxDiagnosticsTab, {
      props: { canDiagnostics: false },
      global: { stubs: UI_STUBS },
    })
    expect(forbidden.text()).toContain('tk_custom:jukebox:diagnostics')

    const allowed = mount(JukeboxDiagnosticsTab, {
      props: {
        canDiagnostics: true,
        canManage: true,
        data: {
          api: { status: 'up', url: 'embedded://ctk-system' },
          service: { status: 'up' },
          player: { status: 'idle', elapsed: 0, duration: 0 },
          schedule: { status: 'synced', planVersion: 12, scheduleCount: 2, timezone: 'Asia/Shanghai', syncedAt: '2026-11-17T08:00:00+08:00' },
          media: { mediaCount: 8, sync: { status: 'available', ready: 7, pending: 1, failed: 0, unknown: 0 } },
          recentErrors: [
            { at: '2026-11-17T01:00:00+08:00', scheduleId: 1, message: '较早异常' },
            { at: '2026-11-17T02:00:00+08:00', scheduleId: 2, message: '最新异常' },
          ],
        },
      },
      global: { stubs: UI_STUBS },
    })

    expect(allowed.text()).toContain('embedded://ctk-system')
    expect(allowed.text()).toContain('重试同步异常媒体 (1)')
    const text = allowed.text()
    expect(text.indexOf('最新异常')).toBeLessThan(text.indexOf('较早异常'))
  })
})
