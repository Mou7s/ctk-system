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
import Pagination from "@/components/Pagination";
import RightToolbar from "@/components/RightToolbar";
import Editor from "@/components/Editor";
import FileUpload from "@/components/FileUpload";
import ImageUpload from "@/components/ImageUpload";
import ImagePreview from "@/components/ImagePreview";
import TreeSelect from "@/components/TreeSelect";
import DictTag from "@/components/DictTag";
import SvgIcon from "@/components/SvgIcon";
import elementIcons from "@/components/SvgIcon/svgicon";
import directive from "@/directive";
import plugins from "@/plugins";

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
