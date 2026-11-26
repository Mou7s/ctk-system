import { defineAsyncComponent } from "vue";
import { download } from "@/utils/request";
import { useDict } from "@/utils/dict";
import {
  parseTime,
  resetForm,
  addDateRange,
  handleTree,
  selectDictLabel,
  selectDictLabels,
} from "@/utils/helpers";
import SvgIcon from "@/components/SvgIcon";
import elementIcons from "@/components/SvgIcon/svgicon";
import directive from "@/directive";
import plugins from "@/plugins";

const Pagination = defineAsyncComponent(() => import("@/components/Pagination/index.vue"));
const RightToolbar = defineAsyncComponent(() => import("@/components/RightToolbar/index.vue"));
const FileUpload = defineAsyncComponent(() => import("@/components/FileUpload/index.vue"));
const ImageUpload = defineAsyncComponent(() => import("@/components/ImageUpload/index.vue"));
const ImagePreview = defineAsyncComponent(() => import("@/components/ImagePreview/index.vue"));
const TreeSelect = defineAsyncComponent(() => import("@/components/TreeSelect/index.vue"));
const DictTag = defineAsyncComponent(() => import("@/components/DictTag/index.vue"));
const Editor = defineAsyncComponent(() => import("@/components/Editor/index.vue"));

export default defineNuxtPlugin((nuxtApp) => {
  const app = nuxtApp.vueApp;

  app.config.globalProperties.useDict = useDict;
  app.config.globalProperties.download = download;
  app.config.globalProperties.parseTime = parseTime;
  app.config.globalProperties.resetForm = resetForm;
  app.config.globalProperties.handleTree = handleTree;
  app.config.globalProperties.addDateRange = addDateRange;
  app.config.globalProperties.selectDictLabel = selectDictLabel;
  app.config.globalProperties.selectDictLabels = selectDictLabels;

  app.component("DictTag", DictTag);
  app.component("Pagination", Pagination);
  app.component("TreeSelect", TreeSelect);
  app.component("FileUpload", FileUpload);
  app.component("ImageUpload", ImageUpload);
  app.component("ImagePreview", ImagePreview);
  app.component("RightToolbar", RightToolbar);
  app.component("Editor", Editor);
  app.component("svg-icon", SvgIcon);

  app.use(elementIcons);
  app.use(plugins);
  directive(app);
});
