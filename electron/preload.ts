import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { DesktopBridge, DesktopSection } from "../src/desktop";

// The renderer only gets these calls; the Notion token itself is never sent back.
const bridge: DesktopBridge = {
  envCandidate: () => ipcRenderer.invoke("czu:envCandidate"),
  importEnvToken: () => ipcRenderer.invoke("czu:importEnvToken"),
  saveToken: (token) => ipcRenderer.invoke("czu:saveToken", token),
  getSettings: () => ipcRenderer.invoke("czu:getSettings"),
  saveSettings: (settings) => ipcRenderer.invoke("czu:saveSettings", settings),
  testNotification: () => ipcRenderer.invoke("czu:testNotification"),
  openNotificationSettings: () => ipcRenderer.invoke("czu:openNotificationSettings"),
  reportDueCount: (n) => ipcRenderer.send("czu:dueCount", n),
  onNavigate: (cb) => {
    const listener = (_e: IpcRendererEvent, section: DesktopSection) => {
      if (section === "dnes" || section === "nastaveni") cb(section);
    };
    ipcRenderer.on("czu:navigate", listener);
    return () => void ipcRenderer.removeListener("czu:navigate", listener);
  },
  prefGet: (key) => ipcRenderer.invoke("czu:prefGet", key),
  prefSet: (key, value) => ipcRenderer.invoke("czu:prefSet", key, value),
};

contextBridge.exposeInMainWorld("czuDesktop", bridge);
