import { useRouter } from 'vue-router'
import useTagsViewStore from '@/store/modules/tagsView'

function getRouter() {
  return useRouter()
}

export default {
  refreshPage(obj) {
    const { path, query, matched } = getRouter().currentRoute.value;
    if (obj === undefined) {
      matched.forEach((m) => {
        if (m.components && m.components.default && m.components.default.name) {
          if (!['Layout', 'ParentView'].includes(m.components.default.name)) {
            obj = { name: m.components.default.name, path: path, query: query };
          }
        }
      });
    }
    return useTagsViewStore().delCachedView(obj).then(() => {
      const { path, query } = obj
      getRouter().replace({
        path: '/redirect' + path,
        query: query
      })
    })
  },
  closeOpenPage(obj) {
    useTagsViewStore().delView(getRouter().currentRoute.value);
    if (obj !== undefined) {
      return getRouter().push(obj);
    }
  },
  closePage(obj) {
    if (obj === undefined) {
      return useTagsViewStore().delView(getRouter().currentRoute.value).then(({ visitedViews }) => {
        const latestView = visitedViews.slice(-1)[0]
        if (latestView) {
          return getRouter().push(latestView.fullPath)
        }
        return getRouter().push('/');
      });
    }
    return useTagsViewStore().delView(obj);
  },
  closeAllPage() {
    return useTagsViewStore().delAllViews();
  },
  closeLeftPage(obj) {
    return useTagsViewStore().delLeftTags(obj || getRouter().currentRoute.value);
  },
  closeRightPage(obj) {
    return useTagsViewStore().delRightTags(obj || getRouter().currentRoute.value);
  },
  closeOtherPage(obj) {
    return useTagsViewStore().delOthersViews(obj || getRouter().currentRoute.value);
  },
  openPage(url) {
    return getRouter().push(url);
  },
  updatePage(obj) {
    return useTagsViewStore().updateVisitedView(obj);
  }
}