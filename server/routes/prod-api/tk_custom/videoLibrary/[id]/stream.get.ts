import { streamVideo } from '../../../../../utils/video-read'

export default defineEventHandler((event) => streamVideo(event, 'stream'))
