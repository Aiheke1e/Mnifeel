import { onBeforeRouteLeave } from "vue-router";
import { ElMessage, ElMessageBox } from "element-plus";
import { apiErrorMessage } from "@/lib/api";

export function useProjectSaveGuard(options: {
  isBusy(): boolean;
  flushSave(): Promise<void>;
  cancelSave(): void;
}) {
  onBeforeRouteLeave(async () => {
    if (options.isBusy()) {
      ElMessage.warning("项目内容仍在生成，请稍后退出");
      return false;
    }
    try {
      await options.flushSave();
      return true;
    } catch (error) {
      const message = apiErrorMessage(error, "项目保存失败");
      const leave = await ElMessageBox.confirm(
        `无法保存项目：${message}。仍然退出将丢弃尚未保存的修改。`,
        "项目未保存",
        {
          type: "warning",
          confirmButtonText: "仍然退出",
          cancelButtonText: "留在项目",
          closeOnClickModal: false,
        },
      ).then(() => true, () => false);
      if (leave) options.cancelSave();
      return leave;
    }
  });
}
