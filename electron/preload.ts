import { contextBridge, ipcRenderer } from "electron";
import type { DesktopBridge } from "../src/desktop";

// The renderer only gets these three calls; the token itself is never sent back.
const bridge: DesktopBridge = {
  envCandidate: () => ipcRenderer.invoke("czu:envCandidate"),
  importEnvToken: () => ipcRenderer.invoke("czu:importEnvToken"),
  saveToken: (token) => ipcRenderer.invoke("czu:saveToken", token),
};

contextBridge.exposeInMainWorld("czuDesktop", bridge);
